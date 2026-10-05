const mongoose = require("mongoose");

const followUpSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, required: true },
    purpose: { type: String, required: true, trim: true, maxlength: 160 },
    note: { type: String, trim: true, maxlength: 500 },
    result: { type: String, enum: ["NO_ANSWER", "INTERESTED", "FOLLOW_UP", "NOT_INTERESTED"], required: true },
    nextFollowUpAt: { type: Date },
    nextPurpose: { type: String, trim: true, maxlength: 160 },
}, { timestamps: true });

followUpSchema.index({ customer: 1, at: -1 });

module.exports = mongoose.model("FollowUp", followUpSchema);
