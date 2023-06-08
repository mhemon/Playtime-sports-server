const express = require('express')
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express()
// const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
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


const { MongoClient, ServerApiVersion } = require('mongodb');
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
        await client.connect();


        const usersCollection = client.db("playTimeSports").collection('users');
        const classesCollection = client.db("playTimeSports").collection('classes');
        const instructorsCollection = client.db("playTimeSports").collection('instructors');
        const cartCollection = client.db("playTimeSports").collection('carts');

        //jwt code
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, { expiresIn: '1h' });
            res.send({ token })
        })

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

        // get active class from db
        app.get('/classes', async (req, res) => {
            const query = { status: "active" };
            const result = await classesCollection.find(query).toArray()
            res.send(result)
        })

        // get instructors list from db
        app.get('/instructors', async (req, res) => {
            const result = await instructorsCollection.find().toArray()
            res.send(result)
        })

        // carts related api
        app.post('/carts', async (req, res) => {
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

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query)
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
