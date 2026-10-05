const mongoose = require("mongoose");
const Batch = require("../models/Batch");
const StockMovement = require("../models/StockMovement");
const Product = require("../models/Product");
const Order = require("../models/Order");

const dayStamp = (date) => new Date(`${date}T12:00:00+05:30`);

const syncProductStock = async (productIds) => {
    const ids = [...new Set(productIds.map((id) => String(id)))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) return;
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const rows = await Batch.aggregate([
        { $match: { product: { $in: objectIds } } },
        { $group: { _id: "$product", available: { $sum: { $subtract: ["$onHand", "$reserved"] } } } },
    ]);
    const available = new Map(rows.map((row) => [String(row._id), row.available]));
    await Product.bulkWrite(objectIds.map((id) => ({
        updateOne: {
            filter: { _id: id },
            update: { $set: { stock: Math.max(0, available.get(String(id)) || 0) } },
        },
    })));
};

const absorbLegacyStock = async (productId, userId) => {
    if (await Batch.exists({ product: productId })) return;
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const [product, [lockRow]] = await Promise.all([
        Product.findById(productId).select("stock"),
        Order.aggregate([
            { $match: { status: { $ne: "OUT_FOR_DELIVERY" } } },
            { $unwind: "$lines" },
            {
                $match: {
                    "lines.product": productObjectId,
                    "lines.shipped": { $ne: true },
                    "lines.lockedQty": { $gt: 0 },
                    $or: [{ "lines.allocations": { $exists: false } }, { "lines.allocations": { $size: 0 } }],
                },
            },
            { $group: { _id: null, locked: { $sum: "$lines.lockedQty" } } },
        ]),
    ]);
    const locked = lockRow?.locked || 0;
    const onHand = (product?.stock || 0) + locked;
    if (!onHand) return;

    const today = new Date();
    const batch = await Batch.create({
        product: productId,
        batchNo: "OPENING",
        caseSize: "",
        mfgDate: today,
        expiryDate: new Date("2099-12-31"),
        onHand,
        reserved: locked,
    });
    await StockMovement.create({
        product: productId,
        batch: batch._id,
        type: "OPENING",
        quantity: onHand,
        note: "Stock already on the product before batch tracking",
        at: today,
        createdBy: userId,
    });

    const orders = await Order.find({
        status: { $ne: "OUT_FOR_DELIVERY" },
        lines: { $elemMatch: { product: productId, lockedQty: { $gt: 0 }, shipped: { $ne: true } } },
    });
    const writes = [];
    orders.forEach((order) => {
        let changed = false;
        order.lines.forEach((line) => {
            const unassigned = !line.allocations?.length;
            if (String(line.product) === String(productId) && !line.shipped && unassigned && line.lockedQty > 0) {
                line.allocations = [{ batch: batch._id, qty: line.lockedQty }];
                changed = true;
            }
        });
        if (changed) {
            writes.push({ updateOne: { filter: { _id: order._id }, update: { $set: { lines: order.lines } } } });
        }
    });
    if (writes.length) await Order.bulkWrite(writes);
    await syncProductStock([productId]);
};

const releaseLines = async (lines) => {
    const allocations = [];
    const legacy = [];
    (lines || []).forEach((line) => {
        if (!line || line.shipped) return;
        if (line.allocations?.length) {
            line.allocations.forEach((item) => {
                const plain = typeof item.toObject === "function" ? item.toObject() : item;
                const qty = Number(plain.qty);
                if (!plain.batch || !Number.isFinite(qty) || qty <= 0) return;
                allocations.push({ batch: plain.batch, qty, product: line.product });
            });
        } else if (line.lockedQty > 0) legacy.push(line);
    });
    if (allocations.length) {
        await Batch.bulkWrite(allocations.map((item) => ({
            updateOne: {
                filter: { _id: item.batch, reserved: { $gte: item.qty } },
                update: { $inc: { reserved: -item.qty } },
            },
        })));
        await syncProductStock(allocations.map((item) => item.product));
    }
    if (legacy.length) {
        await Product.bulkWrite(legacy.map((line) => ({
            updateOne: {
                filter: { _id: line.product },
                update: { $inc: { stock: line.lockedQty } },
            },
        })));
    }
};

