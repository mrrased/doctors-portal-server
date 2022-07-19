const express = require('express')
const app = express()
const cors = require('cors');
const ObjectId = require('mongodb').ObjectId;
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const port =process.env.PORT || 5000;
const fileUpload = require('express-fileupload');


app.use(cors());
app.use(express.json());
app.use(fileUpload());




const stripe = require("stripe")(`${process.env.STRIPE_SECRET}`);

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// console.log(serviceAccount);
// console.log(serviceAccount);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.get('/', (req, res) => res.send('Doctors Portal!'))

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zingp.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
// console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function verifyToken(req, res, next){
    if(req.headers?.authorization?.startsWith('Bearer ')){
        const token = req.headers.authorization.split(' ')[1]

        try{
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch{

        }
    }
    
    next();
}

async function run() {
    try {
      await client.connect();
      const database = client.db("doctors_portal");
      const appointmentCollection = database.collection("appointment");
      const usersCollection = database.collection("users");
      const doctorsCollection = database.collection("doctors");

        //Get Appointment data   
        app.get('/appointment',verifyToken, async(req, res)=>{
            const email = req.query.email;
            const date = new Date(req.query.date).toLocaleDateString();
            // console.log(date);
            const query = { email: email , date: date}
            const curser = appointmentCollection.find(query);
            const appointments = await curser.toArray();
            res.json(appointments);
        });
        // GET ALL DOCTORS
        app.get('/doctors', async(req, res)=>{
            const curser = doctorsCollection.find({});
            const doctors = await curser.toArray();
            res.json(doctors);
        })
        // GET And Check Admin
        app.get('/users/:email', async(req, res)=>{
            const email = req.params.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if(user?.role === 'admin'){
                isAdmin = true;
            }
            res.json({admin: isAdmin});
            
        })
        // GET APPOINTMENT ID
        app.get('/appointment/:id',  async(req, res)=>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)}
            const result = await appointmentCollection.findOne(query);
            res.json(result);
        })
        // create a document to insert
        app.post('/appointment', async(req, res)=>{
            const appointment = req.body;
            const result = await appointmentCollection.insertOne(appointment);
            res.json(result);
        });

        // Create post and saved Document inside Database
        app.post('/users', async(req, res)=>{
            const users = req.body;
            const result = await usersCollection.insertOne(users);
            // console.log(result);
            res.json(result);
        })
        // 
        app.put('/users', async(req, res)=>{
            const user = req.body;
            const filter = {email: user.email};
            // console.log(filter);
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);
        })
        // Make Admin role
        app.put('/users/admin',verifyToken, async(req, res) =>{
            const user = req.body;
            const requester = req.decodedEmail;
            if(requester){
                const requesterAccount = await usersCollection.findOne({email: requester})
                if(requesterAccount.role === 'admin'){
                    const filter = {email: user.email};
                    const updateDoc = {$set: {role: 'admin'}};
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else{
                res.status(403).json({message: 'You do not have access to make admin'})
            }
            
        });
        // Saved To file inside Database
        app.post('/doctors', async(req, res)=>{
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.image;
            const picData = pic.data;
            const encodedPic = picData.toString('base64');
            const imageBuffer = Buffer.from(encodedPic, 'base64');
            const doctor ={
                name, 
                email,
                image: imageBuffer 
            }
        const result = await doctorsCollection.insertOne(doctor)

            res.json(result);
        })
        // payment create 
        app.post("/create-payment-intent", async (req, res) =>{
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types:['card'] 
            });
            res.json({clientSecret: paymentIntent.client_secret})
        }); 
        // ADD TO PAYMENT SERVER SIDE
        app.put('/appointment/:id', async(req, res)=>{
            const id = req.params.id;
            const payment = req.body;
            // console.log('body',req.body)
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set:{
                    payment: payment
                }
            };
            const result = await appointmentCollection.updateOne(filter, updateDoc);
            
            res.json(result);
        })
      
    } finally {
    //   await client.close();
    }
  }
  run().catch(console.dir);

app.listen(port, () => console.log(`listening on port ${port}!`))