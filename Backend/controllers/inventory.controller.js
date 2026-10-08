const mongoose = require("mongoose");
const Batch = require("../models/Batch");
const StockMovement = require("../models/StockMovement");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");
const { recordEntry, updateEntry, deleteEntry } = require("../utils/stock");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dayKey = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    return parts;
};
const addDays = (day, count) => {
    const date = new Date(`${day}T12:00:00+05:30`);
    date.setDate(date.getDate() + count);
    return dayKey(date);
};

const getInventory = async (req, res, next) => {
    try {
        const today = dayKey(new Date());
        const from = String(req.query.from || addDays(today, -6)).trim();
        const to = String(req.query.to || today).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
            return res.status(400).json({ success: false, message: "Use a valid date range" });
        }
        const span = Math.round((new Date(`${to}T12:00:00+05:30`) - new Date(`${from}T12:00:00+05:30`)) / 86400000);
        if (span > 30) {
            return res.status(400).json({ success: false, message: "Date range can be at most 31 days" });
        }
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const search = String(req.query.search || "").trim();
        const batchNo = String(req.query.batch || "").trim();

        const productFilter = {};
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            productFilter.$or = [{ name: rx }, { productCode: rx }, { productId: rx }];
        }
        if (batchNo) {
            const matched = await Batch.find({ batchNo: { $regex: escapeRegex(batchNo), $options: "i" } }).select("product").lean();
            productFilter._id = { $in: matched.map((item) => item.product) };
        }

        const [total, products] = await Promise.all([
            Product.countDocuments(productFilter),
            Product.find(productFilter)
                .select("name productCode productId mrp stock")
                .sort({ name: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
        const days = [];
        for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) days.push(cursor);
        if (!products.length) {
            return res.status(200).json({
                success: true,
                data: [],
                days,
                pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
            });
        }

        const batches = await Batch.find({
            product: { $in: products.map((item) => item._id) },
            ...(batchNo ? { batchNo: { $regex: escapeRegex(batchNo), $options: "i" } } : {}),
        }).sort({ expiryDate: 1, batchNo: 1 }).lean();

        const end = new Date(`${addDays(to, 1)}T00:00:00+05:30`);
        const batchIds = batches.map((batch) => batch._id);
        const [grouped, latestEntries] = batches.length
            ? await Promise.all([
                StockMovement.aggregate([
                { $match: { batch: { $in: batchIds }, at: { $lt: end } } },
                {
                    $group: {
                        _id: {
                            batch: "$batch",
                            day: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "Asia/Kolkata" } },
                        },
                        net: {
                            $sum: {
                                $cond: [
                                    { $in: ["$type", ["SALE", "DAMAGE", "EXPIRY"]] },
                                    { $multiply: ["$quantity", -1] },
                                    "$quantity",
                                ],
                            },
                        },
                    },
                },
            ]),
                StockMovement.aggregate([
                    {
                        $match: {
                            batch: { $in: batchIds },
                            type: { $in: ["OPENING", "PRODUCTION", "DAMAGE", "EXPIRY", "RETURN"] },
                            order: null,
                        },
                    },
                    { $sort: { at: -1, _id: -1 } },
                    {
                        $group: {
                            _id: "$batch",
                            id: { $first: "$_id" },
                            type: { $first: "$type" },
                            quantity: { $first: "$quantity" },
                            note: { $first: "$note" },
                        },
                    },
                ]),
            ])
            : [[], []];
        const entryByBatch = new Map(latestEntries.map((entry) => [String(entry._id), entry]));

        const data = products.flatMap((product) => {
            const ownBatches = batches.filter((batch) => String(batch.product) === String(product._id));
            if (!ownBatches.length) {
                const current = product.stock || 0;
                return [{
                    _id: `product-${product._id}`,
                    batchNo: "",
                    caseSize: "",
                    mfgDate: null,
                    expiryDate: null,
                    onHand: current,
                    reserved: 0,
                    available: current,
                    opening: current,
                    closing: current,
                    daily: {},
                    product,
                }];
            }
            return ownBatches.map((batch) => {
                let opening = 0;
                const daily = {};
                grouped.forEach((row) => {
                    if (String(row._id.batch) !== String(batch._id)) return;
                    if (row._id.day < from) opening += row.net;
                    else daily[row._id.day] = row.net;
                });
                const closing = days.reduce((sum, day) => sum + (daily[day] || 0), opening);
                const entry = entryByBatch.get(String(batch._id));
                return {
                    _id: batch._id,
                    batchNo: batch.batchNo,
                    caseSize: batch.caseSize,
                    mfgDate: batch.mfgDate,
                    expiryDate: batch.expiryDate,
                    onHand: batch.onHand,
                    reserved: batch.reserved,
                    available: batch.onHand - batch.reserved,
                    opening,
                    closing,
                    daily,
                    product,
                    entry: entry ? { _id: entry.id, type: entry.type, quantity: entry.quantity, note: entry.note || "" } : null,
                };
            });
        });

        res.status(200).json({
            success: true,
            data,
            days,
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        next(error);
    }
};

const postInventoryEntry = async (req, res, next) => {
    try {
        const type = String(req.body.type || "").trim().toUpperCase();
        if (!["PRODUCTION", "DAMAGE", "EXPIRY", "RETURN"].includes(type)) {
            return res.status(400).json({ success: false, message: "Choose production, damage, expiry, or return" });
        }
        if (!mongoose.Types.ObjectId.isValid(req.body.productId)) {
            return res.status(400).json({ success: false, message: "Choose a product" });
        }
        const product = await Product.findById(req.body.productId).select("_id status");
        if (!product || product.status === "INACTIVE") {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        await recordEntry({
            productId: product._id,
            batchNo: req.body.batchNo,
            caseSize: req.body.caseSize,
            mfgDate: String(req.body.mfgDate || "").trim(),
            expiryDate: String(req.body.expiryDate || "").trim(),
            quantity: Number(req.body.quantity),
            type,
            note: req.body.note,
            userId: req.user._id,
        });
        res.status(201).json({ success: true, message: "Inventory updated" });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "This batch already exists" });
        }
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const emptySummary = () => ({ OPENING: 0, PRODUCTION: 0, SALE: 0, DAMAGE: 0, EXPIRY: 0, RETURN: 0, OTHER: 0 });

const liveStock = async (product) => {
    const [row] = await Batch.aggregate([
        { $match: { product: product._id } },
        { $group: { _id: null, onHand: { $sum: "$onHand" }, reserved: { $sum: "$reserved" } } },
    ]);
    const onHand = row ? row.onHand : (product.stock || 0);
    const reserved = row ? row.reserved : 0;
    return {
        _id: product._id,
        name: product.name,
        productCode: product.productCode,
        productId: product.productId,
        onHand,
        reserved,
        available: onHand - reserved,
    };
};

const getInventoryHistory = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const search = String(req.query.search || "").trim();
        const batchNo = String(req.query.batch || "").trim();
        const orderCode = String(req.query.order || "").trim();
        const type = String(req.query.type || "").trim().toUpperCase();
        const from = String(req.query.from || "").trim();
        const to = String(req.query.to || "").trim();
        const productId = String(req.query.product || "").trim();

        if (type && !["OPENING", "PRODUCTION", "SALE", "DAMAGE", "EXPIRY", "RETURN", "OTHER"].includes(type)) {
            return res.status(400).json({ success: false, message: "Choose a valid movement type" });
        }
        if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to)) {
            return res.status(400).json({ success: false, message: "Use a valid date range" });
        }
        if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: "Choose a product" });
        }

        const [productDoc, searchedProducts, matchedBatches, matchedOrders] = await Promise.all([
            productId ? Product.findById(productId).select("name productCode productId stock").lean() : null,
            !productId && search
                ? Product.find({
                    $or: ["name", "productCode", "productId"].map((field) => ({ [field]: { $regex: escapeRegex(search), $options: "i" } })),
                }).select("_id").limit(500).lean()
                : null,
            batchNo
                ? Batch.find({ batchNo: { $regex: escapeRegex(batchNo), $options: "i" } }).select("_id").limit(500).lean()
                : null,
            orderCode
                ? Order.find({ orderCode: { $regex: escapeRegex(orderCode), $options: "i" } }).select("_id").limit(200).lean()
                : null,
        ]);

        if (productId && !productDoc) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const pagination = { page, limit, total: 0, pages: 1 };
        const sendEmpty = async () => res.status(200).json({
            success: true,
            data: [],
            summary: emptySummary(),
            product: productDoc ? await liveStock(productDoc) : null,
            pagination,
        });

        if ((searchedProducts && !searchedProducts.length) || (matchedBatches && !matchedBatches.length) || (matchedOrders && !matchedOrders.length)) {
            return sendEmpty();
        }

        const filter = {};
        if (productDoc) filter.product = productDoc._id;
        else if (searchedProducts) filter.product = { $in: searchedProducts.map((item) => item._id) };
        if (matchedBatches) filter.batch = { $in: matchedBatches.map((item) => item._id) };
        if (matchedOrders) filter.order = { $in: matchedOrders.map((item) => item._id) };
        if (type) filter.type = type;
        if (from || to) {
            filter.at = {};
            if (from) filter.at.$gte = new Date(`${from}T00:00:00+05:30`);
            if (to) filter.at.$lt = new Date(`${addDays(to, 1)}T00:00:00+05:30`);
        }

        const [total, movements, grouped, productLive] = await Promise.all([
            StockMovement.countDocuments(filter),
            StockMovement.find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            StockMovement.aggregate([
                { $match: filter },
                { $group: { _id: "$type", quantity: { $sum: "$quantity" } } },
            ]),
            productDoc ? liveStock(productDoc) : null,
        ]);

        const summary = emptySummary();
        grouped.forEach((row) => {
            if (Object.prototype.hasOwnProperty.call(summary, row._id)) summary[row._id] = row.quantity;
        });

        const productIds = [...new Set(movements.map((item) => String(item.product)))];
        const batchIds = [...new Set(movements.map((item) => String(item.batch)))];
        const orderIds = [...new Set(movements.map((item) => item.order).filter(Boolean).map(String))];
        const userIds = [...new Set(movements.map((item) => item.createdBy).filter(Boolean).map(String))];

        const [products, batches, orders, users] = await Promise.all([
            productIds.length ? Product.find({ _id: { $in: productIds } }).select("name productCode productId").lean() : [],
            batchIds.length ? Batch.find({ _id: { $in: batchIds } }).select("batchNo caseSize mfgDate expiryDate").lean() : [],
            orderIds.length ? Order.find({ _id: { $in: orderIds } }).select("orderCode status").lean() : [],
            userIds.length ? User.find({ _id: { $in: userIds } }).select("name employeeId").lean() : [],
        ]);
        const productMap = new Map(products.map((item) => [String(item._id), item]));
        const batchMap = new Map(batches.map((item) => [String(item._id), item]));
        const orderMap = new Map(orders.map((item) => [String(item._id), item]));
        const userMap = new Map(users.map((item) => [String(item._id), item]));
        const manual = new Set(["OPENING", "PRODUCTION", "DAMAGE", "EXPIRY", "RETURN"]);

        const data = movements.map((item) => ({
            _id: item._id,
            type: item.type,
            quantity: item.quantity,
            effect: item.type === "SALE" || item.type === "DAMAGE" || item.type === "EXPIRY" ? -item.quantity : item.quantity,
            note: item.note || "",
            at: item.at,
            editable: manual.has(item.type) && !item.order,
            product: productMap.get(String(item.product)) || null,
            batch: batchMap.get(String(item.batch)) || null,
            order: item.order ? (orderMap.get(String(item.order)) || null) : null,
            createdBy: item.createdBy ? (userMap.get(String(item.createdBy)) || null) : null,
        }));

        res.status(200).json({
            success: true,
            data,
            summary,
            product: productLive,
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        next(error);
    }
};

const patchInventoryEntry = async (req, res, next) => {
    try {
        await updateEntry({
            movementId: req.params.id,
            quantity: Number(req.body.quantity),
            note: req.body.note,
            caseSize: req.body.caseSize,
            mfgDate: String(req.body.mfgDate || "").trim(),
            expiryDate: String(req.body.expiryDate || "").trim(),
        });
        res.status(200).json({ success: true, message: "Stock entry updated" });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const deleteInventoryEntry = async (req, res, next) => {
    try {
        await deleteEntry(req.params.id);
        res.status(200).json({ success: true, message: "Stock entry deleted" });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

module.exports = { getInventory, getInventoryHistory, postInventoryEntry, patchInventoryEntry, deleteInventoryEntry };
