const mongoose = require("mongoose");

const subCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        image: {
            type: String,
            required: true,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
        },
    },
    { timestamps: true }
);

// Ensure SubCategory name is unique within a specific Category
subCategorySchema.index({ name: 1, category: 1 }, { unique: true });

module.exports = mongoose.model("SubCategory", subCategorySchema);
