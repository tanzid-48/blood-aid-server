require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "blood-aid-server is running ✅", version: "1.0.0" });
});

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const authDb = client.db("blood_auth_db"); // Better Auth DB
    const db = client.db("blood-aid-db"); // App DB

    // ── Routes ──
    const userRoutes = require("./routes/userRoutes")(authDb, db);
    const requestRoutes = require("./routes/requestRoutes")(db);
    const adminRoutes = require("./routes/adminRoutes")(authDb, db);
    const volunteerRoutes = require("./routes/volunteerRoutes")(authDb, db);

    app.use("/api/users", userRoutes);
    app.use("/api/requests", requestRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/volunteer", volunteerRoutes);

    // ── 404 handler ──
    app.use((req, res) => {
      res.status(404).json({ error: "Route not found" });
    });

    // ── Global error handler ──
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ error: "Internal server error" });
    });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
