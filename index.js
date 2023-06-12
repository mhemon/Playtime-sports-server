const express = require('express')
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000

// middleware
app.use(cors())
app.use(express.json())


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access!' })
    }
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(403).send({ error: true, message: 'unauthorized access!' })
        }
        req.decoded = decoded
        next();
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { default: Stripe } = require('stripe');
const req = require('express/lib/request');
const res = require('express/lib/response');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ntvgsob.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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
        // remember to remove await for solve vercel deploy problem
        client.connect();

        const usersCollection = client.db("playTimeSports").collection('users');
        const classesCollection = client.db("playTimeSports").collection('classes');
        const cartCollection = client.db("playTimeSports").collection('carts');
        const paymentCollection = client.db("playTimeSports").collection('payments');
        const funFactsCollection = client.db("playTimeSports").collection('funFactsData');

        //jwt code
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, { expiresIn: '1h' });
            res.send({ token })
        })

        //verify admin for security
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access!' })
            }
            next();
        }

        //verify instructor for security
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden access!' })
            }
            next();
        }

        //  create users
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user already exist!' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        // get approved class from db
        // public data
        app.get('/classes', async (req, res) => {
            const query = { status: "approved" };
            const result = await classesCollection.find(query).toArray()
            res.send(result)
        })

        // popular classes based on enroll student
        // this routes has to be in public access
        app.get('/popular-classes', async (req, res) => {
            const query = { status: "approved" };
            const result = await classesCollection.find(query).sort({ enrolled: -1 }).limit(6).toArray();
            res.send(result);
        });

        // this routes has to be in public access
        app.get('/popular-instructor', async (req, res) => {
            const query = { role: "instructor" };
            const result = await usersCollection.find(query).limit(6).toArray();
            res.send(result);
        });

        // fun facts
        // public data
        app.get('/facts', async (req, res) => {
            const result = await funFactsCollection.find().toArray()
            res.send(result)
        })



        // get all class for admin
        app.get('/all-classes', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classesCollection.find().toArray()
            res.send(result)
        })

        // class status update approved for admin
        app.patch('/classes-approved/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    status: 'approved'
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        // class status deny for admin
        app.patch('/classes-denied/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    status: 'denied'
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        // class update when payment complete increase enroll and decrease available seat
        app.patch('/classes-update-enroll', verifyJWT, async (req, res) => {
            const _ids = req.body.map(id => new ObjectId(id));
            try {
                const updatedClasses = await classesCollection.updateMany(
                    { _id: { $in: _ids } },
                    { $inc: { enrolled: 1, available_seats: -1 } }
                );
                res.send(updatedClasses);
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'Server Error' });
            }
        })

        // add feedback from admin to instructor
        app.patch('/add-feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const feedback = req.body.feedback
            const updateDoc = {
                $set: {
                    feedback: feedback
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        // get myclasss for Instructor
        app.get('/myclass', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await classesCollection.find(query).toArray()
            res.send(result)
        })


        // add a new class by instructor
        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newClass = req.body
            const result = await classesCollection.insertOne(newClass)
            res.send(result)
        })

        // get instructors list from db
        // public data
        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' }
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })

        // carts related api
        app.post('/carts', verifyJWT, async (req, res) => {
            const cart = req.body
            const result = await cartCollection.insertOne(cart)
            res.send(result)
        })

        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email
            if (!email) {
                res.send([])
            }
            const decoded = req.decoded
            if (decoded.email !== req.query.email) {
                return res.status(403).send({ error: true, message: 'forbidden access!' })
            }
            const cursor = cartCollection.find({ "email": email });
            const result = await cursor.toArray();
            res.send(result)
        })

        app.delete('/carts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })

        // payment related routes

        // create payment intent
        // verifyJWT check that request comes from our user.
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related api
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);
            const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
            const deleteResult = await cartCollection.deleteMany(query)
            res.send({ insertResult, deleteResult });
        })

        app.get('/payments-history', verifyJWT, async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const options = {
                sort: { date: -1 }
            };
            const result = await paymentCollection.find(query, options).toArray()
            res.send(result)
        })

        //enrolled class information from payment collection
        app.get('/enrolled-classes', verifyJWT, async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const options = {
                projection: { _id: 1, classImage: 1, classNames: 1, date: 1, classItemID: 1 },
            };
            const result = await paymentCollection.find(query, options).toArray()
            res.send(result)
        })

        // admin routes
        // get all users
        app.get('/manage-users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        // check admin
        app.get('/check-admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                res.send({ admin: false })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            const result = { admin: user?.role === 'admin' }
            res.send(result)
        })

        // make admin
        app.patch('/update-users-admin', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.query.email
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })
        // make instructor
        app.patch('/update-users-instructor', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.query.email
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        // check Instructor
        app.get('/check-instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                res.send({ instructor: false })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            const result = { instructor: user?.role === 'instructor' }
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Playtime server is playing........')
})

app.listen(port, () => {
    console.log(`Playtime listening on port ${port}`)
})
