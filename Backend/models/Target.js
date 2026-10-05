const mongoose = require("mongoose");

const targetSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    amount: { type: Number, required: true, min: 0 },
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

targetSchema.index({ user: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("Target", targetSchema);
