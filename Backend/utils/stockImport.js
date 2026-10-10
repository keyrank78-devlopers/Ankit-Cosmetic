const mongoose = require("mongoose");
const multer = require("multer");
const ExcelJS = require("exceljs");
const Batch = require("../models/Batch");
const StockMovement = require("../models/StockMovement");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { dayStamp, syncProductStock } = require("./stock");

const MAX_ROWS = 10000;
const ERROR_CAP = 30;

const uploadSheet = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const name = String(file.originalname || "").toLowerCase();
        const type = String(file.mimetype || "");
        if (name.endsWith(".xlsx") || type.includes("spreadsheetml")) return cb(null, true);
        const error = new Error("Upload an Excel .xlsx file");
        error.status = 400;
        return cb(error);
    },
});

const receiveStockSheet = (req, res, next) => {
    uploadSheet.single("file")(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Excel must be 20 MB or smaller"
            : error.message || "Could not read the Excel file";
        return res.status(400).json({ success: false, message });
    });
};

const headerKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER = {
    productname: "name",
    name: "name",
    batchnumber: "batchNo",
    batchno: "batchNo",
    batch: "batchNo",
    quantity: "quantity",
    qty: "quantity",
    mfgdate: "mfgDate",
    mfg: "mfgDate",
    manufacturingdate: "mfgDate",
    expirydate: "expiryDate",
    expiry: "expiryDate",
    casesize: "caseSize",
    case: "caseSize",
    openingstock: "openingStock",
    opening: "openingStock",
    note: "note",
};

const pad = (value) => String(value).padStart(2, "0");

const dateFromUtc = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const parseDate = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return dateFromUtc(value);
    if (typeof value === "number" && Number.isFinite(value)) {
        const utc = new Date(Math.round((value - 25569) * 86400 * 1000));
        if (!Number.isNaN(utc.getTime())) return dateFromUtc(utc);
    }
    const text = String(value ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!match) return "";
    return `${match[3]}-${pad(match[2])}-${pad(match[1])}`;
};

const cellValue = (cell) => {
    const value = cell?.value;
    if (value == null) return "";
    if (value instanceof Date) return value;
    if (typeof value === "object") {
        if (value.result != null) return value.result instanceof Date ? value.result : value.result;
        if (typeof value.text === "string") return value.text;
        if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    }
    return value;
};

const wholeNumber = (value) => {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) return null;
    return Number(text);
};

const buildSample = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Stock entry");
    sheet.columns = [
        { header: "Product name", key: "name", width: 28 },
        { header: "Batch number", key: "batchNo", width: 18 },
        { header: "Quantity", key: "quantity", width: 12 },
        { header: "MFG date", key: "mfgDate", width: 16 },
        { header: "Expiry date", key: "expiryDate", width: 16 },
        { header: "Case size", key: "caseSize", width: 14 },
        { header: "Opening stock", key: "openingStock", width: 16 },
        { header: "Note", key: "note", width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({ name: "Face Cream", batchNo: "B-01", quantity: 20, mfgDate: "2026-01-01", expiryDate: "2028-01-01", caseSize: "240 PCS", openingStock: 50, note: "First lot" });
    sheet.addRow({ name: "Pears Soap", batchNo: "B-02", quantity: 100, mfgDate: "2026-02-01", expiryDate: "2027-06-01", caseSize: "", openingStock: "", note: "" });
    return workbook.xlsx.writeBuffer();
};

const readRows = async (buffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
        const error = new Error("The Excel file is empty");
        error.status = 400;
        throw error;
    }
    const headerRow = sheet.getRow(1);
    const columns = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, index) => {
        const field = HEADER[headerKey(cellValue(cell))];
        if (field) columns[field] = index;
    });
    const missing = ["name", "batchNo", "quantity", "mfgDate", "expiryDate"].filter((field) => !columns[field]);
    if (missing.length) {
        const error = new Error("The Excel needs these columns: Product name, Batch number, Quantity, MFG date, Expiry date");
        error.status = 400;
        throw error;
    }
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, number) => {
        if (number === 1) return;
        const read = (field) => (columns[field] ? cellValue(row.getCell(columns[field])) : "");
        const name = String(read("name") ?? "").trim();
        const batchNo = String(read("batchNo") ?? "").trim();
        const quantityText = read("quantity");
        const mfgText = read("mfgDate");
        const expiryText = read("expiryDate");
        const caseText = String(read("caseSize") ?? "").trim();
        const openingText = read("openingStock");
        const note = String(read("note") ?? "").trim();
        if (!name && !batchNo && String(quantityText ?? "").trim() === "" && String(mfgText ?? "").trim() === "" && String(expiryText ?? "").trim() === "" && !caseText && String(openingText ?? "").trim() === "" && !note) {
            return;
        }
        if (rows.length >= MAX_ROWS) {
            const error = new Error("Upload at most 10,000 rows");
            error.status = 400;
            throw error;
        }
        rows.push({
            row: number,
            name,
            batchNo,
            quantityText,
            mfgText,
            expiryText,
            caseText,
            openingText,
            note,
        });
    });
    if (!rows.length) {
        const error = new Error("The Excel needs a header row and at least one product");
        error.status = 400;
        throw error;
    }
    if (rows.length > MAX_ROWS) {
        const error = new Error("Upload at most 10,000 rows");
        error.status = 400;
        throw error;
    }
    return rows;
};

