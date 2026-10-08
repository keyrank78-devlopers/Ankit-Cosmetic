const mongoose = require("mongoose");

const exportRequestSchema = new mongoose.Schema({
    type: { type: String, enum: ["EMPLOYEES", "ORDERS", "CUSTOMERS"], required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "USED"], default: "PENDING" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    note: { type: String, trim: true, default: "", maxlength: 200 },
    usedAt: { type: Date },
}, { timestamps: true });

exportRequestSchema.index({ requestedBy: 1, type: 1, status: 1 });
exportRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ExportRequest", exportRequestSchema);
