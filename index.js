const express = require('express');
const cors = require('cors');
const axios = require("axios");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
const endpoint = "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"

const store_id = process.env.SSL_STORE_ID;
const store_passwd = process.env.SSL_STORE_PASS;



app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173"
}));
app.use(express.urlencoded({ extended: true }))
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yhwb0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});





async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    

    const database = client.db('pet-haven');
    const petlistCollection = database.collection('pet-list');
    const adoptCollection = database.collection('adopt');
    const donationcampaignsCollection = database.collection('donationcampaigns');
    const donationCollection = database.collection('donation');
    const userCollection = database.collection('user');



    app.post("/api/payment", async (req, res) => {

      try {

        const { amount, name, email, phone, campaignId, petImage, petName } = req.body;

        
        if (!amount || Number(amount) <= 0) {
          console.log("Invalid amount:", amount);
          return res.status(400).json({ error: "Invalid amount" });
        }

      
        const tran_id = new ObjectId().toString();

       
        const paymentData = {
          store_id,
          store_passwd,
          total_amount: amount,
          currency: "BDT",
          tran_id,
          success_url: `http://localhost:5000/api/payment/success`,
          fail_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/fail`,
          cancel_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/donationcampaigns`,
          ipn_url: `http://localhost:5173/ipn-success-payment`,
          emi_option: 0,
          cus_name: name || "Anonymous Donor",
          cus_email: email || "donor@example.com",
          cus_phone: "01707226784",
          cus_add1: "Dhaka",
          cus_city: "Dhaka",
          cus_country: "Bangladesh",
          shipping_method: "NO",
          product_name: "Donation",
          product_category: "Charity",
          product_profile: "non-physical-goods",
        };


        // console.log("Payment payload:", paymentData);

      
        const sslResponse = await axios.post(endpoint, paymentData, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },

        });

        // console.log("SSLCOMMERZ response data:", sslResponse.data);

       
        if (sslResponse.data && sslResponse.data.GatewayPageURL) {
          // console.log("GatewayPageURL found:", sslResponse.data.GatewayPageURL);

          await donationCollection.insertOne({
            tran_id,
            amount,
            name,
            email,
            phone,
            campaignId,
            petImage,
            petName,
            status: "pending",
            createdAt: new Date(),
          })

          return res.json({ url: sslResponse.data.GatewayPageURL, tran_id });
        } else {
          console.error("No GatewayPageURL in SSLCOMMERZ response", sslResponse.data);
          return res.status(500).json({ error: "No GatewayPageURL", details: sslResponse.data });
        }
      } catch (err) {
        console.error("Error creating payment session:", err.response?.data || err.message);
        
        return res.status(500).json({ error: "payment creation failed", details: err.response?.data || err.message });
      }
    });





    app.post('/api/payment/success', async (req, res) => {
      const { tran_id, val_id } = req.body;



      if (!tran_id || !val_id) {
        return res.status(400).send("Missing tran_id or val_id");
      }

      try {
        
        const validationRes = await axios.get(
          `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php`,
          {
            params: {
              val_id,
              store_id: process.env.SSL_STORE_ID,
              store_passwd: process.env.SSL_STORE_PASS,
              format: "json",
            },
          }
        );

        const validation = validationRes.data;


        if (validation.status === "VALID" || validation.status === "VALIDATED") {
          
          const donation = await donationCollection.findOneAndUpdate(
            { tran_id },
            {
              $set: {
                status: "success",
                val_id,

                card_type: validation.card_type,

                updatedAt: new Date(),
              }
            },
            { returnDocument: "after" }
          );





         
          await donationcampaignsCollection.updateOne(
            { _id: new ObjectId(donation.campaignId) },
            { $inc: { donatedAmount: parseFloat(donation.amount) } }
          );


         
          return res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/success`);
        }
        else {
         
          await donationCollection.updateOne(
            { tran_id },
            { $set: { status: "failed", updatedAt: new Date() } }
          );
          return res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/fail`);
        }
      } catch (err) {
        console.error("Validation error:", err.message);
        return res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/fail`);
      }
    });



    app.get('/pet-list', async (req, res) => {
      try {
        const petlist = await petlistCollection.find().toArray();

        res.send(petlist);
      }
      catch (error) {
        res.status(500).send({ message: "Error fetching petlist" });
      }
    });

    app.get('/pet-list/:id', async (req, res) => {

      const { id } = req.params;
      try {
        const pet = await petlistCollection.findOne({ _id: new ObjectId(id) });
        res.send(pet);
      } catch (error) {
        console.error('Error fetching pet by ID:', error);
        res.status(500).send({ message: "Error fetching petlist" });
      }
    });


    app.get('/pet-list-email', async (req, res) => {
      const email = req.query.email;


      if (!email || email === 'undefined') {
        return res.status(400).send({ error: 'Valid email is required' });
      }

      try {
        const pets = await petlistCollection.find({ userEmail: email }).toArray();
        res.send(pets);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch pets' });
      }
    });



    app.post('/adopt', async (req, res) => {
      const data = req.body;
      const result = await adoptCollection.insertOne(data);
      res.send(result);
    });


    app.post('/pet-list', async (req, res) => {
      try {
        const petData = req.body;
        const result = await petlistCollection.insertOne(petData);

        res.status(201).send({
          message: "Pet added successfully",
          insertedId: result.insertedId
        });
      } catch (error) {
        console.error("Error adding pet:", error);
        res.status(500).send({ message: "Failed to add pet" });
      }
    });



    app.patch('/pet-list/:id', async (req, res) => {
      const { id } = req.params;
      const updatedData = { ...req.body };


      delete updatedData._id;

      try {
        const result = await petlistCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'Pet not found' });
        }

        res.json({ message: 'Pet updated successfully' });
      } catch (error) {
        console.error('Error updating pet:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });
    
    // get all pets for admin
    app.get('/petlist', async (req, res) => {
      try {
        const pets = await petlistCollection.find().toArray();
        res.send(pets);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch pets' });
      }
    });

    app.delete('/petlist/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await petlistCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to delete pet' });
      }
    });

    app.patch('/petlist/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updateFields = req.body;

        const result = await petlistCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to update pet' });
      }
    });






    // remove a pet 
    app.delete('/pet-list/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await petlistCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Pet not found or already deleted' });
        }

        res.send({ message: 'Pet deleted successfully' });
      } catch (error) {
        console.error('Error deleting pet:', error);
        res.status(500).send({ message: 'Failed to delete pet' });
      }
    });


    app.delete("/adopt-request/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await adoptCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Request not found" });
        }

        res.send({ success: true, message: "Request deleted successfully" });
      } catch (error) {
        console.error("Error deleting request:", error);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });



    app.post('/donation-campaign', async (req, res) => {
      try {
        const campaign = req.body;
        campaign.createdAt = new Date();
        const result = await donationcampaignsCollection.insertOne(campaign);
        res.status(201).send({ message: 'Donation campaign created', insertedId: result.insertedId });
      } catch (error) {
        console.error('Error creating campaign:', error);
        res.status(500).send({ message: 'Failed to create donation campaign' });
      }
    });

    app.get('/donation-campaign', async (req, res) => {
      try {
        const campaign = await donationcampaignsCollection.find().toArray();
        res.send(campaign);
      }
      catch (error) {
        res.status(500).send({ message: "Error fetching petlist" });
      }
    });


    // Get donation campaign details by ID
    app.get('/donation-campaign/:id', async (req, res) => {
      const id = req.params.id;
      const campaign = await donationcampaignsCollection.findOne({ _id: new ObjectId(id) });
      res.send(campaign);
    });






    // get donations
    app.get('/donation-campaigns', async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: 'Email is required' });

      try {
        const campaigns = await donationcampaignsCollection.find({ userEmail: email }).toArray();
        res.send(campaigns);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch donation campaigns' });
      }
    });


    // GET /donators/:campaignId
    app.get('/donations/:campaignId', async (req, res) => {
      const { campaignId } = req.params;

      try {
        const donations = await donationCollection
          .find({ campaignId: campaignId })
          .project({ email: 1, amount: 1, _id: 0 })
          .toArray();

        res.send(donations);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch donators' });
      }
    });



    // for edit donation page
    app.get('/donation-campaigns/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const campaign = await donationcampaignsCollection.findOne({ _id: new ObjectId(id) });
        res.send(campaign);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch donation campaign' });
      }
    });
    // edit amount and pause condition 
    app.patch('/donation-campaigns/:id', async (req, res) => {
      const { id } = req.params;
      const { maxAmount, paused } = req.body;

      try {
        const result = await donationcampaignsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { maxAmount, paused } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to update donation campaign' });
      }
    });


    app.get('/donations', async (req, res) => {
      const email = req.query.email;
      try {
        const donations = await donationCollection.find({ email: email }).toArray();
        res.send(donations);
      } catch (err) {
        console.error('Error fetching donations:', err);
        res.status(500).send({ message: 'Server error' });
      }
    });


    app.get('/adopt', async (req, res) => {
      const { ownerEmail } = req.query;
      try {
        const requests = await adoptCollection.find({ ownerEmail }).toArray();
        res.send(requests);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching adoption requests' });
      }
    });

    app.patch('/adopt/:id', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      try {
        const result = await adoptCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount === 1) {
          res.send({ success: true, message: "Status updated successfully" });
        } else {
          res.status(404).send({ success: false, message: "Adoption request not found or already up-to-date" });
        }
      } catch (error) {
        console.error("Error updating adoption status:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // all users

    app.post('/users', async (req, res) => {
      const { email, name, image, phone, city, country } = req.body;
      const existingUser = await userCollection.findOne({ email });

      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const newUser = {
        name,
        email,
        phone,
        city,
        country,
        image: image || null,
        role: 'user',
        createdAt: new Date()
      };

      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });


    app.get('/users', async (req, res) => {
      try {
        const user = await userCollection.find().toArray();
        res.send(user);
      }
      catch (error) {
        res.status(500).send({ success: false, message: "Can't get users" });
      }
    });

    app.put('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });


    // demote user from admin
    app.put("/users/remove-admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: "user" }
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });



    
    app.get('/donationcampaigns', async (req, res) => {
      const result = await donationcampaignsCollection.find().toArray();
      res.send(result);
    });

    
    app.delete('/donationcampaigns/:id', async (req, res) => {
      const id = req.params.id;
      const result = await donationcampaignsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

   
    app.patch('/donationcampaigns/:id', async (req, res) => {
      const id = req.params.id;
      const {
        petName,
        petImage,
        maxAmount,
        deadline,
        userEmail,
        
        description,
        status,
      } = req.body;

      const updateDoc = { $set: {} };
      if (petName) updateDoc.$set.petName = petName;
      if (petImage) updateDoc.$set.petImage = petImage;
      if (maxAmount) updateDoc.$set.maxAmount = maxAmount;
      if (deadline) updateDoc.$set.deadline = deadline;
      if (userEmail) updateDoc.$set.userEmail = userEmail;
      
      if (description) updateDoc.$set.description = description;
      if (status) updateDoc.$set.status = status;

      const result = await donationcampaignsCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );
      res.send(result);
    });



























    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Welcome to the Pet Haven server side');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