const pushError = (errors, row, message) => {
    if (errors.length < ERROR_CAP) errors.push({ row, message });
};

const prepareRows = (rawRows, products) => {
    const byName = new Map();
    products.forEach((product) => {
        const key = String(product.name || "").trim().toLowerCase();
        if (!key) return;
        byName.set(key, byName.has(key) ? null : product);
    });
    const errors = [];
    const ready = [];
    const seen = new Set();
    rawRows.forEach((raw) => {
        if (!raw.name) {
            pushError(errors, raw.row, "Enter a product name");
            return;
        }
        const product = byName.get(raw.name.toLowerCase());
        if (product === undefined) {
            pushError(errors, raw.row, "No product found with this name");
            return;
        }
        if (!product) {
            pushError(errors, raw.row, "More than one product has this name");
            return;
        }
        const batchNo = raw.batchNo.toUpperCase();
        if (!batchNo || batchNo.length > 40) {
            pushError(errors, raw.row, "Enter a batch number");
            return;
        }
        const quantity = wholeNumber(raw.quantityText);
        if (quantity == null || quantity < 1) {
            pushError(errors, raw.row, "Enter a whole quantity of at least 1");
            return;
        }
        const mfgDate = parseDate(raw.mfgText);
        const expiryDate = parseDate(raw.expiryText);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(mfgDate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || mfgDate > expiryDate) {
            pushError(errors, raw.row, "Enter a valid manufacturing date and expiry date");
            return;
        }
        const openingBlank = String(raw.openingText ?? "").trim() === "";
        const openingStock = openingBlank ? null : wholeNumber(raw.openingText);
        if (!openingBlank && (openingStock == null || openingStock < 0)) {
            pushError(errors, raw.row, "Opening stock must be a whole number, 0 or more");
            return;
        }
        const key = `${product._id}|${batchNo}`;
        if (seen.has(key)) {
            pushError(errors, raw.row, "This product and batch is repeated in the file");
            return;
        }
        seen.add(key);
        ready.push({
            row: raw.row,
            productId: String(product._id),
            batchNo,
            quantity,
            mfgDate,
            expiryDate,
            caseSize: raw.caseText.slice(0, 40),
            openingStock,
            note: raw.note.slice(0, 200),
            stock: Number(product.stock) || 0,
        });
    });
    return { ready, errors, skipped: rawRows.length - ready.length };
};

const dropProduct = (ready, errors, productId, message) => {
    const kept = [];
    let dropped = 0;
    ready.forEach((row) => {
        if (row.productId !== productId) {
            kept.push(row);
            return;
        }
        dropped += 1;
        pushError(errors, row.row, message);
    });
    return { ready: kept, dropped };
};

const openingTargets = (rows) => {
    const target = new Map();
    const conflict = new Set();
    rows.forEach((row) => {
        if (row.openingStock == null) return;
        if (!target.has(row.productId)) {
            target.set(row.productId, row.openingStock);
            return;
        }
        if (target.get(row.productId) !== row.openingStock) conflict.add(row.productId);
    });
    return { target, conflict };
};

