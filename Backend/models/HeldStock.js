const mongoose = require("mongoose");

const heldStockSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        type: { type: String, enum: ["DAMAGE", "EXPIRY", "RETURN", "MISSING", "OTHER"], required: true },
        quantity: { type: Number, required: true, min: 0, default: 0 },
    },
    { timestamps: true }
);

heldStockSchema.index({ product: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("HeldStock", heldStockSchema);
