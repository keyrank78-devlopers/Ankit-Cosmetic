const mongoose = require("mongoose");

const SCHEME_TYPES = ["SLAB", "OPEN", "FIRST_ORDER"];

const slabSchema = new mongoose.Schema(
    {
        minAmount: { type: Number, required: true, min: 1 },
        gifts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Gift", required: true }],
    },
    { _id: false }
);

const schemeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        type: { type: String, required: true, enum: SCHEME_TYPES },
        slabs: { type: [slabSchema], default: undefined },
        minAmount: { type: Number, min: 1 },
        gifts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Gift" }],
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

const Scheme = mongoose.model("Scheme", schemeSchema);
Scheme.SCHEME_TYPES = SCHEME_TYPES;

// The previous scheme records used a unique code. New schemes do not.
Scheme.collection.dropIndex("code_1").catch(() => {});

module.exports = Scheme;
