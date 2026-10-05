const crypto = require("crypto");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Scheme = require("../models/Scheme");
const Gift = require("../models/Gift");
const Customer = require("../models/Customer");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const User = require("../models/User");
const { downlineIds } = require("../utils/reporting");
const { releaseLines, allocate, shipOrder, restoreShipped } = require("../utils/stock");
const { nextOrderCode } = require("../utils/customerCode");
const { sanitizeRichText, plainRichText } = require("../utils/richText");
const { targetSnapshot } = require("./target.controller");

const PLACED_STATUSES = ["PLACED", "PENDING_CONFIRM", "PENDING", "CONFIRM", "READY_TO_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"];
const PAYMENT_METHODS = ["COD", "ONLINE", "CASH", "ADVANCE_COD"];
const NEXT_STATUS = {
    PLACED: "CONFIRM",
    PENDING_CONFIRM: "CONFIRM",
    PENDING: "CONFIRM",
    CONFIRM: "READY_TO_DELIVERY",
    READY_TO_DELIVERY: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
};
const REIMBURSE_TYPES = ["DAMAGE", "EXPIRY", "RETURN", "OTHER"];

const razorpayClient = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
};

const verifyRazorpaySignature = (orderId, paymentId, signature) => {
    const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
    const left = Buffer.from(expected);
    const right = Buffer.from(String(signature || ""));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const moneyFor = (lines) => {
    let subtotal = 0;
    let gstTotal = 0;
    const priced = (lines || []).map((line) => {
        const amount = round2(line.sellPrice * line.quantity);
        const gst = round2(amount * (line.gstPercent / 100));
        subtotal += amount;
        gstTotal += gst;
        const plainLine = typeof line.toObject === "function" ? line.toObject() : line;
        return { ...plainLine, amount, gst, lineTotal: round2(amount + gst) };
    });
    return {
        lines: priced,
        subtotal: round2(subtotal),
        gstTotal: round2(gstTotal),
        total: round2(subtotal + gstTotal),
    };
};

const clearSplit = (order) => {
    order.advanceAmount = 0;
    order.pendingAmount = 0;
    order.set("advanceMode", undefined);
};

const advanceError = (advance, total, online) => {
    if (!Number.isFinite(advance) || advance <= 0) return "Enter an advance amount greater than zero";
    if (advance >= total) return "Advance must be less than the order total. Use Cash or Pay online for the full amount";
    if (online && Math.round(advance * 100) < 100) return "Online advance needs at least ₹1";
    return "";
};

const present = (order) => {
    const totals = moneyFor(order.lines || []);
    const plain = order.toObject ? order.toObject() : { ...order };
    delete plain.razorpaySignature;
    return { ...plain, ...totals };
};

const loadDraft = async (id, userId) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return { error: { status: 400, message: "Invalid order id" } };
    const order = await Order.findOne({ _id: id, createdBy: userId, status: "DRAFT" });
    if (!order) return { error: { status: 404, message: "Draft order not found" } };
    return { order };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isFieldExecutive = (user) => {
    if (!user || user.userType === "ADMIN") return false;
    const normalize = (value) => String(value || "").toUpperCase().replace(/[\s_-]+/g, "");
    return normalize(user.role) === "FIELDEXECUTIVE" || normalize(user.userType) === "FIELDEXECUTIVE";
};

const orderScope = async (user) => {
    if (!user || user.userType === "ADMIN") return {};
    const selfId = new mongoose.Types.ObjectId(user._id);
    const below = await downlineIds(user._id);
    if (below.length) return { createdBy: { $in: [selfId, ...below] } };
    if (isFieldExecutive(user)) return { createdBy: selfId };
    return {};
};

const orderVisibleTo = (scope, createdBy) => {
    if (!scope.createdBy) return true;
    const allowed = scope.createdBy.$in || [scope.createdBy];
    return allowed.some((id) => String(id) === String(createdBy));
};

const catalog = async (req, res, next) => {
    try {
        const search = String(req.query.search || "").trim();
        const filter = { status: "ACTIVE" };
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            filter.$or = [{ name: rx }, { productCode: rx }, { productId: rx }];
        }
        const products = await Product.find(filter)
            .select("name mainImage sellPrice gstPercent stock productCode")
            .sort({ name: 1 })
            .limit(30)
            .lean();
        res.status(200).json({ success: true, data: products });
    } catch (error) {
        next(error);
    }
};

const startOrder = async (req, res, next) => {
    try {
        const customerId = req.body.customerId;
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
            return res.status(400).json({ success: false, message: "Select a customer first" });
        }
        const customer = await Customer.findById(customerId).select("_id customerCode retailerName firmName").lean();
        if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

        let order = await Order.findOne({ customer: customerId, createdBy: req.user._id, status: "DRAFT" });
        if (!order) {
            order = await Order.create({ customer: customerId, createdBy: req.user._id, lines: [] });
        }
        res.status(200).json({ success: true, data: present(order) });
    } catch (error) {
        next(error);
    }
};

const setLine = async (req, res, next) => {
    try {
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;

        const quantity = Number(req.body.quantity);
        const remark = String(req.body.remark || "").trim();
        if (!mongoose.Types.ObjectId.isValid(req.body.productId) || !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ success: false, message: "Enter a whole quantity of at least 1" });
        }

        const product = await Product.findById(req.body.productId).select("name mainImage sellPrice gstPercent stock status");
        if (!product || product.status === "INACTIVE") {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const index = order.lines.findIndex((line) => String(line.product) === String(product._id));
        const previous = index >= 0 ? order.lines[index] : null;
        let reserved;
        try {
            reserved = await allocate(product._id, quantity, previous);
        } catch (error) {
            return res.status(error.status || 500).json({ success: false, message: error.message || "Could not reserve stock" });
        }
        const { lockedQty, overQty, allocations } = reserved;

        const line = {
            product: product._id,
            name: product.name,
            image: product.mainImage || "",
            sellPrice: product.sellPrice,
            gstPercent: product.gstPercent || 0,
            quantity,
            lockedQty,
            overQty,
            allocations,
            shipped: false,
            remark: overQty > 0 ? (remark || "Quantity is more than available stock. It will be manufactured.") : "",
        };
        if (index >= 0) order.lines.splice(index, 1, line);
        else order.lines.push(line);

        order.expiryLines = order.expiryLines.filter((item) =>
            order.lines.some((row) => String(row.product) === String(item.product))
        );
        await order.save();
        res.status(200).json({ success: true, data: present(order) });
    } catch (error) {
        next(error);
    }
};

const removeLine = async (req, res, next) => {
    try {
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;
        const index = order.lines.findIndex((line) => String(line.product) === req.params.productId);
        if (index < 0) return res.status(404).json({ success: false, message: "Product is not on this order" });

        const [line] = order.lines.splice(index, 1);
        await releaseLines([line]);
        order.expiryLines = order.expiryLines.filter((item) => String(item.product) !== String(line.product));
        await order.save();
        res.status(200).json({ success: true, data: present(order) });
    } catch (error) {
        next(error);
    }
};