const allocate = async (productId, quantity, previous) => {
    const held = previous?.allocations || [];
    const heldMap = new Map(held.map((item) => [String(item.batch), item.qty]));
    const batches = await Batch.find({ product: productId }).sort({ expiryDate: 1, _id: 1 }).select("onHand reserved").lean();
    if (!batches.length) {
        const already = previous?.lockedQty || 0;
        const product = await Product.findById(productId).select("stock");
        const pool = Math.max(0, (product?.stock || 0) + already);
        const lockedQty = Math.min(quantity, pool);
        const delta = lockedQty - already;
        if (delta > 0) {
            const updated = await Product.findOneAndUpdate(
                { _id: productId, stock: { $gte: delta } },
                { $inc: { stock: -delta } },
                { returnDocument: "after" }
            ).select("_id");
            if (!updated) {
                const error = new Error("Stock changed. Check the quantity again.");
                error.status = 409;
                throw error;
            }
        } else if (delta < 0) {
            await Product.updateOne({ _id: productId }, { $inc: { stock: -delta } });
        }
        return { lockedQty, overQty: quantity - lockedQty, allocations: [] };
    }

    let remaining = quantity;
    const plan = [];
    batches.forEach((batch) => {
        const free = batch.onHand - batch.reserved + (heldMap.get(String(batch._id)) || 0);
        if (free <= 0 || remaining <= 0) return;
        const take = Math.min(free, remaining);
        plan.push({ batch: batch._id, qty: take });
        remaining -= take;
    });
    const nextMap = new Map(plan.map((item) => [String(item.batch), item.qty]));
    const batchIds = new Set([...heldMap.keys(), ...nextMap.keys()]);
    const deltas = [...batchIds].map((id) => ({
        batch: held.find((item) => String(item.batch) === id)?.batch || plan.find((item) => String(item.batch) === id).batch,
        delta: (nextMap.get(id) || 0) - (heldMap.get(id) || 0),
    })).filter((item) => item.delta !== 0);

    const results = await Promise.all(deltas.map((item) => (
        item.delta > 0
            ? Batch.updateOne(
                { _id: item.batch, $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, item.delta] } },
                { $inc: { reserved: item.delta } }
            )
            : Batch.updateOne(
                { _id: item.batch, reserved: { $gte: -item.delta } },
                { $inc: { reserved: item.delta } }
            )
    )));
    if (results.some((result) => result.modifiedCount !== 1)) {
        const undo = deltas.filter((_, index) => results[index].modifiedCount === 1);
        if (undo.length) {
            await Batch.bulkWrite(undo.map((item) => ({
                updateOne: {
                    filter: { _id: item.batch },
                    update: { $inc: { reserved: -item.delta } },
                },
            })));
        }
        const error = new Error("Stock changed. Check the quantity again.");
        error.status = 409;
        throw error;
    }
    await syncProductStock([productId]);
    const lockedQty = quantity - remaining;
    return { lockedQty, overQty: remaining, allocations: plan };
};

const applyBatchDeltas = async (deltas) => {
    const results = await Promise.all(deltas.map((item) => Batch.updateOne(
        {
            _id: item.batch,
            onHand: { $gte: item.onHandDrop },
            reserved: { $gte: item.reservedDrop },
        },
        { $inc: { onHand: -item.onHandDrop, reserved: -item.reservedDrop } }
    )));
    const failed = results.some((result) => result.modifiedCount !== 1);
    if (!failed) return;
    const undo = deltas.filter((_, index) => results[index].modifiedCount === 1);
    if (undo.length) {
        await Batch.bulkWrite(undo.map((item) => ({
            updateOne: {
                filter: { _id: item.batch },
                update: { $inc: { onHand: item.onHandDrop, reserved: item.reservedDrop } },
            },
        })));
    }
    const error = new Error("Stock changed. Check the quantity again.");
    error.status = 409;
    throw error;
};

