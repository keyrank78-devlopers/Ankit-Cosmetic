const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    batchNo: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    caseSize: { type: String, trim: true, default: "", maxlength: 40 },
    mfgDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    onHand: { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true });

batchSchema.index({ product: 1, batchNo: 1 }, { unique: true });
batchSchema.index({ product: 1, expiryDate: 1 });

module.exports = mongoose.model("Batch", batchSchema);
