const express = require("express");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const router = express.Router();

// @desc Search users by name, headline, skills, username
router.get("/", protect, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q?.trim()) return res.json([]);

    const regex = new RegExp(q.trim(), "i");

    const users = await User.find({
      $or: [{ name: regex }, { headline: regex }, { skills: regex }, { username: regex }],
    })
      .select("name username avatar headline location skills")
      .limit(20);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
