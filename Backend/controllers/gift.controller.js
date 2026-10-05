const mongoose = require("mongoose");
const Gift = require("../models/Gift");
const Scheme = require("../models/Scheme");
const { uploadGiftImage } = require("../config/cloudinary");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const receiveGiftImage = (req, res, next) => {
    uploadGiftImage.single("image")(req, res, (error) => {
        if (!error) return next();
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ success: false, message: "Image must be 5 MB or smaller" });
        }
        return res.status(error.status || 400).json({
            success: false,
            message: error.message || "Could not upload image",
        });
    });
};

const nameTaken = (name, excludeId) => {
    const filter = { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } };
    if (excludeId) filter._id = { $ne: excludeId };
    return Gift.findOne(filter).select("_id");
};

const invalidId = (res) => res.status(400).json({ success: false, message: "Invalid gift id" });

const createGift = async (req, res, next) => {
    try {
        if (!req.file?.path) {
            return res.status(400).json({ success: false, message: "Gift image is required" });
        }

        const name = String(req.body.name || "").trim();
        if (await nameTaken(name)) {
            return res.status(409).json({ success: false, message: "A gift with this name already exists" });
        }

        const gift = await Gift.create({
            name,
            price: Number(req.body.price),
            description: String(req.body.description || "").trim(),
            image: req.file.path,
            stock: Number(req.body.stock),
            createdBy: req.user._id,
        });

        res.status(201).json({ success: true, message: "Gift created", data: gift });
    } catch (error) {
        next(error);
    }
};

const bound = (value, label, whole) => {
    if (value === undefined || value === "") return {};
    const text = String(value).trim();
    const valid = whole ? /^\d+$/.test(text) : /^\d+(\.\d{1,2})?$/.test(text);
    if (!valid) return { error: `${label} must be a valid number` };
    return { value: Number(text) };
};

const getGifts = async (req, res, next) => {
    try {
        const { search, stockStatus, minPrice, maxPrice, minStock, maxStock, sort = "name" } = req.query;
        const filter = {};

        if (search && String(search).trim()) {
            const safe = escapeRegex(String(search).trim());
            filter.$or = [
                { name: { $regex: safe, $options: "i" } },
                { description: { $regex: safe, $options: "i" } },
            ];
        }

        const priceMin = bound(minPrice, "Minimum price", false);
        const priceMax = bound(maxPrice, "Maximum price", false);
        const stockMin = bound(minStock, "Minimum stock", true);
        const stockMax = bound(maxStock, "Maximum stock", true);
        const rangeError = priceMin.error || priceMax.error || stockMin.error || stockMax.error;
        if (rangeError) return res.status(400).json({ success: false, message: rangeError });
        if (priceMin.value != null && priceMax.value != null && priceMin.value > priceMax.value) {
            return res.status(400).json({ success: false, message: "Minimum price cannot be greater than maximum price" });
        }
        if (stockMin.value != null && stockMax.value != null && stockMin.value > stockMax.value) {
            return res.status(400).json({ success: false, message: "Minimum stock cannot be greater than maximum stock" });
        }

        if (priceMin.value != null || priceMax.value != null) {
            filter.price = {};
            if (priceMin.value != null) filter.price.$gte = priceMin.value;
            if (priceMax.value != null) filter.price.$lte = priceMax.value;
        }

        const stock = {};
        if (stockStatus) {
            const normalized = String(stockStatus).toUpperCase();
            if (normalized === "IN_STOCK") stock.$gt = 0;
            else if (normalized === "OUT_OF_STOCK") stock.$lte = 0;
            else return res.status(400).json({ success: false, message: "Stock filter must be IN_STOCK or OUT_OF_STOCK" });
        }
        if (stockMin.value != null) stock.$gte = stockMin.value;
        if (stockMax.value != null) {
            stock.$lte = stock.$lte == null ? stockMax.value : Math.min(stock.$lte, stockMax.value);
        }
        if (Object.keys(stock).length) filter.stock = stock;

        const sorts = {
            name: { name: 1 },
            price_asc: { price: 1, name: 1 },
            price_desc: { price: -1, name: 1 },
            stock_asc: { stock: 1, name: 1 },
            stock_desc: { stock: -1, name: 1 },
            newest: { createdAt: -1 },
            oldest: { createdAt: 1 },
        };
        if (!sorts[sort]) {
            return res.status(400).json({ success: false, message: "Invalid sort" });
        }

        const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const [total, gifts] = await Promise.all([
            Gift.countDocuments(filter),
            Gift.find(filter)
                .sort(sorts[sort])
                .select("name price description image stock createdAt")
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum),
        ]);
        res.status(200).json({
            success: true,
            data: gifts,
            pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 0, limit: limitNum },
        });
    } catch (error) {
        next(error);
    }
};

const getGiftById = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return invalidId(res);
        const gift = await Gift.findById(req.params.id).select("name price description image stock createdAt");
        if (!gift) return res.status(404).json({ success: false, message: "Gift not found" });
        res.status(200).json({ success: true, data: gift });
    } catch (error) {
        next(error);
    }
};

const updateGift = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return invalidId(res);

        const gift = await Gift.findById(req.params.id);
        if (!gift) {
            return res.status(404).json({ success: false, message: "Gift not found" });
        }

        const name = req.body.name !== undefined ? String(req.body.name).trim() : gift.name;
        if (name.toLowerCase() !== gift.name.toLowerCase() && await nameTaken(name, gift._id)) {
            return res.status(409).json({ success: false, message: "A gift with this name already exists" });
        }

        if (!gift.image && !req.file?.path) {
            return res.status(400).json({ success: false, message: "Gift image is required" });
        }

        gift.name = name;
        if (req.body.price !== undefined) gift.price = Number(req.body.price);
        if (req.body.description !== undefined) gift.description = String(req.body.description).trim();
        if (req.file?.path) gift.image = req.file.path;

        await gift.save();
        res.status(200).json({ success: true, message: "Gift updated", data: gift });
    } catch (error) {
        next(error);
    }
};

const updateGiftStock = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return invalidId(res);

        const gift = await Gift.findByIdAndUpdate(
            req.params.id,
            { stock: Number(req.body.stock) },
            { returnDocument: "after", runValidators: true }
        ).select("name price description image stock createdAt");

        if (!gift) {
            return res.status(404).json({ success: false, message: "Gift not found" });
        }

        res.status(200).json({
            success: true,
            message: gift.stock > 0 ? "Gift stock updated" : "Gift is out of stock",
            data: gift,
        });
    } catch (error) {
        next(error);
    }
};

const deleteGift = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return invalidId(res);

        const gift = await Gift.findById(req.params.id);
        if (!gift) {
            return res.status(404).json({ success: false, message: "Gift not found" });
        }

        const usedIn = await Scheme.find({
            $or: [{ gifts: gift._id }, { "slabs.gifts": gift._id }],
        }).select("name");

        if (usedIn.length) {
            const names = usedIn.map((scheme) => scheme.name).join(", ");
            return res.status(409).json({
                success: false,
                message: `This gift is used in ${names}. Remove it from those schemes before deleting.`,
            });
        }

        await gift.deleteOne();
        res.status(200).json({ success: true, message: "Gift deleted" });
    } catch (error) {
        next(error);
    }
};

module.exports = { receiveGiftImage, createGift, getGifts, getGiftById, updateGift, updateGiftStock, deleteGift };