const schemeOptions = async (req, res, next) => {
    try {
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;

        const [placedCount, schemes] = await Promise.all([
            Order.countDocuments({ customer: order.customer, status: { $in: PLACED_STATUSES } }),
            Scheme.find({ type: { $in: Scheme.SCHEME_TYPES } })
                .select("name type slabs gifts")
                .populate("slabs.gifts", "name image")
                .populate("gifts", "name image")
                .lean(),
        ]);

        const isFirstOrder = placedCount === 0;
        const options = schemes.filter((scheme) => scheme.type !== "FIRST_ORDER" || isFirstOrder);
        res.status(200).json({ success: true, data: { isFirstOrder, schemes: options } });
    } catch (error) {
        next(error);
    }
};

const setScheme = async (req, res, next) => {
    try {
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;

        if (req.body.openRequest) {
            const note = sanitizeRichText(req.body.note);
            const text = plainRichText(note);
            if (!text) {
                return res.status(400).json({ success: false, message: "Write the open request" });
            }
            if (text.length > 2000) {
                return res.status(400).json({ success: false, message: "Open request is too long" });
            }
            const openScheme = await Scheme.findOne({ type: "OPEN" }).select("name");
            order.scheme = openScheme?._id || null;
            order.schemeType = "OPEN";
            order.schemeName = openScheme?.name || "Open request";
            order.schemeGift = null;
            order.schemeGiftName = "";
            order.schemeGiftImage = "";
            order.schemeGifts = [];
            order.schemeNote = note;
            order.schemeCommitmentAmount = null;
            order.schemeCommitmentMonths = null;
            await order.save();
            return res.status(200).json({ success: true, data: present(order) });
        }

        if (!req.body.schemeId) {
            await Order.updateOne(
                { _id: order._id },
                {
                    $unset: { scheme: 1, schemeType: 1, schemeGift: 1, schemeCommitmentAmount: 1, schemeCommitmentMonths: 1 },
                    $set: { schemeName: "", schemeGiftName: "", schemeGiftImage: "", schemeGifts: [], schemeNote: "" },
                }
            );
            const cleared = await Order.findById(order._id);
            return res.status(200).json({ success: true, data: present(cleared) });
        }

        if (!mongoose.Types.ObjectId.isValid(req.body.schemeId)) {
            return res.status(400).json({ success: false, message: "Invalid scheme" });
        }

        const [scheme, placedCount] = await Promise.all([
            Scheme.findById(req.body.schemeId)
                .select("name type slabs gifts")
                .populate("slabs.gifts", "name image")
                .populate("gifts", "name image"),
            Order.countDocuments({ customer: order.customer, status: { $in: PLACED_STATUSES } }),
        ]);
        if (!scheme || !Scheme.SCHEME_TYPES.includes(scheme.type)) {
            return res.status(404).json({ success: false, message: "Scheme not found" });
        }
        if (scheme.type === "FIRST_ORDER" && placedCount > 0) {
            return res.status(400).json({ success: false, message: "First order scheme is only for a customer's first order" });
        }

        const snaps = new Map();
        const remember = (gift) => {
            if (gift?._id) snaps.set(String(gift._id), { name: gift.name, image: gift.image || "" });
        };
        (scheme.gifts || []).forEach(remember);
        (scheme.slabs || []).forEach((slab) => (slab.gifts || []).forEach(remember));

        order.scheme = scheme._id;
        order.schemeType = scheme.type;
        order.schemeName = scheme.name;
        order.schemeGift = null;
        order.schemeGiftName = "";
        order.schemeGiftImage = "";
        order.schemeNote = "";
        order.schemeGifts = [...snaps.values()];
        order.schemeCommitmentAmount = null;
        order.schemeCommitmentMonths = null;

        if (scheme.type === "OPEN") {
            if (!mongoose.Types.ObjectId.isValid(req.body.giftId)) {
                return res.status(400).json({ success: false, message: "Select a gift for the open scheme" });
            }
            const gift = await Gift.findById(req.body.giftId).select("name image");
            if (!gift) return res.status(404).json({ success: false, message: "Gift not found" });
            order.schemeGift = gift._id;
            order.schemeGiftName = gift.name;
            order.schemeGiftImage = gift.image || "";
            order.schemeGifts = [{ name: gift.name, image: gift.image || "" }];
            order.schemeNote = String(req.body.note || "").trim();
            order.schemeCommitmentAmount = Number(req.body.amount) || null;
            order.schemeCommitmentMonths = Number(req.body.months) || null;
        }

        await order.save();
        res.status(200).json({ success: true, data: present(order) });
    } catch (error) {
        next(error);
    }
};

const setExpiry = async (req, res, next) => {
    try {
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;
        const enabled = Boolean(req.body.enabled);
        const incoming = Array.isArray(req.body.lines) ? req.body.lines : [];

        if (!enabled) {
            order.expiryEnabled = false;
            order.expiryLines = [];
            await order.save();
            return res.status(200).json({ success: true, data: present(order) });
        }

        const byProduct = new Map(order.lines.map((line) => [String(line.product), line]));
        const expiryLines = [];
        for (const item of incoming) {
            const line = byProduct.get(String(item.productId));
            const quantity = Number(item.quantity);
            const type = String(item.type || "").trim().toUpperCase();
            const otherLabel = String(item.otherLabel || "").trim().slice(0, 80);
            const note = String(item.note || "").trim().slice(0, 200);
            if (!line || !Number.isInteger(quantity) || quantity < 1) {
                return res.status(400).json({ success: false, message: "Enter a whole quantity of at least 1" });
            }
            if (!REIMBURSE_TYPES.includes(type)) {
                return res.status(400).json({ success: false, message: "Choose damage, expiry, return, or other" });
            }
            if (type === "OTHER" && !otherLabel) {
                return res.status(400).json({ success: false, message: "Write what the other reimbursement is" });
            }
            expiryLines.push({
                product: line.product,
                name: line.name,
                image: line.image,
                quantity,
                type,
                otherLabel: type === "OTHER" ? otherLabel : "",
                note,
                purchasedDate: "",
            });
        }
        if (!expiryLines.length) {
            return res.status(400).json({ success: false, message: "Enter a product and its quantity" });
        }

        order.expiryEnabled = true;
        order.expiryLines = expiryLines;
        await order.save();
        res.status(200).json({ success: true, data: present(order) });
    } catch (error) {
        next(error);
    }
};

const placeOrder = async (req, res, next) => {
    try {
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;

        const method = String(req.body.paymentMethod || "").trim();
        if (!["COD", "CASH", "ADVANCE_COD"].includes(method)) {
            return res.status(400).json({ success: false, message: "Choose cash, cash on delivery, or an advance" });
        }
        if (!order.lines.length) {
            return res.status(400).json({ success: false, message: "Add at least one product" });
        }

        const totals = moneyFor(order.lines);
        if (method === "ADVANCE_COD") {
            if (String(req.body.advanceMode || "").trim() !== "CASH") {
                return res.status(400).json({ success: false, message: "Pay this advance online, or collect it in cash" });
            }
            const advance = round2(req.body.advanceAmount);
            const problem = advanceError(advance, totals.total, false);
            if (problem) return res.status(400).json({ success: false, message: problem });
            order.paymentMethod = "ADVANCE_COD";
            order.advanceAmount = advance;
            order.advanceMode = "CASH";
            order.pendingAmount = round2(totals.total - advance);
            order.paidAt = new Date();
        } else if (method === "CASH") {
            clearSplit(order);
            order.paymentMethod = "CASH";
            order.paidAt = new Date();
        } else {
            clearSplit(order);
            order.paymentMethod = "COD";
            order.pendingAmount = totals.total;
            order.set("paidAt", undefined);
        }
        order.razorpayOrderId = "";
        order.razorpayPaymentId = "";
        order.razorpaySignature = "";
        order.set("razorpayAmount", undefined);
        order.status = "PENDING";
        order.subtotal = totals.subtotal;
        order.gstTotal = totals.gstTotal;
        order.total = totals.total;
        order.placedAt = new Date();
        if (!order.orderCode) order.orderCode = await nextOrderCode(order.placedAt);
        await order.save();
        await Customer.updateOne(
            { _id: order.customer, leadStage: { $ne: "CONVERTED" } },
            { $set: { leadStage: "CONVERTED", convertedAt: order.placedAt, convertedOrder: order._id }, $unset: { nextFollowUpAt: "", nextPurpose: "", lostReason: "" } }
        );
        res.status(200).json({ success: true, message: "Order placed", data: present(order) });
    } catch (error) {
        next(error);
    }
};

