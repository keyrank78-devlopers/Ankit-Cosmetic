const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
    {
        categoryId: {
            type: String,
            required: true,
            unique: true,
        },
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        picture: {
            type: String,
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

module.exports = mongoose.model("Category", categorySchema);
