const express = require("express");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");

const router = express.Router();

// @desc Send connection request
router.post("/request/:id", protect, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot connect with yourself" });
    }

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ message: "User not found" });

    if (target.connections.includes(req.user._id)) {
      return res.status(400).json({ message: "Already connected" });
    }
    if (target.connectionRequestsReceived.includes(req.user._id)) {
      return res.status(400).json({ message: "Request already sent" });
    }

    target.connectionRequestsReceived.push(req.user._id);
    await target.save();

    req.user.connectionRequestsSent.push(target._id);
    await req.user.save();

    await Notification.create({
      recipient: target._id,
      sender: req.user._id,
      type: "connection_request",
      message: `${req.user.name} sent you a connection request`,
    });

    res.json({ message: "Connection request sent" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Accept connection request
router.post("/accept/:id", protect, async (req, res) => {
  try {
    const requesterId = req.params.id;

    if (!req.user.connectionRequestsReceived.includes(requesterId)) {
      return res.status(400).json({ message: "No pending request from this user" });
    }

    const requester = await User.findById(requesterId);
    if (!requester) return res.status(404).json({ message: "User not found" });

    req.user.connectionRequestsReceived = req.user.connectionRequestsReceived.filter(
      (id) => id.toString() !== requesterId
    );
    req.user.connections.push(requesterId);
    await req.user.save();

    requester.connectionRequestsSent = requester.connectionRequestsSent.filter(
      (id) => id.toString() !== req.user._id.toString()
    );
    requester.connections.push(req.user._id);
    await requester.save();

    await Notification.create({
      recipient: requester._id,
      sender: req.user._id,
      type: "connection_accepted",
      message: `${req.user.name} accepted your connection request`,
    });

    res.json({ message: "Connection accepted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Reject connection request
router.post("/reject/:id", protect, async (req, res) => {
  try {
    const requesterId = req.params.id;

    req.user.connectionRequestsReceived = req.user.connectionRequestsReceived.filter(
      (id) => id.toString() !== requesterId
    );
    await req.user.save();

    await User.findByIdAndUpdate(requesterId, {
      $pull: { connectionRequestsSent: req.user._id },
    });

    res.json({ message: "Connection request rejected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Remove a connection
router.delete("/:id", protect, async (req, res) => {
  try {
    const otherId = req.params.id;

    req.user.connections = req.user.connections.filter((id) => id.toString() !== otherId);
    await req.user.save();

    await User.findByIdAndUpdate(otherId, { $pull: { connections: req.user._id } });

    res.json({ message: "Connection removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Get pending requests received
router.get("/requests", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "connectionRequestsReceived",
      "name username avatar headline"
    );
    res.json(user.connectionRequestsReceived);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Get "people you may know" — mutual connections based suggestions
router.get("/suggestions", protect, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const excludeIds = [
      req.user._id,
      ...currentUser.connections,
      ...currentUser.connectionRequestsSent,
      ...currentUser.connectionRequestsReceived,
    ];

    // Prioritize users who share at least one connection
    const suggestions = await User.aggregate([
      { $match: { _id: { $nin: excludeIds } } },
      {
        $addFields: {
          mutualCount: {
            $size: { $setIntersection: ["$connections", currentUser.connections] },
          },
        },
      },
      { $sort: { mutualCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          name: 1,
          username: 1,
          avatar: 1,
          headline: 1,
          mutualCount: 1,
        },
      },
    ]);

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
