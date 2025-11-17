const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceKey.json");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;



admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// middleware
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next)=>{
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({message: "unauthorize access"})
  }
  const token = authorization.split(" ")[1]
  if(!token){
    return res.status(401).send({message: "unauthorize access"})
  }
  try{
    const decoded = await admin.auth().verifyIdToken(token)
    req.token_email = decoded.email
    // console.log("after token verification", decoded)
    next();
  }
  catch{
    return res.status(401).send({message: "unauthorized access"});
  }
}

// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k11w7kv.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("The Book Haven Server is running!");
});

const run = async () => {
  try {
    await client.connect();

    const db = client.db("book_db");
    const bookCollection = db.collection("books");

    app.get("/books", async (req, res) => {
      console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.userEmail = email;
      }
      const result = await bookCollection.find(query).sort({created_at: 1}).toArray();
      res.send(result);
    });

     // latest books
    app.get("/latest-books", async (req, res) => {
      console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.userEmail = email;
      }
      const result = await bookCollection.find(query).sort({created_at: -1}).limit(6).toArray();
      res.send(result);
    });
    

    // get single book
    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollection.findOne(query);
      res.send(result);
    });
    
    // add book
    app.post("/books",verifyFBToken, async (req, res) => {
      const newBook = req.body;
      const result = await bookCollection.insertOne(newBook);
      res.send(result);
    });
   

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
};
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