const cancelOrder = async (req, res, next) => {
    try {
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;
        await releaseLines(order.lines);
        await order.deleteOne();
        res.status(200).json({ success: true, message: "Draft order cancelled" });
    } catch (error) {
        next(error);
    }
};

const assignMissingCodes = async () => {
    const missing = await Order.find({
        status: { $in: PLACED_STATUSES },
        $or: [{ orderCode: { $exists: false } }, { orderCode: null }, { orderCode: "" }],
    }).sort({ placedAt: 1, createdAt: 1 }).select("_id placedAt").lean();
    if (!missing.length) return;

    const writes = [];
    for (const row of missing) {
        writes.push({
            updateOne: {
                filter: { _id: row._id, $or: [{ orderCode: { $exists: false } }, { orderCode: null }, { orderCode: "" }] },
                update: { $set: { orderCode: await nextOrderCode(row.placedAt || new Date()) } },
            },
        });
    }
    await Order.bulkWrite(writes);
};

const listOrders = async (req, res, next) => {
    try {
        await assignMissingCodes();

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const search = String(req.query.search || "").trim();
        const customerName = String(req.query.customerName || "").trim();
        const customerCode = String(req.query.customerCode || "").trim();
        const product = String(req.query.product || "").trim();
        const from = String(req.query.from || "").trim();
        const to = String(req.query.to || "").trim();
        const schemeType = String(req.query.schemeType || "").trim();
        const expiry = String(req.query.expiry || "").trim();
        const sort = String(req.query.sort || "newest");
        const requestedStatus = String(req.query.status || "").trim();
        const paymentMethod = String(req.query.paymentMethod || "").trim();
        const numberOrNull = (value) => {
            if (value === undefined || value === null || String(value).trim() === "") return null;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : NaN;
        };
        const minQty = numberOrNull(req.query.minQty);
        const maxQty = numberOrNull(req.query.maxQty);
        const minTotal = numberOrNull(req.query.minTotal);
        const maxTotal = numberOrNull(req.query.maxTotal);
        if ([minQty, maxQty, minTotal, maxTotal].some((value) => Number.isNaN(value))) {
            return res.status(400).json({ success: false, message: "Quantity and amount filters must be numbers" });
        }
        if ((minQty !== null && maxQty !== null && minQty > maxQty) || (minTotal !== null && maxTotal !== null && minTotal > maxTotal)) {
            return res.status(400).json({ success: false, message: "The minimum filter cannot be greater than the maximum" });
        }
        if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
            return res.status(400).json({ success: false, message: "Use a valid date range" });
        }

        const match = requestedStatus === "PENDING"
            ? { status: { $in: ["PLACED", "PENDING_CONFIRM", "PENDING"] } }
            : ["CONFIRM", "READY_TO_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(requestedStatus)
                ? { status: requestedStatus }
                : { status: { $in: PLACED_STATUSES } };
        if (PAYMENT_METHODS.includes(paymentMethod)) match.paymentMethod = paymentMethod;
        if (from || to) {
            match.placedAt = {};
            if (from) match.placedAt.$gte = new Date(`${from}T00:00:00`);
            if (to) match.placedAt.$lte = new Date(`${to}T23:59:59.999`);
        }
        if (schemeType === "NONE") match.schemeType = { $exists: false };
        else if (["SLAB", "OPEN", "FIRST_ORDER"].includes(schemeType)) match.schemeType = schemeType;
        if (expiry === "yes") match.expiryEnabled = true;
        if (expiry === "no") match.expiryEnabled = { $ne: true };
        if (product) match["lines.name"] = { $regex: escapeRegex(product), $options: "i" };
        if (minTotal !== null || maxTotal !== null) {
            match.total = {};
            if (minTotal !== null) match.total.$gte = minTotal;
            if (maxTotal !== null) match.total.$lte = maxTotal;
        }

        const afterLookup = {};
        if (customerName) afterLookup["customerDoc.retailerName"] = { $regex: escapeRegex(customerName), $options: "i" };
        if (customerCode) afterLookup["customerDoc.customerCode"] = { $regex: escapeRegex(customerCode), $options: "i" };
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            afterLookup.$or = [
                { orderCode: rx },
                { "customerDoc.retailerName": rx },
                { "customerDoc.firmName": rx },
                { "customerDoc.customerCode": rx },
                { "lines.name": rx },
            ];
        }
        if (minQty !== null || maxQty !== null) {
            afterLookup.totalQty = {};
            if (minQty !== null) afterLookup.totalQty.$gte = minQty;
            if (maxQty !== null) afterLookup.totalQty.$lte = maxQty;
        }
        Object.assign(match, await orderScope(req.user));

        const sorts = {
            newest: { placedAt: -1 },
            oldest: { placedAt: 1 },
            total_desc: { total: -1 },
            total_asc: { total: 1 },
            qty_desc: { totalQty: -1 },
            qty_asc: { totalQty: 1 },
        };

        const [result] = await Order.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: Customer.collection.name,
                    localField: "customer",
                    foreignField: "_id",
                    pipeline: [{ $project: { retailerName: 1, firmName: 1, customerCode: 1 } }],
                    as: "customerDoc",
                },
            },
            { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
            { $addFields: { totalQty: { $sum: "$lines.quantity" } } },
            { $match: afterLookup },
            { $sort: sorts[sort] || sorts.newest },
            {
                $facet: {
                    rows: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                        {
                            $project: {
                                orderCode: 1,
                                status: 1,
                                placedAt: 1,
                                paymentMethod: 1,
                                advanceAmount: 1,
                                advanceMode: 1,
                                pendingAmount: 1,
                                razorpayOrderId: 1,
                                razorpayPaymentId: 1,
                                paidAt: 1,
                                subtotal: 1,
                                gstTotal: 1,
                                total: 1,
                                totalQty: 1,
                                schemeName: 1,
                                schemeType: 1,
                                schemeGiftName: 1,
                                schemeNote: 1,
                                schemeCommitmentAmount: 1,
                                schemeCommitmentMonths: 1,
                                expiryEnabled: 1,
                                customerName: "$customerDoc.retailerName",
                                firmName: "$customerDoc.firmName",
                                customerCode: "$customerDoc.customerCode",
                                customerId: "$customer",
                                lines: {
                                    $map: {
                                        input: "$lines",
                                        as: "line",
                                        in: {
                                            name: "$$line.name",
                                            image: "$$line.image",
                                            quantity: "$$line.quantity",
                                        },
                                    },
                                },
                                expiryLines: {
                                    $map: {
                                        input: "$expiryLines",
                                        as: "item",
                                        in: {
                                            name: "$$item.name",
                                            quantity: "$$item.quantity",
                                            type: { $ifNull: ["$$item.type", "EXPIRY"] },
                                            otherLabel: { $ifNull: ["$$item.otherLabel", ""] },
                                            note: { $ifNull: ["$$item.note", ""] },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                    total: [{ $count: "count" }],
                },
            },
        ]);

        const total = result?.total?.[0]?.count || 0;
        res.status(200).json({
            success: true,
            data: result?.rows || [],
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        next(error);
    }
};

const releaseLockedStock = async (lines) => {
    await releaseLines(lines);
};

const deleteOrder = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        const scope = await orderScope(req.user);
        if (!orderVisibleTo(scope, order.createdBy)) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (order.status === "DRAFT" && String(order.createdBy) !== String(req.user._id)) {
            return res.status(404).json({ success: false, message: "Draft order not found" });
        }
        if (order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERED") await restoreShipped(order, req.user._id);
        else await releaseLockedStock(order.lines);
        await order.deleteOne();
        res.status(200).json({ success: true, message: order.status === "DRAFT" ? "Draft order cancelled" : "Order deleted" });
    } catch (error) {
        next(error);
    }
};

const getOrder = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }
        const scope = await orderScope(req.user);
        const [order] = await Order.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(req.params.id), status: { $in: PLACED_STATUSES }, ...scope } },
            {
                $lookup: {
                    from: Customer.collection.name,
                    localField: "customer",
                    foreignField: "_id",
                    pipeline: [{ $project: { retailerName: 1, firmName: 1, customerCode: 1, contactNo1: 1, contactNo2: 1, gstin: 1, address: 1 } }],
                    as: "customerDoc",
                },
            },
            { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
            { $addFields: { totalQty: { $sum: "$lines.quantity" } } },
            {
                $project: {
                    orderCode: 1,
                    status: 1,
                    placedAt: 1,
                    paymentMethod: 1,
                    advanceAmount: 1,
                    advanceMode: 1,
                    pendingAmount: 1,
                    razorpayOrderId: 1,
                    razorpayPaymentId: 1,
                    paidAt: 1,
                    subtotal: 1,
                    gstTotal: 1,
                    total: 1,
                    totalQty: 1,
                    schemeName: 1,
                    schemeType: 1,
                    schemeGiftName: 1,
                    schemeGiftImage: 1,
                    schemeGifts: 1,
                    schemeNote: 1,
                    expiryEnabled: 1,
                    expiryLines: 1,
                    lines: 1,
                    customerId: "$customer",
                    customerName: "$customerDoc.retailerName",
                    firmName: "$customerDoc.firmName",
                    customerCode: "$customerDoc.customerCode",
                    contactNo1: "$customerDoc.contactNo1",
                    contactNo2: "$customerDoc.contactNo2",
                    gstin: "$customerDoc.gstin",
                    address: "$customerDoc.address",
                },
            },
        ]);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

