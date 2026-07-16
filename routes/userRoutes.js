const express = require("express");
const multer = require("multer");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");
const { makeStorage } = require("../config/cloudinary");

const router = express.Router();
const avatarUpload = multer({ storage: makeStorage("avatars") });
const coverUpload = multer({ storage: makeStorage("covers") });

// @desc Get profile by username
router.get("/:username", protect, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .populate("connections", "name username avatar headline");

    if (!user) return res.status(404).json({ message: "User not found" });

    // Track profile view (skip self-views)
    if (user._id.toString() !== req.user._id.toString()) {
      const alreadyViewedToday = user.profileViews.find(
        (v) =>
          v.viewer?.toString() === req.user._id.toString() &&
          new Date(v.viewedAt).toDateString() === new Date().toDateString()
      );
      if (!alreadyViewedToday) {
        user.profileViews.push({ viewer: req.user._id });
        await user.save();
        await Notification.create({
          recipient: user._id,
          sender: req.user._id,
          type: "profile_view",
          message: `${req.user.name} viewed your profile`,
        });
      }
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Update own profile
router.put("/me/update", protect, async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "headline",
      "about",
      "location",
      "openToWork",
      "skills",
      "experience",
      "education",
    ];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Upload avatar
router.post("/me/avatar", protect, avatarUpload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: req.file.path },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Upload cover image
router.post("/me/cover", protect, coverUpload.single("cover"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { coverImage: req.file.path },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Get profile view analytics (last 30 days grouped by day)
router.get("/me/analytics", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "profileViews.viewer",
      "name username avatar"
    );
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentViews = user.profileViews.filter((v) => new Date(v.viewedAt) >= thirtyDaysAgo);

    const grouped = {};
    recentViews.forEach((v) => {
      const day = new Date(v.viewedAt).toISOString().split("T")[0];
      grouped[day] = (grouped[day] || 0) + 1;
    });

    res.json({
      totalViews: user.profileViews.length,
      last30Days: grouped,
      recentViewers: recentViews.slice(-10).reverse(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