const absorbMissing = async (productIds, stockById, userId, now) => {
    if (!productIds.length) return;
    const objectIds = productIds.map((id) => new mongoose.Types.ObjectId(id));
    const existing = await Batch.distinct("product", { product: { $in: objectIds } });
    const have = new Set(existing.map(String));
    const missing = productIds.filter((id) => !have.has(String(id)));
    if (!missing.length) return;
    const missingIds = missing.map((id) => new mongoose.Types.ObjectId(id));
    const locks = await Order.aggregate([
        { $match: { status: { $ne: "OUT_FOR_DELIVERY" } } },
        { $unwind: "$lines" },
        {
            $match: {
                "lines.product": { $in: missingIds },
                "lines.shipped": { $ne: true },
                "lines.lockedQty": { $gt: 0 },
                $or: [{ "lines.allocations": { $exists: false } }, { "lines.allocations": { $size: 0 } }],
            },
        },
        { $group: { _id: "$lines.product", locked: { $sum: "$lines.lockedQty" } } },
    ]);
    const lockedBy = new Map(locks.map((row) => [String(row._id), row.locked]));
    const docs = missing.flatMap((id) => {
        const reserved = lockedBy.get(String(id)) || 0;
        const onHand = (stockById.get(String(id)) || 0) + reserved;
        if (!onHand) return [];
        return [{
            product: id,
            batchNo: "OPENING",
            caseSize: "",
            mfgDate: now,
            expiryDate: new Date("2099-12-31"),
            onHand,
            reserved,
        }];
    });
    if (!docs.length) return;
    const inserted = await Batch.insertMany(docs, { ordered: true });
    await StockMovement.insertMany(inserted.map((batch) => ({
        product: batch.product,
        batch: batch._id,
        type: "OPENING",
        quantity: batch.onHand,
        note: "Stock already on the product before batch tracking",
        at: now,
        createdBy: userId,
    })), { ordered: true });
    const batchByProduct = new Map(inserted.filter((batch) => batch.reserved > 0).map((batch) => [String(batch.product), batch._id]));
    if (!batchByProduct.size) return;
    const orders = await Order.find({
        status: { $ne: "OUT_FOR_DELIVERY" },
        lines: { $elemMatch: { product: { $in: [...batchByProduct.keys()] }, lockedQty: { $gt: 0 }, shipped: { $ne: true } } },
    });
    const writes = [];
    orders.forEach((order) => {
        let changed = false;
        order.lines.forEach((line) => {
            const batchId = batchByProduct.get(String(line.product));
            if (batchId && !line.shipped && !line.allocations?.length && line.lockedQty > 0) {
                line.allocations = [{ batch: batchId, qty: line.lockedQty }];
                changed = true;
            }
        });
        if (changed) writes.push({ updateOne: { filter: { _id: order._id }, update: { $set: { lines: order.lines } } } });
    });
    if (writes.length) await Order.bulkWrite(writes, { ordered: false });
};

const batchKey = (productId, batchNo) => `${productId}|${batchNo}`;