const customerHistory = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.customerId)) {
            return res.status(400).json({ success: false, message: "Invalid customer id" });
        }
        const customer = await Customer.findById(req.params.customerId)
            .select("retailerName firmName customerCode contactNo1 contactNo2 gstin address")
            .lean();
        if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const search = String(req.query.search || "").trim();
        const product = String(req.query.product || "").trim();
        const from = String(req.query.from || "").trim();
        const to = String(req.query.to || "").trim();
        const schemeType = String(req.query.schemeType || "").trim();
        const expiry = String(req.query.expiry || "").trim();
        const sort = String(req.query.sort || "newest");
        const numberOrNull = (value) => {
            if (value === undefined || value === null || String(value).trim() === "") return null;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : NaN;
        };
        const minQty = numberOrNull(req.query.minQty);
        const maxQty = numberOrNull(req.query.maxQty);
        const minTotal = numberOrNull(req.query.minTotal);
        const maxTotal = numberOrNull(req.query.maxTotal);
        if ([minQty, maxQty, minTotal, maxTotal].some((value) => Number.isNaN(value))) {
            return res.status(400).json({ success: false, message: "Quantity and amount filters must be numbers" });
        }
        if ((minQty !== null && maxQty !== null && minQty > maxQty) || (minTotal !== null && maxTotal !== null && minTotal > maxTotal)) {
            return res.status(400).json({ success: false, message: "The minimum filter cannot be greater than the maximum" });
        }
        if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
            return res.status(400).json({ success: false, message: "Use a valid date range" });
        }

        const scope = await orderScope(req.user);
        const match = { status: { $in: PLACED_STATUSES }, customer: new mongoose.Types.ObjectId(req.params.customerId), ...scope };
        if (from || to) {
            match.placedAt = {};
            if (from) match.placedAt.$gte = new Date(`${from}T00:00:00`);
            if (to) match.placedAt.$lte = new Date(`${to}T23:59:59.999`);
        }
        if (schemeType === "NONE") match.schemeType = { $exists: false };
        else if (["SLAB", "OPEN", "FIRST_ORDER"].includes(schemeType)) match.schemeType = schemeType;
        if (expiry === "yes") match.expiryEnabled = true;
        if (expiry === "no") match.expiryEnabled = { $ne: true };
        if (product) match["lines.name"] = { $regex: escapeRegex(product), $options: "i" };
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            match.$or = [{ orderCode: rx }, { "lines.name": rx }];
        }
        if (minTotal !== null || maxTotal !== null) {
            match.total = {};
            if (minTotal !== null) match.total.$gte = minTotal;
            if (maxTotal !== null) match.total.$lte = maxTotal;
        }

        const qtyMatch = {};
        if (minQty !== null || maxQty !== null) {
            qtyMatch.totalQty = {};
            if (minQty !== null) qtyMatch.totalQty.$gte = minQty;
            if (maxQty !== null) qtyMatch.totalQty.$lte = maxQty;
        }
        const sorts = {
            newest: { placedAt: -1 },
            oldest: { placedAt: 1 },
            total_desc: { total: -1 },
            total_asc: { total: 1 },
            qty_desc: { totalQty: -1 },
            qty_asc: { totalQty: 1 },
        };

        const [result] = await Order.aggregate([
            { $match: match },
            { $addFields: { totalQty: { $sum: "$lines.quantity" } } },
            { $match: qtyMatch },
            { $sort: sorts[sort] || sorts.newest },
            {
                $facet: {
                    rows: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                        {
                            $project: {
                                orderCode: 1,
                                status: 1,
                                placedAt: 1,
                                paymentMethod: 1,
                                advanceAmount: 1,
                                advanceMode: 1,
                                pendingAmount: 1,
                                razorpayPaymentId: 1,
                                subtotal: 1,
                                gstTotal: 1,
                                total: 1,
                                totalQty: 1,
                                schemeName: 1,
                                schemeType: 1,
                                schemeNote: 1,
                                expiryEnabled: 1,
                                lines: {
                                    $map: {
                                        input: "$lines",
                                        as: "line",
                                        in: { name: "$$line.name", image: "$$line.image", quantity: "$$line.quantity" },
                                    },
                                },
                            },
                        },
                    ],
                    total: [{ $count: "count" }],
                    summary: [{
                        $group: {
                            _id: null,
                            orders: { $sum: 1 },
                            totalAmount: { $sum: "$total" },
                            gstTotal: { $sum: "$gstTotal" },
                            totalQty: { $sum: "$totalQty" },
                        },
                    }],
                },
            },
        ]);

        const total = result?.total?.[0]?.count || 0;
        const summary = result?.summary?.[0] || { orders: 0, totalAmount: 0, gstTotal: 0, totalQty: 0 };
        res.status(200).json({
            success: true,
            customer,
            summary: {
                orders: summary.orders || 0,
                totalAmount: summary.totalAmount || 0,
                gstTotal: summary.gstTotal || 0,
                totalQty: summary.totalQty || 0,
            },
            data: result?.rows || [],
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        next(error);
    }
};

