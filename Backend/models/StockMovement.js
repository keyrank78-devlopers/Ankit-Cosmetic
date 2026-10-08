const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", required: true, index: true },
    type: { type: String, enum: ["OPENING", "PRODUCTION", "SALE", "DAMAGE", "EXPIRY", "RETURN", "MISSING", "OTHER"], required: true },
    kind: { type: String, enum: ["REPLACEMENT"] },
    quantity: { type: Number, required: true, min: 1 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    note: { type: String, trim: true, default: "", maxlength: 200 },
    at: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

stockMovementSchema.index({ batch: 1, at: 1 });
stockMovementSchema.index({ product: 1, at: -1 });
stockMovementSchema.index({ type: 1, at: -1 });
stockMovementSchema.index({ order: 1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
