const express = require("express");
const { ObjectId } = require("mongodb");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

module.exports = (authDb, db) => {
  // All admin routes need auth + admin role
  router.use(verifyToken, checkRole("admin"));

  // ── GET /admin/requests ── all requests
  router.get("/requests", async (req, res) => {
    try {
      const { status, urgency, bloodGroup } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (urgency) filter.urgency = urgency;
      if (bloodGroup) filter.bloodGroup = bloodGroup;

      const requests = await db
        .collection("bloodRequests")
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      res.json({ success: true, data: requests, total: requests.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // ── PATCH /admin/requests/:id/assign ── assign volunteer
  router.patch("/requests/:id/assign", async (req, res) => {
    try {
      const { volunteerId, volunteerName } = req.body;
      if (!volunteerId)
        return res.status(400).json({ error: "Volunteer ID required" });

      await db.collection("bloodRequests").updateOne(
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
      res.status(500).json({ error: "Failed to assign volunteer" });
    }
  });

  // ── PATCH /admin/requests/:id/status ── update status
  router.patch("/requests/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ["pending", "active", "fulfilled", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await db
        .collection("bloodRequests")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status, updatedAt: new Date() } },
        );
      res.json({ success: true, message: `Status updated to ${status}` });
    } catch (err) {
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // ── GET /admin/users ── all users
  router.get("/users", async (req, res) => {
    try {
      const { role, isDonor } = req.query;
      const filter = {};
      if (role) filter.role = role;
      if (isDonor === "true") filter.isDonor = true;

      const users = await authDb
        .collection("user")
        .find(filter, { projection: { password: 0 } })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({ success: true, data: users, total: users.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // ── PATCH /admin/users/:id/role ── change role
  router.patch("/users/:id/role", async (req, res) => {
    try {
      const { role } = req.body;
      if (!["user", "volunteer", "admin"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      await authDb.collection("user").updateOne(
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
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  // ── GET /admin/analytics ── dashboard stats
  router.get("/analytics", async (req, res) => {
    try {
      const [
        totalUsers,
        totalDonors,
        totalVolunteers,
        pendingRequests,
        activeRequests,
        fulfilledRequests,
        totalRequests,
      ] = await Promise.all([
        authDb.collection("user").countDocuments(),
        authDb.collection("user").countDocuments({ isDonor: true }),
        authDb.collection("user").countDocuments({ role: "volunteer" }),
        db.collection("bloodRequests").countDocuments({ status: "pending" }),
        db.collection("bloodRequests").countDocuments({ status: "active" }),
        db.collection("bloodRequests").countDocuments({ status: "fulfilled" }),
        db.collection("bloodRequests").countDocuments(),
      ]);

      res.json({
        success: true,
        data: {
          totalUsers,
          totalDonors,
          totalVolunteers,
          requests: {
            total: totalRequests,
            pending: pendingRequests,
            active: activeRequests,
            fulfilled: fulfilledRequests,
          },
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  return router;
};