const importStockSheet = async (buffer, userId) => {
    const rawRows = await readRows(buffer);
    const products = await Product.find({ status: "ACTIVE" }).select("name stock").lean();
    const prepared = prepareRows(rawRows, products);
    let ready = prepared.ready;
    const errors = prepared.errors;
    let skipped = prepared.skipped;
    const { target, conflict } = openingTargets(ready);
    conflict.forEach((productId) => {
        const next = dropProduct(ready, errors, productId, "Opening stock does not match another row for this product");
        ready = next.ready;
        skipped += next.dropped;
    });
    if (!ready.length) return { added: 0, skipped, errors };

    const productIds = [...new Set(ready.map((row) => row.productId))];
    const stockById = new Map(ready.map((row) => [row.productId, row.stock]));
    const objectIds = productIds.map((id) => new mongoose.Types.ObjectId(id));
    const currentBatches = await Batch.find({ product: { $in: objectIds } }).select("product batchNo onHand reserved").lean();
    const hasBatch = new Set(currentBatches.map((batch) => String(batch.product)));
    const now = new Date();
    const liveIds = [...new Set(ready.map((row) => row.productId))];
    await absorbMissing(liveIds.filter((id) => !hasBatch.has(id)), stockById, userId, now);
    const loaded = await Batch.find({ product: { $in: liveIds } }).select("product batchNo onHand reserved").lean();
    const postedAt = new Date();
    const batches = new Map(loaded.map((batch) => [batchKey(batch.product, batch.batchNo), { ...batch, persisted: true }]));
    const incById = new Map();
    const movements = [];
    const fresh = [];

    const touch = (batch, delta) => {
        batch.onHand += delta;
        if (!batch.persisted || !batch._id || !delta) return;
        const id = String(batch._id);
        incById.set(id, (incById.get(id) || 0) + delta);
    };

    const ensure = (productId, batchNo, extras) => {
        const key = batchKey(productId, batchNo);
        let batch = batches.get(key);
        if (batch) return batch;
        batch = {
            product: productId,
            batchNo,
            caseSize: extras?.caseSize || "",
            mfgDate: extras?.mfgDate || now,
            expiryDate: extras?.expiryDate || new Date("2099-12-31"),
            onHand: 0,
            reserved: 0,
            persisted: false,
        };
        batches.set(key, batch);
        fresh.push(batch);
        return batch;
    };

    const failed = new Set();
    liveIds.forEach((productId) => {
        if (!target.has(productId) || !ready.some((row) => row.productId === productId)) return;
        const opening = target.get(productId);
        const own = [...batches.values()].filter((batch) => String(batch.product) === productId);
        const available = own.reduce((sum, batch) => sum + (batch.onHand - batch.reserved), 0);
        const delta = opening - available;
        if (!delta) return;
        if (delta > 0) {
            const batch = ensure(productId, "OPENING");
            touch(batch, delta);
            movements.push({
                product: productId,
                batchRef: batch,
                type: "OPENING",
                quantity: delta,
                note: "Opening stock updated from stock entry",
                at: postedAt,
                createdBy: userId,
            });
            return;
        }
        let need = -delta;
        const ordered = [...own].sort((a, b) => {
            if (a.batchNo === "OPENING") return -1;
            if (b.batchNo === "OPENING") return 1;
            return 0;
        });
        const takes = [];
        for (const batch of ordered) {
            if (need <= 0) break;
            const free = batch.onHand - batch.reserved;
            if (free <= 0) continue;
            const take = Math.min(free, need);
            takes.push({ batch, take });
            need -= take;
        }
        if (need > 0) {
            failed.add(productId);
            return;
        }
        takes.forEach((item) => {
            touch(item.batch, -item.take);
            movements.push({
                product: productId,
                batchRef: item.batch,
                type: "OPENING",
                kind: "REDUCTION",
                quantity: item.take,
                note: "Opening stock reduced from stock entry",
                at: postedAt,
                createdBy: userId,
            });
        });
    });
    failed.forEach((productId) => {
        const next = dropProduct(ready, errors, productId, "Opening stock can't go below quantity already reserved on orders");
        ready = next.ready;
        skipped += next.dropped;
    });
    if (!ready.length) return { added: 0, skipped, errors };

    ready.forEach((row) => {
        const batch = ensure(row.productId, row.batchNo, {
            caseSize: row.caseSize,
            mfgDate: dayStamp(row.mfgDate),
            expiryDate: dayStamp(row.expiryDate),
        });
        if (!batch.persisted) {
            batch.caseSize = row.caseSize || batch.caseSize || "";
            batch.mfgDate = dayStamp(row.mfgDate);
            batch.expiryDate = dayStamp(row.expiryDate);
        }
        touch(batch, row.quantity);
        movements.push({
            product: row.productId,
            batchRef: batch,
            type: "PRODUCTION",
            quantity: row.quantity,
            note: row.note,
            at: postedAt,
            createdBy: userId,
        });
    });

    const createdIds = [];
    try {
        if (fresh.length) {
            const inserted = await Batch.insertMany(fresh.map((batch) => ({
                product: batch.product,
                batchNo: batch.batchNo,
                caseSize: batch.caseSize || "",
                mfgDate: batch.mfgDate,
                expiryDate: batch.expiryDate,
                onHand: batch.onHand,
                reserved: 0,
            })), { ordered: true });
            inserted.forEach((batch, index) => {
                fresh[index]._id = batch._id;
                createdIds.push(batch._id);
            });
        }
        if (incById.size) {
            await Batch.bulkWrite([...incById].map(([id, delta]) => ({
                updateOne: { filter: { _id: id }, update: { $inc: { onHand: delta } } },
            })), { ordered: false });
        }
        if (movements.length) {
            await StockMovement.insertMany(movements.map((item) => ({
                product: item.product,
                batch: item.batchRef._id,
                type: item.type,
                ...(item.kind ? { kind: item.kind } : {}),
                quantity: item.quantity,
                note: item.note || "",
                at: item.at,
                createdBy: item.createdBy,
            })), { ordered: true });
        }
        await syncProductStock(liveIds);
    } catch (error) {
        if (movements.length) {
            await StockMovement.deleteMany({ at: postedAt, createdBy: userId, product: { $in: liveIds }, order: null });
        }
        if (incById.size) {
            await Batch.bulkWrite([...incById].map(([id, delta]) => ({
                updateOne: { filter: { _id: id }, update: { $inc: { onHand: -delta } } },
            })), { ordered: false });
        }
        if (createdIds.length) await Batch.deleteMany({ _id: { $in: createdIds } });
        await syncProductStock(liveIds);
        throw error;
    }

    return { added: ready.length, skipped, errors };
};

module.exports = { receiveStockSheet, buildSample, importStockSheet };
