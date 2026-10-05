const mongoose = require("mongoose");

const giftSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
        price: { type: Number, required: true, min: 0 },
        description: { type: String, trim: true, maxlength: 200, default: "" },
        image: { type: String, required: true, trim: true },
        stock: { type: Number, required: true, min: 0, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

giftSchema.virtual("stockStatus").get(function () {
    return (Number(this.stock) || 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
});

giftSchema.set("toJSON", { virtuals: true });
giftSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Gift", giftSchema);
