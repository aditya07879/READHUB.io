const mongoose = require("mongoose");

const SummarySchema = new mongoose.Schema({
  title: { type: String },
  url: { type: String },
  summaryText: { type: String },
  originalText: { type: String },
  mode: { type: String, default: "concise" },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
    required: false,
  },
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Summary", SummarySchema);
