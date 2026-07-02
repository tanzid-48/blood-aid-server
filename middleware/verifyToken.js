const { MongoClient, ObjectId } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI);
const authDb = client.db("blood_auth_db");

async function verifyToken(req, res, next) {
  try {
    // Better Auth session token — cookie বা Authorization header
    const token =
      req.cookies?.["better-auth.session_token"] ||
      req.cookies?.["__Secure-better-auth.session_token"] ||
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Unauthorized — no token" });
    }

    // Session verify  MongoDB
    const session = await authDb.collection("session").findOne({ token });

    if (!session) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    // Session expire check
    if (new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

    // User fetch
    const user = await authDb.collection("user").findOne({
      _id: new ObjectId(session.userId),
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Request-এ user attach
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      bloodGroup: user.bloodGroup,
      phone: user.phone,
      isDonor: user.isDonor,
      isVolunteer: user.isVolunteer,
    };

    next();
  } catch (err) {
    console.error("verifyToken error:", err);
    res.status(500).json({ error: "Token verification failed" });
  }
}

module.exports = verifyToken;