const shipOrder = async (order, userId) => {
    const pending = order.lines.filter((line) => !line.shipped);
    if (!pending.length) return;
    const productIds = [...new Set(pending.map((line) => String(line.product)))];
    const batches = await Batch.find({ product: { $in: productIds } }).sort({ expiryDate: 1, _id: 1 }).lean();
    const byProduct = new Map();
    batches.forEach((batch) => {
        const key = String(batch.product);
        if (!byProduct.has(key)) byProduct.set(key, []);
        byProduct.get(key).push({ ...batch });
    });

    const deltas = new Map();
    const sales = [];
    const remember = (batchId, onHandDrop, reservedDrop) => {
        const key = String(batchId);
        const current = deltas.get(key) || { batch: batchId, onHandDrop: 0, reservedDrop: 0 };
        current.onHandDrop += onHandDrop;
        current.reservedDrop += reservedDrop;
        deltas.set(key, current);
    };

    for (const line of pending) {
        const productBatches = byProduct.get(String(line.product)) || [];
        const own = new Map((line.allocations || []).map((item) => [String(item.batch), item.qty]));
        let remaining = line.quantity;
        const sold = [];

        productBatches.forEach((batch) => {
            const mine = own.get(String(batch._id)) || 0;
            if (!mine || remaining <= 0) return;
            const take = Math.min(mine, remaining, batch.onHand);
            if (!take) return;
            batch.onHand -= take;
            batch.reserved -= take;
            remaining -= take;
            sold.push({ batch: batch._id, qty: take });
            remember(batch._id, take, take);
        });
        productBatches.forEach((batch) => {
            const free = batch.onHand - batch.reserved;
            if (free <= 0 || remaining <= 0) return;
            const take = Math.min(free, remaining);
            batch.onHand -= take;
            remaining -= take;
            const existing = sold.find((item) => String(item.batch) === String(batch._id));
            if (existing) existing.qty += take;
            else sold.push({ batch: batch._id, qty: take });
            remember(batch._id, take, 0);
        });

        if (remaining > 0) {
            const error = new Error(`Manufacture ${remaining} more of ${line.name} before dispatch`);
            error.status = 400;
            throw error;
        }
        line.allocations = sold;
        line.lockedQty = 0;
        line.overQty = 0;
        line.shipped = true;
        line.remark = "";
        sold.forEach((item) => sales.push({
            product: line.product,
            batch: item.batch,
            type: "SALE",
            quantity: item.qty,
            order: order._id,
            note: order.orderCode || "",
            at: new Date(),
            createdBy: userId,
        }));
    }

    await applyBatchDeltas([...deltas.values()]);
    if (sales.length) await StockMovement.insertMany(sales);
    await syncProductStock(productIds);
};

const restoreShipped = async (order, userId) => {
    const shipped = order.lines.filter((line) => line.shipped && line.allocations?.length);
    if (!shipped.length) return;
    await Batch.bulkWrite(shipped.flatMap((line) => line.allocations.map((item) => ({
        updateOne: {
            filter: { _id: item.batch },
            update: { $inc: { onHand: item.qty } },
        },
    }))));
    await StockMovement.insertMany(shipped.flatMap((line) => line.allocations.map((item) => ({
        product: line.product,
        batch: item.batch,
        type: "RETURN",
        quantity: item.qty,
        order: order._id,
        note: "Order deleted after dispatch",
        at: new Date(),
        createdBy: userId,
    }))));
    await syncProductStock(shipped.map((line) => line.product));
};

const recordEntry = async ({ productId, batchNo, caseSize, mfgDate, expiryDate, quantity, type, note, userId }) => {
    await absorbLegacyStock(productId, userId);
    const normalized = String(batchNo || "").trim().toUpperCase();
    if (!normalized || normalized.length > 40) {
        const error = new Error("Enter a batch number");
        error.status = 400;
        throw error;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
        const error = new Error("Enter a whole quantity of at least 1");
        error.status = 400;
        throw error;
    }

    let batch = await Batch.findOne({ product: productId, batchNo: normalized });
    if (!batch && type !== "PRODUCTION") {
        const error = new Error("That batch does not exist. Add it with a production entry first");
        error.status = 404;
        throw error;
    }
    if (!batch) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(mfgDate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || mfgDate > expiryDate) {
            const error = new Error("Enter a valid manufacturing date and expiry date");
            error.status = 400;
            throw error;
        }
        batch = await Batch.create({
            product: productId,
            batchNo: normalized,
            caseSize: String(caseSize || "").trim().slice(0, 40),
            mfgDate: dayStamp(mfgDate),
            expiryDate: dayStamp(expiryDate),
            onHand: 0,
            reserved: 0,
        });
    }

    if (type === "DAMAGE" || type === "EXPIRY") {
        const updated = await Batch.findOneAndUpdate(
            { _id: batch._id, $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, quantity] } },
            { $inc: { onHand: -quantity } },
            { returnDocument: "after" }
        ).select("_id");
        if (!updated) {
            const error = new Error("That quantity is more than the free stock in this batch");
            error.status = 400;
            throw error;
        }
    } else {
        await Batch.updateOne({ _id: batch._id }, { $inc: { onHand: quantity } });
    }

    await StockMovement.create({
        product: productId,
        batch: batch._id,
        type,
        quantity,
        note: String(note || "").trim().slice(0, 200),
        at: new Date(),
        createdBy: userId,
    });
    await syncProductStock([productId]);
};

