const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceKey.json");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unauthorize access" });
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorize access" });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    // console.log("after token verification", decoded)
    next();
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

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
    // await client.connect();

    const db = client.db("book_db");
    const usersCollection = db.collection("users");
    const bookCollection = db.collection("books");
    const commentCollection = db.collection("comments");

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date().toISOString();
      const email = user.email;
      const userExist = await usersCollection.findOne({ email });
      if (userExist) {
        return res.send({ message: "user already exist" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // app.get("/books", async (req, res) => {
    //   const result = await bookCollection.find().toArray();
    //   res.send(result);
    // });

    app.get("/books", async (req, res) => {
      try {
        const {
          search = "",
          rating,
          sort = "date",
          page = 1,
          limit = 10,
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);

        const pipeline = [];

        // 🔹 Normalize fields
        pipeline.push({
          $addFields: {
            ratingNum: { $toDouble: "$rating" },
            titleLower: { $toLower: "$title" },
            createdAt: { $toDate: "$created_at" },
          },
        });

        // 🔍 SEARCH BY TITLE
        if (search) {
          pipeline.push({
            $match: {
              titleLower: { $regex: search.toLowerCase() },
            },
          });
        }

        // ⭐ FILTER BY RATING
        if (rating) {
          pipeline.push({
            $match: {
              ratingNum: { $gte: Number(rating) },
            },
          });
        }

        // 🔃 SORT
        pipeline.push({
          $sort: sort === "rating" ? { ratingNum: -1 } : { createdAt: -1 },
        });

        // 📄 PAGINATION
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: Number(limit) });

        const books = await bookCollection.aggregate(pipeline).toArray();

        // 🔢 TOTAL COUNT (same filters)
        const countPipeline = pipeline.filter(
          (stage) => !stage.$skip && !stage.$limit && !stage.$sort
        );
        countPipeline.push({ $count: "total" });

        const countResult = await bookCollection
          .aggregate(countPipeline)
          .toArray();

        const total = countResult[0]?.total || 0;

        res.send({
          books,
          total,
          totalPages: Math.ceil(total / Number(limit)),
        });
      } catch (error) {
        console.error("BOOK API ERROR:", error);
        res.status(500).send({ message: "Failed to load books" });
      }
    });

    app.get("/my-books", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.userEmail = email;
      }
      const result = await bookCollection
        .find(query)
        .sort({ created_at: 1 })
        .toArray();
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
      const result = await bookCollection
        .find(query)
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
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
    app.post("/books", verifyFBToken, async (req, res) => {
      const newBook = req.body;
      const result = await bookCollection.insertOne(newBook);
      res.send(result);
    });

    // update book
    app.put("/book/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const updatedBook = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updatedBook,
      };
      const result = await bookCollection.updateOne(query, update);
      res.send(result);
    });

    // delete book
    app.delete("/books/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollection.deleteOne(query);
      res.send(result);
    });

    // add comments
    app.post("/comments", verifyFBToken, async (req, res) => {
      const newComment = req.body;
      const result = await commentCollection.insertOne(newComment);
      res.send(result);
    });

    // get comments
    app.get("/comments/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = {};
      if (id) {
        query.bookId = id;
      }
      const result = await commentCollection
        .find(query)
        .sort({ created_at: -1 })
        .toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
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