const revenue = async (req, res, next) => {
    try {
        const today = new Date();
        const dayStamp = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };
        const from = String(req.query.from || dayStamp(today)).trim();
        const to = String(req.query.to || from).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
            return res.status(400).json({ success: false, message: "Use a valid date range" });
        }

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const search = String(req.query.search || "").trim();
        const customerName = String(req.query.customerName || "").trim();
        const customerCode = String(req.query.customerCode || "").trim();
        const product = String(req.query.product || "").trim();
        const schemeType = String(req.query.schemeType || "").trim();
        const paymentMethod = String(req.query.paymentMethod || "").trim();

        const match = {
            status: { $in: PLACED_STATUSES },
            placedAt: {
                $gte: new Date(`${from}T00:00:00`),
                $lte: new Date(`${to}T23:59:59.999`),
            },
        };
        if (PAYMENT_METHODS.includes(paymentMethod)) match.paymentMethod = paymentMethod;
        if (schemeType === "NONE") match.schemeType = { $exists: false };
        else if (["SLAB", "OPEN", "FIRST_ORDER"].includes(schemeType)) match.schemeType = schemeType;
        if (product) match["lines.name"] = { $regex: escapeRegex(product), $options: "i" };
        Object.assign(match, await orderScope(req.user));

        const afterLookup = {};
        if (customerName) afterLookup["customerDoc.retailerName"] = { $regex: escapeRegex(customerName), $options: "i" };
        if (customerCode) afterLookup["customerDoc.customerCode"] = { $regex: escapeRegex(customerCode), $options: "i" };
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            afterLookup.$or = [{ orderCode: rx }, { "lines.name": rx }, { "customerDoc.retailerName": rx }, { "customerDoc.customerCode": rx }];
        }

        const [result] = await Order.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: Customer.collection.name,
                    localField: "customer",
                    foreignField: "_id",
                    pipeline: [{ $project: { retailerName: 1, firmName: 1, customerCode: 1 } }],
                    as: "customerDoc",
                },
            },
            { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
            { $addFields: { totalQty: { $sum: "$lines.quantity" } } },
            { $match: afterLookup },
            { $sort: { placedAt: -1 } },
            {
                $facet: {
                    summary: [{
                        $group: {
                            _id: null,
                            orders: { $sum: 1 },
                            subtotal: { $sum: "$subtotal" },
                            gstTotal: { $sum: "$gstTotal" },
                            total: { $sum: "$total" },
                            totalQty: { $sum: "$totalQty" },
                        },
                    }],
                    days: [
                        {
                            $group: {
                                _id: { $dateToString: { format: "%Y-%m-%d", date: "$placedAt", timezone: "Asia/Kolkata" } },
                                orders: { $sum: 1 },
                                subtotal: { $sum: "$subtotal" },
                                gstTotal: { $sum: "$gstTotal" },
                                total: { $sum: "$total" },
                                totalQty: { $sum: "$totalQty" },
                            },
                        },
                        { $sort: { _id: 1 } },
                    ],
                    rows: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                        {
                            $project: {
                                orderCode: 1,
                                placedAt: 1,
                                paymentMethod: 1,
                                advanceAmount: 1,
                                advanceMode: 1,
                                pendingAmount: 1,
                                razorpayPaymentId: 1,
                                subtotal: 1,
                                gstTotal: 1,
                                total: 1,
                                totalQty: 1,
                                schemeName: 1,
                                customerId: "$customer",
                                customerName: "$customerDoc.retailerName",
                                firmName: "$customerDoc.firmName",
                                customerCode: "$customerDoc.customerCode",
                            },
                        },
                    ],
                    totalCount: [{ $count: "count" }],
                },
            },
        ]);

        const summary = result?.summary?.[0] || { orders: 0, subtotal: 0, gstTotal: 0, total: 0, totalQty: 0 };
        const total = result?.totalCount?.[0]?.count || 0;
        res.status(200).json({
            success: true,
            range: { from, to },
            summary: {
                orders: summary.orders || 0,
                subtotal: summary.subtotal || 0,
                gstTotal: summary.gstTotal || 0,
                total: summary.total || 0,
                totalQty: summary.totalQty || 0,
            },
            days: (result?.days || []).map((day) => ({
                date: day._id,
                orders: day.orders,
                subtotal: day.subtotal,
                gstTotal: day.gstTotal,
                total: day.total,
                totalQty: day.totalQty,
            })),
            data: result?.rows || [],
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        next(error);
    }
};

