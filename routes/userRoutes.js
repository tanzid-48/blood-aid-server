const express = require("express");
const { ObjectId } = require("mongodb");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

module.exports = (authDb, db) => {
  // ── GET /users/donors/search ── public
  // Query: bloodGroup, location, available
  router.get("/donors/search", async (req, res) => {
    try {
      const { bloodGroup, location, available } = req.query;

      const filter = { isDonor: true };
      if (bloodGroup) filter.bloodGroup = bloodGroup;
      if (location) filter.location = { $regex: location, $options: "i" };
      if (available === "true") filter.isDonorAvailable = true;

      const donors = await authDb
        .collection("user")
        .find(filter, {
          projection: {
            // Phone HIDE — privacy
            name: 1,
            bloodGroup: 1,
            location: 1,
            isDonor: 1,
            isDonorAvailable: 1,
            totalDonations: 1,
            lastDonation: 1,
            createdAt: 1,
          },
        })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({ success: true, data: donors });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch donors" });
    }
  });

  // ── GET /users/profile ── protected
  router.get("/profile", verifyToken, async (req, res) => {
    try {
      const user = await authDb.collection("user").findOne(
        { _id: new ObjectId(req.user.id) },
        {
          projection: { password: 0 }, // password hide
        },
      );
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // ── PATCH /users/profile ── protected — profile update
  router.patch("/profile", verifyToken, async (req, res) => {
    try {
      const { name, phone, location, bloodGroup } = req.body;

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (phone) updateData.phone = phone.trim();
      if (location) updateData.location = location.trim();
      if (bloodGroup) updateData.bloodGroup = bloodGroup;
      updateData.updatedAt = new Date();

      await authDb
        .collection("user")
        .updateOne({ _id: new ObjectId(req.user.id) }, { $set: updateData });

      res.json({ success: true, message: "Profile updated" });
    } catch (err) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ── PATCH /users/become-donor ── protected
  router.patch("/become-donor", verifyToken, async (req, res) => {
    try {
      await authDb.collection("user").updateOne(
        { _id: new ObjectId(req.user.id) },
        {
          $set: {
            isDonor: true,
            isDonorAvailable: true,
            updatedAt: new Date(),
          },
        },
      );
      res.json({ success: true, message: "You are now registered as a donor" });
    } catch (err) {
      res.status(500).json({ error: "Failed to register as donor" });
    }
  });

  return router;
};
