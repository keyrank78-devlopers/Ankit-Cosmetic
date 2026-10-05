const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
    {
        productId: {
            type: String,
            required: true,
            unique: true,
        },
        productCode: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
        },
        gstPercent: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },
        subCategory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SubCategory",
            required: true,
        },
        description: {
            type: String,
        },
        mrp: {
            type: Number,
            required: true,
            min: 0,
        },
        sellPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        minSalesPrice: {
            type: Number,
            min: 0,
        },
        maxSalesPrice: {
            type: Number,
            min: 0,
        },
        stock: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        lowStockAt: {
            type: Number,
            min: 0,
            default: 10,
        },
        mainImage: {
            type: String,
            required: true,
        },
        otherImages: [
            {
                type: String,
            },
        ],
        variants: [
            {
                key: { type: String, required: true },
                value: { type: String, required: true },
            },
        ],
        metaTitle: {
            type: String,
        },
        metaDescription: {
            type: String,
        },
        metaKeyword: {
            type: String,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
        },
    },
    { timestamps: true }
);

// Indexes for searching and filtering
productSchema.index({ name: "text", description: "text" });
productSchema.index({ category: 1, subCategory: 1 });
productSchema.index({ stock: 1 });

productSchema.virtual("stockStatus").get(function () {
    return (Number(this.stock) || 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Product", productSchema);