const createOnlinePayment = async (req, res, next) => {
    try {
        const client = razorpayClient();
        if (!client) {
            return res.status(503).json({ success: false, message: "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment" });
        }
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;
        if (!order.lines.length) {
            return res.status(400).json({ success: false, message: "Add at least one product" });
        }

        const totals = moneyFor(order.lines);
        const advancePay = String(req.body.kind || "").trim() === "ADVANCE";
        let charge = totals.total;
        if (advancePay) {
            const advance = round2(req.body.advanceAmount);
            const problem = advanceError(advance, totals.total, true);
            if (problem) return res.status(400).json({ success: false, message: problem });
            charge = advance;
        }
        const paise = Math.round(charge * 100);
        if (paise < 100) {
            return res.status(400).json({ success: false, message: "Online payment needs at least ₹1" });
        }
        const sameAdvance = advancePay
            && order.advanceMode === "ONLINE"
            && round2(order.advanceAmount) === charge;
        const sameFull = !advancePay && order.advanceMode !== "ONLINE";
        if (order.razorpayOrderId && order.razorpayAmount === paise && (sameAdvance || sameFull)) {
            return res.status(200).json({
                success: true,
                data: {
                    keyId: process.env.RAZORPAY_KEY_ID,
                    razorpayOrderId: order.razorpayOrderId,
                    amount: paise,
                    currency: "INR",
                    total: totals.total,
                    advanceAmount: advancePay ? charge : 0,
                    pendingAmount: advancePay ? round2(totals.total - charge) : 0,
                },
            });
        }

        if (advancePay) {
            order.advanceAmount = charge;
            order.advanceMode = "ONLINE";
            order.pendingAmount = round2(totals.total - charge);
        } else {
            clearSplit(order);
        }

        const created = await client.orders.create({
            amount: paise,
            currency: "INR",
            receipt: String(order._id),
            notes: { crmOrderId: String(order._id), kind: advancePay ? "ADVANCE" : "FULL" },
        });
        order.razorpayOrderId = created.id;
        order.razorpayAmount = paise;
        order.razorpayPaymentId = "";
        order.razorpaySignature = "";
        await order.save();
        res.status(200).json({
            success: true,
            data: {
                keyId: process.env.RAZORPAY_KEY_ID,
                razorpayOrderId: created.id,
                amount: paise,
                currency: "INR",
                total: totals.total,
                advanceAmount: advancePay ? charge : 0,
                pendingAmount: advancePay ? round2(totals.total - charge) : 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

const verifyOnlinePayment = async (req, res, next) => {
    try {
        if (!razorpayClient()) {
            return res.status(503).json({ success: false, message: "Online payment is not configured" });
        }
        const loaded = await loadDraft(req.params.id, req.user._id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { order } = loaded;

        const razorpayOrderId = String(req.body.razorpay_order_id || "").trim();
        const razorpayPaymentId = String(req.body.razorpay_payment_id || "").trim();
        const razorpaySignature = String(req.body.razorpay_signature || "").trim();
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ success: false, message: "Payment details are incomplete" });
        }
        if (!order.razorpayOrderId || razorpayOrderId !== order.razorpayOrderId) {
            return res.status(400).json({ success: false, message: "This payment does not belong to the order" });
        }
        if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
            return res.status(400).json({ success: false, message: "Payment signature could not be verified" });
        }

        const totals = moneyFor(order.lines);
        const advanceOnline = order.advanceMode === "ONLINE" && round2(order.advanceAmount) > 0;
        const expected = advanceOnline ? round2(order.advanceAmount) : totals.total;
        const paise = Math.round(expected * 100);
        if (paise !== order.razorpayAmount || (advanceOnline && order.advanceAmount >= totals.total)) {
            return res.status(400).json({ success: false, message: "Order amount changed. Start the payment again" });
        }

        order.razorpayPaymentId = razorpayPaymentId;
        order.razorpaySignature = razorpaySignature;
        order.paidAt = new Date();
        order.status = "PENDING";
        if (advanceOnline) {
            order.paymentMethod = "ADVANCE_COD";
            order.pendingAmount = round2(totals.total - order.advanceAmount);
        } else {
            clearSplit(order);
            order.paymentMethod = "ONLINE";
        }
        order.subtotal = totals.subtotal;
        order.gstTotal = totals.gstTotal;
        order.total = totals.total;
        order.placedAt = new Date();
        if (!order.orderCode) order.orderCode = await nextOrderCode(order.placedAt);
        await order.save();
        await Customer.updateOne(
            { _id: order.customer, leadStage: { $ne: "CONVERTED" } },
            { $set: { leadStage: "CONVERTED", convertedAt: order.placedAt, convertedOrder: order._id }, $unset: { nextFollowUpAt: "", nextPurpose: "", lostReason: "" } }
        );
        res.status(200).json({ success: true, message: "Payment verified", data: present(order) });
    } catch (error) {
        next(error);
    }
};

const updateOrderStatus = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }
        const nextStatus = String(req.body.status || "").trim();
        const scope = await orderScope(req.user);
        const order = await Order.findOne({ _id: req.params.id, status: { $in: PLACED_STATUSES }, ...scope });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (NEXT_STATUS[order.status] !== nextStatus) {
            return res.status(400).json({ success: false, message: "Move the order to the next delivery status" });
        }
        if (nextStatus === "CONFIRM") {
            if (req.user.userType !== "ADMIN") {
                if (String(req.user._id) === String(order.createdBy)) {
                    return res.status(403).json({ success: false, message: "You cannot confirm your own order. Your reporting manager has to confirm it." });
                }
                const below = await downlineIds(req.user._id);
                const managesCreator = below.some((id) => String(id) === String(order.createdBy));
                if (!managesCreator) {
                    return res.status(403).json({ success: false, message: "Only the reporting manager or an admin can confirm this order" });
                }
            }
        }
        if ((nextStatus === "READY_TO_DELIVERY" || nextStatus === "OUT_FOR_DELIVERY" || nextStatus === "DELIVERED") && isFieldExecutive(req.user)) {
            return res.status(403).json({ success: false, message: nextStatus === "DELIVERED" ? "Warehouse marks the order delivered" : "Warehouse marks ready for delivery and dispatch" });
        }
        if (nextStatus === "OUT_FOR_DELIVERY") {
            try {
                await shipOrder(order, req.user._id);
            } catch (error) {
                return res.status(error.status || 500).json({ success: false, message: error.message || "Could not dispatch the order" });
            }
        }
        if (nextStatus === "CONFIRM" && !order.confirmedAt) order.confirmedAt = new Date();
        order.status = nextStatus;
        await order.save();
        res.status(200).json({ success: true, message: "Status updated", data: { _id: order._id, status: order.status } });
    } catch (error) {
        next(error);
    }
};

const dayKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const getDashboard = async (req, res, next) => {
    try {
        const today = new Date();
        const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const rangeStart = new Date(startToday);
        rangeStart.setDate(rangeStart.getDate() - 29);
        const granted = req.user.permissions || [];
        const legacyExecutive = req.user.userType !== "ADMIN" && isFieldExecutive(req.user) && granted.length === 0;
        const see = (...keys) => req.user.userType === "ADMIN"
            || keys.some((key) => granted.includes(key))
            || (legacyExecutive && keys.some((key) => ["VIEW_CUSTOMERS", "VIEW_ORDERS", "VIEW_REVENUE", "PLACE_ORDERS"].includes(key)));
        const seeStock = see("VIEW_INVENTORY", "VIEW_PRODUCTS", "EDIT_PRODUCTS", "MANAGE_INVENTORY");
        const seeTargets = see("VIEW_TARGETS", "MANAGE_TARGETS");
        const seeClaims = see("VIEW_REIMBURSEMENTS");
        const seeOrders = see("VIEW_ORDERS", "PLACE_ORDERS");
        const seeRevenue = see("VIEW_REVENUE");
        const seeCustomers = see("VIEW_CUSTOMERS");
        const seeCatalog = see("VIEW_CATEGORIES", "VIEW_SUBCATEGORIES");
        const seeEmployees = see("VIEW_EMPLOYEES", "MANAGE_EMPLOYEES");
        const seeOrg = see("VIEW_DEPARTMENTS", "VIEW_DESIGNATIONS");
        const seeGifts = see("VIEW_GIFTS", "CREATE_GIFTS");
        const seeSchemes = see("VIEW_SCHEMES", "CREATE_SCHEMES");

        const scope = await orderScope(req.user);
        const [customers, products, activeProducts, categories, subCategories, employees, departments, designations, gifts, schemes, [stats], lowStockAgg, targets, claimRows] = await Promise.all([
            seeCustomers ? Customer.countDocuments() : 0,
            seeStock ? Product.countDocuments() : 0,
            seeStock ? Product.countDocuments({ status: "ACTIVE" }) : 0,
            seeCatalog ? Category.countDocuments() : 0,
            seeCatalog ? SubCategory.countDocuments() : 0,
            seeEmployees ? User.countDocuments({ userType: "EMPLOYEE" }) : 0,
            seeOrg ? Department.countDocuments() : 0,
            seeOrg ? Designation.countDocuments() : 0,
            seeGifts ? Gift.countDocuments() : 0,
            seeSchemes ? Scheme.countDocuments() : 0,
            (seeOrders || seeRevenue) ? Order.aggregate([
                { $match: { status: { $in: PLACED_STATUSES }, ...scope } },
                {
                    $facet: {
                        days: [
                            { $match: { placedAt: { $gte: rangeStart } } },
                            {
                                $group: {
                                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$placedAt", timezone: "Asia/Kolkata" } },
                                    orders: { $sum: 1 },
                                    total: { $sum: "$total" },
                                    gstTotal: { $sum: "$gstTotal" },
                                },
                            },
                            { $sort: { _id: 1 } },
                        ],
                        byStatus: [{ $group: { _id: "$status", orders: { $sum: 1 }, total: { $sum: "$total" } } }],
                        byPayment: [{ $group: { _id: { $ifNull: ["$paymentMethod", "COD"] }, orders: { $sum: 1 }, total: { $sum: "$total" } } }],
                        today: [
                            { $match: { placedAt: { $gte: startToday } } },
                            { $group: { _id: null, orders: { $sum: 1 }, total: { $sum: "$total" }, gstTotal: { $sum: "$gstTotal" } } },
                        ],
                        month: [
                            { $match: { placedAt: { $gte: monthStart } } },
                            { $group: { _id: null, orders: { $sum: 1 }, total: { $sum: "$total" }, gstTotal: { $sum: "$gstTotal" } } },
                        ],
                        all: [
                            { $group: { _id: null, orders: { $sum: 1 }, total: { $sum: "$total" }, gstTotal: { $sum: "$gstTotal" }, subtotal: { $sum: "$subtotal" } } },
                        ],
                        recent: [
                            { $sort: { placedAt: -1 } },
                            { $limit: 5 },
                            {
                                $lookup: {
                                    from: Customer.collection.name,
                                    localField: "customer",
                                    foreignField: "_id",
                                    pipeline: [{ $project: { retailerName: 1, customerCode: 1 } }],
                                    as: "customerDoc",
                                },
                            },
                            { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    orderCode: 1,
                                    status: 1,
                                    paymentMethod: 1,
                                    advanceAmount: 1,
                                    advanceMode: 1,
                                    pendingAmount: 1,
                                    total: 1,
                                    placedAt: 1,
                                    customerName: "$customerDoc.retailerName",
                                    customerCode: "$customerDoc.customerCode",
                                },
                            },
                        ],
                    },
                },
            ]) : Promise.resolve([null]),
            seeStock ? Product.aggregate([
                { $addFields: { alertAt: { $ifNull: ["$lowStockAt", 10] } } },
                { $match: { $expr: { $lte: ["$stock", "$alertAt"] } } },
                {
                    $facet: {
                        total: [{ $count: "n" }],
                        rows: [
                            { $sort: { stock: 1, name: 1 } },
                            { $limit: 8 },
                            { $project: { name: 1, productCode: 1, stock: 1, lowStockAt: "$alertAt" } },
                        ],
                    },
                },
            ]) : null,
            seeTargets ? targetSnapshot(req.user) : null,
            seeClaims ? Order.aggregate([
                { $match: { status: { $in: PLACED_STATUSES }, expiryEnabled: true, ...scope } },
                { $unwind: "$expiryLines" },
                { $group: { _id: { $ifNull: ["$expiryLines.type", "EXPIRY"] }, quantity: { $sum: "$expiryLines.quantity" }, lines: { $sum: 1 } } },
            ]) : null,
        ]);

        const dayMap = new Map((stats?.days || []).map((day) => [day._id, day]));
        const days = [];
        for (let offset = 29; offset >= 0; offset -= 1) {
            const date = new Date(startToday);
            date.setDate(date.getDate() - offset);
            const key = dayKey(date);
            const row = dayMap.get(key);
            days.push({
                date: key,
                orders: row?.orders || 0,
                total: row?.total || 0,
                gstTotal: row?.gstTotal || 0,
            });
        }

        const statusNames = {
            PENDING: "Pending",
            CONFIRM: "Confirm",
            READY_TO_DELIVERY: "Ready to delivery",
            OUT_FOR_DELIVERY: "Out for delivery",
            DELIVERED: "Delivered",
        };
        const statusKey = (status) => (status === "PLACED" || status === "PENDING_CONFIRM" || status === "PENDING" ? "PENDING" : status);
        const statuses = Object.keys(statusNames).map((key) => ({ key, name: statusNames[key], orders: 0, total: 0 }));
        (stats?.byStatus || []).forEach((row) => {
            const bucket = statuses.find((item) => item.key === statusKey(row._id));
            if (!bucket) return;
            bucket.orders += row.orders;
            bucket.total += row.total;
        });

        const paymentNames = { COD: "COD", ONLINE: "Online", CASH: "Cash", ADVANCE_COD: "Advance + COD" };
        const payments = PAYMENT_METHODS.map((key) => {
            const row = (stats?.byPayment || []).find((item) => item._id === key);
            return { key, name: paymentNames[key], orders: row?.orders || 0, total: row?.total || 0 };
        });

        const todayStats = stats?.today?.[0] || { orders: 0, total: 0, gstTotal: 0 };
        const monthStats = stats?.month?.[0] || { orders: 0, total: 0, gstTotal: 0 };
        const allStats = stats?.all?.[0] || { orders: 0, total: 0, gstTotal: 0, subtotal: 0 };
        const dispatchedOrders = (statuses.find((item) => item.key === "OUT_FOR_DELIVERY")?.orders || 0) + (statuses.find((item) => item.key === "DELIVERED")?.orders || 0);
        const dispatchedTotal = (statuses.find((item) => item.key === "OUT_FOR_DELIVERY")?.total || 0) + (statuses.find((item) => item.key === "DELIVERED")?.total || 0);
        const claims = { DAMAGE: 0, EXPIRY: 0, RETURN: 0, OTHER: 0 };
        (claimRows || []).forEach((row) => {
            if (Object.prototype.hasOwnProperty.call(claims, row._id)) claims[row._id] = row.quantity || 0;
        });
        const low = lowStockAgg?.[0];

        res.status(200).json({
            success: true,
            data: {
                customers: seeCustomers ? customers : null,
                products: seeStock ? products : null,
                activeProducts: seeStock ? activeProducts : null,
                lowStock: seeStock ? { total: low?.total?.[0]?.n || 0, rows: low?.rows || [] } : null,
                targets: seeTargets ? targets : null,
                claims: seeClaims ? claims : null,
                categories: seeCatalog ? categories : null,
                subCategories: seeCatalog ? subCategories : null,
                employees: seeEmployees ? employees : null,
                departments: seeOrg ? departments : null,
                designations: seeOrg ? designations : null,
                gifts: seeGifts ? gifts : null,
                schemes: seeSchemes ? schemes : null,
                today: {
                    orders: seeOrders ? (todayStats.orders || 0) : null,
                    total: seeRevenue ? (todayStats.total || 0) : null,
                    gstTotal: seeRevenue ? (todayStats.gstTotal || 0) : null,
                },
                month: {
                    orders: seeOrders ? (monthStats.orders || 0) : null,
                    total: seeRevenue ? (monthStats.total || 0) : null,
                    gstTotal: seeRevenue ? (monthStats.gstTotal || 0) : null,
                },
                all: seeRevenue ? { orders: allStats.orders || 0, total: allStats.total || 0, gstTotal: allStats.gstTotal || 0, subtotal: allStats.subtotal || 0 } : null,
                dispatched: seeOrders ? { orders: dispatchedOrders, total: dispatchedTotal } : null,
                days: seeRevenue ? days : [],
                statuses: seeOrders ? statuses : [],
                payments: seeRevenue ? payments : [],
                recent: seeOrders ? (stats?.recent || []) : [],
            },
        });
    } catch (error) {
        next(error);
    }
};

