const express = require("express");
const { ObjectId } = require("mongodb");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

module.exports = (authDb, db) => {
  router.use(verifyToken, checkRole("volunteer", "admin"));

  // ── GET /volunteer/requests ── assigned requests
  router.get("/requests", async (req, res) => {
    try {
      const requests = await db
        .collection("bloodRequests")
        .find({
          "assignedVolunteer.id": req.user.id,
          status: { $in: ["active", "pending"] },
        })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({ success: true, data: requests });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch assigned requests" });
    }
  });

  // ── PATCH /volunteer/requests/:id/status ── update status
  router.patch("/requests/:id/status", async (req, res) => {
    try {
      const { status, donorName, donorPhone } = req.body;
      const validStatuses = ["active", "fulfilled", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updateData = { status, updatedAt: new Date() };
      if (donorName && donorPhone) {
        updateData.assignedDonor = { name: donorName, phone: donorPhone };
      }

      await db
        .collection("bloodRequests")
        .updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateData });

      res.json({ success: true, message: `Status updated to ${status}` });
    } catch (err) {
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  return router;
};
