const mongoose = require("mongoose");

const experienceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: String,
  startDate: String,
  endDate: String,
  current: { type: Boolean, default: false },
  description: String,
});

const educationSchema = new mongoose.Schema({
  school: { type: String, required: true },
  degree: String,
  field: String,
  startYear: String,
  endYear: String,
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    googleId: { type: String },
    avatar: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    headline: { type: String, default: "New member of Kaarwan" },
    about: { type: String, default: "" },
    location: { type: String, default: "" },
    openToWork: { type: Boolean, default: false },
    skills: [{ type: String }],
    experience: [experienceSchema],
    education: [educationSchema],
    resumeUrl: { type: String, default: "" },
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    connectionRequestsSent: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    connectionRequestsReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    profileViews: [
      {
        viewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

userSchema.index({ name: "text", headline: "text", skills: "text", username: "text" });

module.exports = mongoose.model("User", userSchema);
