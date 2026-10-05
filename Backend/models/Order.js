const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        image: { type: String, default: "" },
        sellPrice: { type: Number, required: true, min: 0 },
        gstPercent: { type: Number, required: true, min: 0, max: 100 },
        quantity: { type: Number, required: true, min: 1 },
        lockedQty: { type: Number, required: true, min: 0, default: 0 },
        overQty: { type: Number, required: true, min: 0, default: 0 },
        allocations: {
            type: [{
                batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", required: true },
                qty: { type: Number, required: true, min: 1 },
            }],
            default: [],
        },
        shipped: { type: Boolean, default: false },
        remark: { type: String, trim: true, default: "" },
    },
    { _id: false }
);

const expirySchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        image: { type: String, default: "" },
        quantity: { type: Number, required: true, min: 1 },
        type: { type: String, enum: ["DAMAGE", "EXPIRY", "RETURN", "OTHER"], default: "EXPIRY" },
        otherLabel: { type: String, trim: true, default: "", maxlength: 80 },
        note: { type: String, trim: true, default: "", maxlength: 200 },
        purchasedDate: { type: String, trim: true, default: "" },
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        orderCode: { type: String, trim: true, unique: true, sparse: true },
        customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
        status: { type: String, enum: ["DRAFT", "PLACED", "PENDING_CONFIRM", "PENDING", "CONFIRM", "READY_TO_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"], default: "DRAFT" },
        lines: { type: [lineSchema], default: [] },
        scheme: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme" },
        schemeType: { type: String, enum: ["SLAB", "OPEN", "FIRST_ORDER"] },
        schemeName: { type: String, trim: true, default: "" },
        schemeGift: { type: mongoose.Schema.Types.ObjectId, ref: "Gift" },
        schemeGiftName: { type: String, trim: true, default: "" },
        schemeGiftImage: { type: String, default: "" },
        schemeGifts: {
            type: [{ name: { type: String, default: "" }, image: { type: String, default: "" } }],
            default: [],
        },
        schemeNote: { type: String, trim: true, default: "", maxlength: 20000 },
        schemeCommitmentAmount: { type: Number, min: 0 },
        schemeCommitmentMonths: { type: Number, min: 0 },
        expiryEnabled: { type: Boolean, default: false },
        expiryLines: { type: [expirySchema], default: [] },
        paymentMethod: { type: String, enum: ["COD", "ONLINE", "CASH", "ADVANCE_COD"] },
        advanceAmount: { type: Number, min: 0, default: 0 },
        advanceMode: { type: String, enum: ["CASH", "ONLINE"] },
        pendingAmount: { type: Number, min: 0, default: 0 },
        razorpayOrderId: { type: String, trim: true, default: "" },
        razorpayPaymentId: { type: String, trim: true, default: "" },
        razorpaySignature: { type: String, trim: true, default: "" },
        razorpayAmount: { type: Number, min: 0 },
        paidAt: { type: Date },
        subtotal: { type: Number, min: 0, default: 0 },
        gstTotal: { type: Number, min: 0, default: 0 },
        total: { type: Number, min: 0, default: 0 },
        placedAt: { type: Date },
        confirmedAt: { type: Date },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

orderSchema.index({ customer: 1, status: 1 });
orderSchema.index({ status: 1, placedAt: -1 });
orderSchema.index({ createdBy: 1, confirmedAt: 1 });

module.exports = mongoose.model("Order", orderSchema);
