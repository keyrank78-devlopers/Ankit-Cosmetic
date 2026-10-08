const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        image: { type: String, default: "" },
        publicId: { type: String, default: "" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Setting", settingSchema);