const reportRange = (from, to) => {
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to)) {
        const error = new Error("Use a valid date range");
        error.status = 400;
        throw error;
    }
    if (!from && !to) return null;
    const placedAt = {};
    if (from) placedAt.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) placedAt.$lt = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000);
    return placedAt;
};

const customerSearchIds = async (search) => {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    const customers = await Customer.find({
        $or: [{ retailerName: rx }, { firmName: rx }, { customerCode: rx }],
    }).select("_id").limit(200).lean();
    return customers.map((item) => item._id);
};

const getReimbursements = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const type = String(req.query.type || "").trim().toUpperCase();
        const search = String(req.query.search || "").trim();
        const from = String(req.query.from || "").trim();
        const to = String(req.query.to || "").trim();
        if (type && !REIMBURSE_TYPES.includes(type)) {
            return res.status(400).json({ success: false, message: "Choose damage, expiry, return, or other" });
        }
        const placedAt = reportRange(from, to);
        const scope = await orderScope(req.user);
        const match = { status: { $in: PLACED_STATUSES }, expiryEnabled: true, ...scope };
        if (placedAt) match.placedAt = placedAt;

        const pipeline = [
            { $match: match },
            { $unwind: "$expiryLines" },
            { $addFields: { lineType: { $ifNull: ["$expiryLines.type", "EXPIRY"] } } },
        ];
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            const customerIds = await customerSearchIds(search);
            pipeline.push({
                $match: {
                    $or: [
                        { orderCode: rx },
                        { "expiryLines.name": rx },
                        { "expiryLines.otherLabel": rx },
                        { "expiryLines.note": rx },
                        ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
                    ],
                },
            });
        }
        const reasonMatch = type ? [{ $match: { lineType: type } }] : [];
        pipeline.push({
            $facet: {
                totals: [{ $group: { _id: "$lineType", quantity: { $sum: "$expiryLines.quantity" }, lines: { $sum: 1 } } }],
                total: [...reasonMatch, { $count: "count" }],
                rows: [
                    ...reasonMatch,
                    { $sort: { placedAt: -1, _id: -1 } },
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                    {
                        $lookup: {
                            from: Customer.collection.name,
                            localField: "customer",
                            foreignField: "_id",
                            pipeline: [{ $project: { retailerName: 1, firmName: 1, customerCode: 1 } }],
                            as: "customerDoc",
                        },
                    },
                    { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            orderId: "$_id",
                            orderCode: 1,
                            placedAt: 1,
                            status: 1,
                            customerName: "$customerDoc.retailerName",
                            firmName: "$customerDoc.firmName",
                            customerCode: "$customerDoc.customerCode",
                            productName: "$expiryLines.name",
                            quantity: "$expiryLines.quantity",
                            type: "$lineType",
                            otherLabel: { $ifNull: ["$expiryLines.otherLabel", ""] },
                            note: { $ifNull: ["$expiryLines.note", ""] },
                        },
                    },
                ],
            },
        });

        const [result] = await Order.aggregate(pipeline);
        const summary = { DAMAGE: 0, EXPIRY: 0, RETURN: 0, OTHER: 0 };
        (result?.totals || []).forEach((row) => {
            if (Object.prototype.hasOwnProperty.call(summary, row._id)) summary[row._id] = row.quantity;
        });
        const total = result?.total?.[0]?.count || 0;
        res.status(200).json({
            success: true,
            data: result?.rows || [],
            summary,
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const warehouseStatusMatch = (requested) => {
    if (!requested) return { status: { $in: PLACED_STATUSES } };
    if (requested === "PENDING") return { status: { $in: ["PLACED", "PENDING_CONFIRM", "PENDING"] } };
    if (["CONFIRM", "READY_TO_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(requested)) return { status: requested };
    const error = new Error("Choose a delivery status");
    error.status = 400;
    throw error;
};

const getWarehouseReport = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const requested = String(req.query.status || "").trim().toUpperCase();
        const search = String(req.query.search || "").trim();
        const from = String(req.query.from || "").trim();
        const to = String(req.query.to || "").trim();
        const placedAt = reportRange(from, to);
        const scope = await orderScope(req.user);
        const shared = { ...scope };
        if (placedAt) shared.placedAt = placedAt;
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            const customerIds = await customerSearchIds(search);
            shared.$or = [{ orderCode: rx }, ...(customerIds.length ? [{ customer: { $in: customerIds } }] : [])];
        }
        const countMatch = { ...shared, status: { $in: PLACED_STATUSES } };
        const listMatch = { ...shared, ...warehouseStatusMatch(requested) };

        const [grouped, total, orders] = await Promise.all([
            Order.aggregate([
                { $match: countMatch },
                { $group: { _id: "$status", orders: { $sum: 1 }, total: { $sum: "$total" } } },
            ]),
            Order.countDocuments(listMatch),
            Order.find(listMatch)
                .select("orderCode status total placedAt customer paymentMethod")
                .sort({ placedAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);

        const customerIds = [...new Set(orders.map((item) => String(item.customer)))];
        const customers = customerIds.length
            ? await Customer.find({ _id: { $in: customerIds } }).select("retailerName firmName customerCode").lean()
            : [];
        const customerMap = new Map(customers.map((item) => [String(item._id), item]));
        const statusKey = (status) => (status === "PLACED" || status === "PENDING_CONFIRM" || status === "PENDING" ? "PENDING" : status);
        const summary = {
            PENDING: { orders: 0, total: 0 },
            CONFIRM: { orders: 0, total: 0 },
            READY_TO_DELIVERY: { orders: 0, total: 0 },
            OUT_FOR_DELIVERY: { orders: 0, total: 0 },
            DELIVERED: { orders: 0, total: 0 },
        };
        grouped.forEach((row) => {
            const bucket = summary[statusKey(row._id)];
            if (!bucket) return;
            bucket.orders += row.orders;
            bucket.total += row.total || 0;
        });

        res.status(200).json({
            success: true,
            summary,
            data: orders.map((item) => {
                const customer = customerMap.get(String(item.customer));
                return {
                    _id: item._id,
                    orderCode: item.orderCode || "",
                    status: item.status,
                    total: item.total || 0,
                    placedAt: item.placedAt,
                    paymentMethod: item.paymentMethod || "",
                    customerName: customer?.retailerName || "",
                    firmName: customer?.firmName || "",
                    customerCode: customer?.customerCode || "",
                };
            }),
            pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

module.exports = {
    catalog,
    startOrder,
    setLine,
    removeLine,
    schemeOptions,
    setScheme,
    setExpiry,
    placeOrder,
    cancelOrder,
    deleteOrder,
    getOrder,
    customerHistory,
    listOrders,
    revenue,
    createOnlinePayment,
    verifyOnlinePayment,
    updateOrderStatus,
    getDashboard,
    getReimbursements,
    getWarehouseReport,
};
