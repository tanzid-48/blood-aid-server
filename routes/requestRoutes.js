const express = require("express");
const { ObjectId } = require("mongodb");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

module.exports = (db) => {
  // ── POST /requests ── protected — create request
  router.post("/", verifyToken, async (req, res) => {
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

      // Validation
      if (
        !patientName ||
        !bloodGroup ||
        !quantity ||
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
        return res
          .status(400)
          .json({ error: "All required fields must be filled" });
      }

      const newRequest = {
        // Patient info
        patientName: patientName.trim(),
        bloodGroup,
        quantity: parseInt(quantity),
        condition,
        reason,
        relation,
        // Hospital
        hospitalName: hospitalName.trim(),
        district,
        neededBy: new Date(neededBy),
        // Contact
        yourName: yourName.trim(),
        yourPhone: yourPhone.trim(),
        urgency,
        // System
        requesterId: req.user.id,
        requesterName: req.user.name,
        requesterEmail: req.user.email,
        status: "pending", // pending → active → fulfilled / cancelled
        assignedVolunteer: null,
        assignedDonor: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection("bloodRequests").insertOne(newRequest);
      res.status(201).json({
        success: true,
        message: "Blood request submitted successfully",
        requestId: result.insertedId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create request" });
    }
  });

  // ── GET /requests/my ── protected — user requests
  router.get("/my", verifyToken, async (req, res) => {
    try {
      const requests = await db
        .collection("bloodRequests")
        .find({ requesterId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ success: true, data: requests });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // ── GET /requests/public ── public — active requests 
  router.get("/public", async (req, res) => {
    try {
      const { bloodGroup, district, urgency } = req.query;
      const filter = { status: { $in: ["pending", "active"] } };
      if (bloodGroup) filter.bloodGroup = bloodGroup;
      if (district) filter.district = district;
      if (urgency) filter.urgency = urgency;

      const requests = await db
        .collection("bloodRequests")
        .find(filter, {
          projection: {
            yourPhone: 0, // phone hide
            requesterEmail: 0,
          },
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

      res.json({ success: true, data: requests });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // ── PATCH /requests/:id/cancel ── protected — user  request cancel
  router.patch("/:id/cancel", verifyToken, async (req, res) => {
    try {
      const request = await db.collection("bloodRequests").findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (request.requesterId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      if (request.status === "fulfilled") {
        return res
          .status(400)
          .json({ error: "Fulfilled request cannot be cancelled" });
      }

      await db
        .collection("bloodRequests")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: "cancelled", updatedAt: new Date() } },
        );
      res.json({ success: true, message: "Request cancelled" });
    } catch (err) {
      res.status(500).json({ error: "Failed to cancel request" });
    }
  });

  return router;
};