const MANUAL_TYPES = new Set(["OPENING", "PRODUCTION", "DAMAGE", "EXPIRY", "RETURN"]);

const effectOf = (type, quantity) => (type === "SALE" || type === "DAMAGE" || type === "EXPIRY" ? -quantity : quantity);

const loadManualEntry = async (movementId) => {
    if (!mongoose.Types.ObjectId.isValid(movementId)) {
        const error = new Error("Stock entry not found");
        error.status = 404;
        throw error;
    }
    const movement = await StockMovement.findById(movementId);
    if (!movement) {
        const error = new Error("Stock entry not found");
        error.status = 404;
        throw error;
    }
    if (movement.order || !MANUAL_TYPES.has(movement.type)) {
        const error = new Error("Delivered stock stays on the report. Change a delivery from the order");
        error.status = 400;
        throw error;
    }
    return movement;
};

const applyOnHandDelta = async (batchId, delta, extraSet) => {
    const update = {};
    if (delta) update.$inc = { onHand: delta };
    if (extraSet && Object.keys(extraSet).length) update.$set = extraSet;
    if (!update.$inc && !update.$set) return;
    if (!delta || delta > 0) {
        const result = await Batch.updateOne({ _id: batchId }, update);
        if (!result.matchedCount) {
            const error = new Error("Batch not found");
            error.status = 404;
            throw error;
        }
        return;
    }
    const result = await Batch.updateOne(
        { _id: batchId, $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, -delta] } },
        update
    );
    if (!result.modifiedCount) {
        const error = new Error("Not enough free stock in this batch to change the entry");
        error.status = 400;
        throw error;
    }
};

const updateEntry = async ({ movementId, quantity, note, caseSize, mfgDate, expiryDate }) => {
    const movement = await loadManualEntry(movementId);
    if (!Number.isInteger(quantity) || quantity < 1) {
        const error = new Error("Enter a whole quantity of at least 1");
        error.status = 400;
        throw error;
    }
    const set = {};
    if (caseSize !== undefined) set.caseSize = String(caseSize || "").trim().slice(0, 40);
    const mfg = String(mfgDate || "").trim();
    const exp = String(expiryDate || "").trim();
    if (mfg || exp) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(mfg) || !/^\d{4}-\d{2}-\d{2}$/.test(exp) || mfg > exp) {
            const error = new Error("Enter a valid manufacturing date and expiry date");
            error.status = 400;
            throw error;
        }
        set.mfgDate = dayStamp(mfg);
        set.expiryDate = dayStamp(exp);
    }
    const delta = effectOf(movement.type, quantity) - effectOf(movement.type, movement.quantity);
    await applyOnHandDelta(movement.batch, delta, set);
    movement.quantity = quantity;
    if (note !== undefined) movement.note = String(note || "").trim().slice(0, 200);
    await movement.save();
    await syncProductStock([movement.product]);
};

const deleteEntry = async (movementId) => {
    const movement = await loadManualEntry(movementId);
    const delta = -effectOf(movement.type, movement.quantity);
    await applyOnHandDelta(movement.batch, delta);
    await StockMovement.deleteOne({ _id: movement._id });
    const stillUsed = await StockMovement.exists({ batch: movement.batch });
    if (!stillUsed) await Batch.deleteOne({ _id: movement.batch, onHand: 0, reserved: 0 });
    await syncProductStock([movement.product]);
};

module.exports = { releaseLines, allocate, shipOrder, restoreShipped, recordEntry, updateEntry, deleteEntry, dayStamp };
