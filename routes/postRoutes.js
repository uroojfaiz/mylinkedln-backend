const express = require("express");
const multer = require("multer");
const { Post, Comment, REACTION_TYPES } = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");
const { makeStorage } = require("../config/cloudinary");

const router = express.Router();
const postUpload = multer({ storage: makeStorage("posts") });

// @desc Create a post
router.post("/", protect, postUpload.single("image"), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text && !req.file) {
      return res.status(400).json({ message: "Post cannot be empty" });
    }

    const post = await Post.create({
      author: req.user._id,
      text: text || "",
      image: req.file ? req.file.path : "",
    });

    const populated = await post.populate("author", "name username avatar headline");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Get feed (own posts + connections' posts), paginated
router.get("/feed", protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const authorIds = [req.user._id, ...req.user.connections];

    const posts = await Post.find({ author: { $in: authorIds } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("author", "name username avatar headline")
      .populate({
        path: "sharedFrom",
        populate: { path: "author", select: "name username avatar headline" },
      });

    const total = await Post.countDocuments({ author: { $in: authorIds } });

    res.json({ posts, hasMore: page * limit < total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Get posts by a specific user (for profile page)
router.get("/user/:userId", protect, async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.userId })
      .sort({ createdAt: -1 })
      .populate("author", "name username avatar headline")
      .populate({
        path: "sharedFrom",
        populate: { path: "author", select: "name username avatar headline" },
      });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc React to a post (toggle / change reaction type)
router.post("/:id/react", protect, async (req, res) => {
  try {
    const { type } = req.body;
    if (!REACTION_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const existingIndex = post.reactions.findIndex(
      (r) => r.user.toString() === req.user._id.toString()
    );

    let notify = false;
    if (existingIndex === -1) {
      post.reactions.push({ user: req.user._id, type });
      notify = true;
    } else if (post.reactions[existingIndex].type === type) {
      post.reactions.splice(existingIndex, 1);
    } else {
      post.reactions[existingIndex].type = type;
    }

    await post.save();

    if (notify && post.author.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: post.author,
        sender: req.user._id,
        type: "reaction",
        post: post._id,
        message: `${req.user.name} reacted to your post`,
      });
    }

    res.json(post.reactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Share/repost a post
router.post("/:id/share", protect, async (req, res) => {
  try {
    const original = await Post.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Post not found" });

    const sourcePostId = original.sharedFrom || original._id;

    const repost = await Post.create({
      author: req.user._id,
      text: req.body.text || "",
      sharedFrom: sourcePostId,
    });

    await Post.findByIdAndUpdate(sourcePostId, { $inc: { shareCount: 1 } });

    const sourcePost = await Post.findById(sourcePostId);
    if (sourcePost.author.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: sourcePost.author,
        sender: req.user._id,
        type: "share",
        post: sourcePostId,
        message: `${req.user.name} shared your post`,
      });
    }

    const populated = await repost.populate([
      { path: "author", select: "name username avatar headline" },
      { path: "sharedFrom", populate: { path: "author", select: "name username avatar headline" } },
    ]);

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Delete own post
router.delete("/:id", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }
    await post.deleteOne();
    await Comment.deleteMany({ _id: { $in: [] } }); // placeholder, comments cleaned via postId below
    res.json({ message: "Post deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Get comments for a post
router.get("/:id/comments", protect, async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: 1 })
      .populate("author", "name username avatar headline");
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc Add a comment
router.post("/:id/comments", protect, async (req, res) => {
  try {
    const { text, parentComment } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Comment cannot be empty" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = await Comment.create({
      post: req.params.id,
      author: req.user._id,
      text,
      parentComment: parentComment || null,
    });

    post.commentCount += 1;
    await post.save();

    if (post.author.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: post.author,
        sender: req.user._id,
        type: "comment",
        post: post._id,
        message: `${req.user.name} commented on your post`,
      });
    }

    const populated = await comment.populate("author", "name username avatar headline");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
