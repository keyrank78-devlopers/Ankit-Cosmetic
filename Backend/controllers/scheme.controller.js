const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");
const Gift = require("../models/Gift");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const positiveAmount = (value) => {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 1) return null;
    return amount;
};

const uniqueIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)))];

const invalidGiftIds = (ids) => ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));

const missingGifts = async (ids) => {
    if (!ids.length) return [];
    const found = await Gift.find({ _id: { $in: ids } }).select("_id");
    const foundSet = new Set(found.map((gift) => String(gift._id)));
    return ids.filter((id) => !foundSet.has(id));
};

const fail = (status, message) => ({ error: { status, message } });

const buildScheme = async (body, excludeId) => {
    const name = String(body.name || "").trim();
    const type = body.type;

    if (name.length < 2 || name.length > 80) return fail(400, "Scheme name must be 2 to 80 characters");
    if (!["SLAB", "OPEN"].includes(type)) return fail(400, "Scheme type must be SLAB or OPEN");

    const nameTaken = await Scheme.findOne({
        name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select("_id");
    if (nameTaken) return fail(409, "A scheme with this name already exists");

    const value = { name, type };
    const unset = {};

    if (type === "OPEN") {
        const openScheme = await Scheme.findOne({
            type: "OPEN",
            ...(excludeId ? { _id: { $ne: excludeId } } : {}),
        }).select("name");
        if (openScheme) return fail(409, `An open request scheme already exists (${openScheme.name})`);
        unset.slabs = "";
        unset.minAmount = "";
        unset.gifts = "";
    }

    if (type === "SLAB") {
        const slabs = Array.isArray(body.slabs) ? body.slabs : [];
        if (!slabs.length) return fail(400, "Add at least one amount slab");

        const parsed = [];
        const amounts = new Set();
        for (const slab of slabs) {
            const minAmount = positiveAmount(slab?.minAmount);
            const gifts = uniqueIds(slab?.gifts);
            if (minAmount == null) return fail(400, "Each slab amount must be a whole number greater than 0");
            if (amounts.has(minAmount)) return fail(400, "Each slab needs a different amount");
            if (!gifts.length) return fail(400, `Select at least one gift for ₹${minAmount}`);
            if (invalidGiftIds(gifts).length) return fail(400, "One or more gifts are invalid");
            amounts.add(minAmount);
            parsed.push({ minAmount, gifts });
        }

        const allGiftIds = uniqueIds(parsed.flatMap((slab) => slab.gifts));
        if ((await missingGifts(allGiftIds)).length) {
            return fail(400, "One or more gifts were not found. Create the gift first.");
        }

        value.slabs = parsed.sort((a, b) => a.minAmount - b.minAmount);
        unset.minAmount = "";
        unset.gifts = "";
    }

    return { value, unset };
};

const loadScheme = (id) => Scheme.findById(id)
    .populate("slabs.gifts", "name stock")
    .populate("gifts", "name stock");

const queryAmount = (value, label) => {
    if (value === undefined || value === "") return {};
    const amount = positiveAmount(value);
    if (amount == null) return { error: `${label} must be a whole number greater than 0` };
    return { value: amount };
};

const createScheme = async (req, res, next) => {
    try {
        const built = await buildScheme(req.body);
        if (built.error) return res.status(built.error.status).json({ success: false, message: built.error.message });

        const scheme = await Scheme.create({ ...built.value, createdBy: req.user._id });
        const populated = await loadScheme(scheme._id);
        res.status(201).json({ success: true, message: "Scheme created", data: populated });
    } catch (error) {
        next(error);
    }
};

const getSchemes = async (req, res, next) => {
    try {
        const { search, type, gift, minAmount, maxAmount, sort = "newest" } = req.query;
        const and = [{ type: { $in: Scheme.SCHEME_TYPES } }];

        if (search && String(search).trim()) {
            and.push({ name: { $regex: escapeRegex(String(search).trim()), $options: "i" } });
        }
        if (type) {
            if (!Scheme.SCHEME_TYPES.includes(type)) {
                return res.status(400).json({ success: false, message: "Scheme type must be SLAB, OPEN, or FIRST_ORDER" });
            }
            and.push({ type });
        }
        if (gift) {
            if (!mongoose.Types.ObjectId.isValid(gift)) {
                return res.status(400).json({ success: false, message: "Invalid gift filter" });
            }
            and.push({ $or: [{ gifts: gift }, { "slabs.gifts": gift }] });
        }

        const amountMin = queryAmount(minAmount, "Minimum amount");
        const amountMax = queryAmount(maxAmount, "Maximum amount");
        if (amountMin.error || amountMax.error) {
            return res.status(400).json({ success: false, message: amountMin.error || amountMax.error });
        }
        if (amountMin.value != null && amountMax.value != null && amountMin.value > amountMax.value) {
            return res.status(400).json({ success: false, message: "Minimum amount cannot be greater than maximum amount" });
        }
        if (amountMin.value != null || amountMax.value != null) {
            const range = {};
            if (amountMin.value != null) range.$gte = amountMin.value;
            if (amountMax.value != null) range.$lte = amountMax.value;
            and.push({ type: "SLAB", "slabs.minAmount": range });
        }

        const sorts = {
            name: { name: 1 },
            newest: { createdAt: -1 },
            oldest: { createdAt: 1 },
        };
        if (!sorts[sort]) return res.status(400).json({ success: false, message: "Invalid sort" });

        const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const filter = { $and: and };
        const [total, schemes] = await Promise.all([
            Scheme.countDocuments(filter),
            Scheme.find(filter)
                .sort(sorts[sort])
                .populate("slabs.gifts", "name")
                .populate("gifts", "name")
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum),
        ]);

        res.status(200).json({
            success: true,
            data: schemes,
            pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 0, limit: limitNum },
        });
    } catch (error) {
        next(error);
    }
};

const getSchemeById = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid scheme id" });
        }
        const scheme = await loadScheme(req.params.id);
        if (!scheme || !Scheme.SCHEME_TYPES.includes(scheme.type)) {
            return res.status(404).json({ success: false, message: "Scheme not found" });
        }
        res.status(200).json({ success: true, data: scheme });
    } catch (error) {
        next(error);
    }
};

const updateScheme = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid scheme id" });
        }
        const existing = await Scheme.findById(req.params.id).select("_id type");
        if (!existing || !Scheme.SCHEME_TYPES.includes(existing.type)) {
            return res.status(404).json({ success: false, message: "Scheme not found" });
        }

        const built = await buildScheme(req.body, existing._id);
        if (built.error) return res.status(built.error.status).json({ success: false, message: built.error.message });

        const update = { $set: built.value };
        if (Object.keys(built.unset).length) update.$unset = built.unset;
        await Scheme.findByIdAndUpdate(existing._id, update, { runValidators: true });

        const populated = await loadScheme(existing._id);
        res.status(200).json({ success: true, message: "Scheme updated", data: populated });
    } catch (error) {
        next(error);
    }
};

const deleteScheme = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid scheme id" });
        }
        const scheme = await Scheme.findById(req.params.id);
        if (!scheme || !Scheme.SCHEME_TYPES.includes(scheme.type)) {
            return res.status(404).json({ success: false, message: "Scheme not found" });
        }
        await scheme.deleteOne();
        res.status(200).json({ success: true, message: "Scheme deleted" });
    } catch (error) {
        next(error);
    }
};

module.exports = { createScheme, getSchemes, getSchemeById, updateScheme, deleteScheme };
