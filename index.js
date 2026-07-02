require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

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

    const authDb = client.db("blood_auth_db");
    const db = client.db("blood-aid-db");

    // Collections
    const usersCollection = authDb.collection("user");
    const requestsCollection = db.collection("bloodRequests");

    // ── Middleware ──
    async function verifyToken(req, res, next) {
      try {
        const token =
          req.cookies?.["better-auth.session_token"] ||
          req.cookies?.["__Secure-better-auth.session_token"] ||
          req.headers.authorization?.replace("Bearer ", "");

        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const session = await authDb.collection("session").findOne({ token });
        if (!session) return res.status(401).json({ error: "Invalid session" });
        if (new Date(session.expiresAt) < new Date()) {
          return res.status(401).json({ error: "Session expired" });
        }

        const user = await usersCollection.findOne({
          _id: new ObjectId(session.userId),
        });
        if (!user) return res.status(401).json({ error: "User not found" });

        req.user = {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          bloodGroup: user.bloodGroup,
          phone: user.phone,
          isDonor: user.isDonor,
        };
        next();
      } catch (err) {
        res.status(500).json({ error: "Auth failed" });
      }
    }

    function checkRole(...roles) {
      return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        if (!roles.includes(req.user.role)) {
          return res.status(403).json({ error: "Access denied" });
        }
        next();
      };
    }

    // USER ROUTES

    // GET /api/users/donors — public donor search
    app.get("/api/users/donors", async (req, res) => {
      try {
        const { bloodGroup, location } = req.query;
        const filter = { isDonor: true };
        if (bloodGroup) filter.bloodGroup = bloodGroup;
        if (location) filter.location = { $regex: location, $options: "i" };

        const donors = await usersCollection
          .find(filter, {
            projection: {
              name: 1,
              bloodGroup: 1,
              location: 1,
              isDonor: 1,
              isDonorAvailable: 1,
              totalDonations: 1,
              lastDonation: 1,
              // phone HIDDEN
            },
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({ success: true, data: donors });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch donors" });
      }
    });

    // GET /api/users/profile — own profile
    app.get("/api/users/profile", verifyToken, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const user = await usersCol.findOne(
          { _id: new ObjectId(req.user.id) },
          { projection: { password: 0 } },
        );
        res.json({ success: true, data: user });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch profile" });
      }
    });

    // PATCH /api/users/profile — update profile
    app.patch("/api/users/profile", verifyToken, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const { name, phone, location, bloodGroup } = req.body;
        const update = {};
        if (name) update.name = name.trim();
        if (phone) update.phone = phone.trim();
        if (location) update.location = location.trim();
        if (bloodGroup) update.bloodGroup = bloodGroup;
        update.updatedAt = new Date();

        await usersCol.updateOne(
          { _id: new ObjectId(req.user.id) },
          { $set: update },
        );
        res.json({ success: true, message: "Profile updated" });
      } catch (err) {
        res.status(500).json({ error: "Failed to update profile" });
      }
    });

    // PATCH /api/users/become-donor
    app.patch("/api/users/become-donor", verifyToken, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        await usersCol.updateOne(
          { _id: new ObjectId(req.user.id) },
          {
            $set: {
              isDonor: true,
              isDonorAvailable: true,
              updatedAt: new Date(),
            },
          },
        );
        res.json({ success: true, message: "Registered as donor" });
      } catch (err) {
        res.status(500).json({ error: "Failed" });
      }
    });

    // BLOOD REQUEST ROUTES

    // POST /api/requests — create request
    app.post("/api/requests", verifyToken, async (req, res) => {
      try {
        const {
          patientName,
          bloodGroup,
          quantity,
          condition,
          reason,
          relation,
          hospitalName,
          district,
          neededBy,
          yourName,
          yourPhone,
          urgency,
        } = req.body;

        if (
          !patientName ||
          !bloodGroup ||
          !condition ||
          !reason ||
          !relation ||
          !hospitalName ||
          !district ||
          !neededBy ||
          !yourName ||
          !yourPhone ||
          !urgency
        ) {
          return res.status(400).json({ error: "All fields required" });
        }

        const result = await requestsCol.insertOne({
          patientName: patientName.trim(),
          bloodGroup,
          quantity: parseInt(quantity) || 1,
          condition,
          reason,
          relation,
          hospitalName: hospitalName.trim(),
          district,
          neededBy: new Date(neededBy),
          yourName: yourName.trim(),
          yourPhone: yourPhone.trim(),
          urgency,
          requesterId: req.user.id,
          requesterName: req.user.name,
          status: "pending",
          assignedVolunteer: null,
          assignedDonor: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        res.status(201).json({
          success: true,
          message: "Request submitted successfully",
          requestId: result.insertedId,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to create request" });
      }
    });

    // GET /api/requests/my — user requests
    app.get("/api/requests/my", verifyToken, async (req, res) => {
      try {
        const requests = await requestsCol
          .find({ requesterId: req.user.id })
          .sort({ createdAt: -1 })
          .toArray();
        res.json({ success: true, data: requests });
      } catch (err) {
        res.status(500).json({ error: "Failed" });
      }
    });

    // GET /api/requests/public — public active requests
    app.get("/api/requests/public", async (req, res) => {
      try {
        const { bloodGroup, district } = req.query;
        const filter = { status: { $in: ["pending", "active"] } };
        if (bloodGroup) filter.bloodGroup = bloodGroup;
        if (district) filter.district = district;

        const requests = await requestsCol
          .find(filter, { projection: { yourPhone: 0 } })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();

        res.json({ success: true, data: requests });
      } catch (err) {
        res.status(500).json({ error: "Failed" });
      }
    });

    // PATCH /api/requests/:id/cancel
    app.patch("/api/requests/:id/cancel", verifyToken, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const request = await requestsCol.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!request) return res.status(404).json({ error: "Not found" });
        if (request.requesterId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized" });
        }
        await requestsCol.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: "cancelled", updatedAt: new Date() } },
        );
        res.json({ success: true, message: "Cancelled" });
      } catch (err) {
        res.status(500).json({ error: "Failed" });
      }
    });

    // ADMIN ROUTES

    // GET /api/admin/analytics
    app.get(
      "/api/admin/analytics",
      verifyToken,
      checkRole("admin"),
      async (req, res) => {
        try {
          const [
            totalUsers,
            totalDonors,
            totalVolunteers,
            pending,
            active,
            fulfilled,
            total,
          ] = await Promise.all([
            usersCol.countDocuments(),
            usersCol.countDocuments({ isDonor: true }),
            usersCol.countDocuments({ role: "volunteer" }),
            requestsCol.countDocuments({ status: "pending" }),
            requestsCol.countDocuments({ status: "active" }),
            requestsCol.countDocuments({ status: "fulfilled" }),
            requestsCol.countDocuments(),
          ]);
          res.json({
            success: true,
            data: {
              totalUsers,
              totalDonors,
              totalVolunteers,
              requests: { total, pending, active, fulfilled },
            },
          });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // GET /api/admin/requests
    app.get(
      "/api/admin/requests",
      verifyToken,
      checkRole("admin"),
      async (req, res) => {
        try {
          const { status, urgency, bloodGroup } = req.query;
          const filter = {};
          if (status) filter.status = status;
          if (urgency) filter.urgency = urgency;
          if (bloodGroup) filter.bloodGroup = bloodGroup;

          const requests = await requestsCol
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();
          res.json({ success: true, data: requests, total: requests.length });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // PATCH /api/admin/requests/:id/assign — volunteer assign
    app.patch(
      "/api/admin/requests/:id/assign",
      verifyToken,
      checkRole("admin"),
      async (req, res) => {
        try {
          const { ObjectId } = require("mongodb");
          const { volunteerId, volunteerName } = req.body;
          await requestsCol.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
              $set: {
                assignedVolunteer: { id: volunteerId, name: volunteerName },
                status: "active",
                updatedAt: new Date(),
              },
            },
          );
          res.json({ success: true, message: "Volunteer assigned" });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // PATCH /api/admin/requests/:id/status
    app.patch(
      "/api/admin/requests/:id/status",
      verifyToken,
      checkRole("admin"),
      async (req, res) => {
        try {
          const { ObjectId } = require("mongodb");
          const { status } = req.body;
          await requestsCol.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status, updatedAt: new Date() } },
          );
          res.json({ success: true, message: "Status updated" });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // GET /api/admin/users
    app.get(
      "/api/admin/users",
      verifyToken,
      checkRole("admin"),
      async (req, res) => {
        try {
          const { role } = req.query;
          const filter = {};
          if (role) filter.role = role;
          const users = await usersCol
            .find(filter, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();
          res.json({ success: true, data: users, total: users.length });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // PATCH /api/admin/users/:id/role
    app.patch(
      "/api/admin/users/:id/role",
      verifyToken,
      checkRole("admin"),
      async (req, res) => {
        try {
          const { ObjectId } = require("mongodb");
          const { role } = req.body;
          if (!["user", "volunteer", "admin"].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
          }
          await usersCol.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
              $set: {
                role,
                isVolunteer: role === "volunteer",
                updatedAt: new Date(),
              },
            },
          );
          res.json({ success: true, message: `Role updated to ${role}` });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // VOLUNTEER ROUTES

    // GET /api/volunteer/requests — assigned to me
    app.get(
      "/api/volunteer/requests",
      verifyToken,
      checkRole("volunteer", "admin"),
      async (req, res) => {
        try {
          const requests = await requestsCol
            .find({ "assignedVolunteer.id": req.user.id })
            .sort({ createdAt: -1 })
            .toArray();
          res.json({ success: true, data: requests });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // PATCH /api/volunteer/requests/:id/status
    app.patch(
      "/api/volunteer/requests/:id/status",
      verifyToken,
      checkRole("volunteer", "admin"),
      async (req, res) => {
        try {
          const { ObjectId } = require("mongodb");
          const { status, donorName, donorPhone } = req.body;
          const update = { status, updatedAt: new Date() };
          if (donorName && donorPhone) {
            update.assignedDonor = { name: donorName, phone: donorPhone };
          }
          await requestsCol.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: update },
          );
          res.json({ success: true, message: "Updated" });
        } catch (err) {
          res.status(500).json({ error: "Failed" });
        }
      },
    );

    // 404

    app.use((req, res) => {
      res.status(404).json({ error: "Route not found" });
    });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect:", err);
    process.exit(1);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
