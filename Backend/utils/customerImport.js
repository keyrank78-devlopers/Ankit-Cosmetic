const multer = require("multer");
const Customer = require("../models/Customer");
const { reserveCustomerCodes } = require("./customerCode");

const MAX_ROWS = 100000;
const BATCH = 4000;
const SAMPLE = [
    "retailerName,firmName,contactNo1,contactNo2,gstin,dlNo,addressLine,villageCity,tehsil,postOffice,district,state,pincode,landmark",
    "Ramesh Kumar,Sharma Traders,9876543210,,22AAAAA0000A1Z5,DL123,12 Market Road,Jaipur,Jaipur,Jaipur,Jaipur,Rajasthan,302001,Near bus stand",
].join("\n");

const uploadCsv = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 40 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const name = String(file.originalname || "").toLowerCase();
        if (name.endsWith(".csv") || String(file.mimetype || "").includes("csv") || file.mimetype === "text/plain" || file.mimetype === "application/vnd.ms-excel") {
            return cb(null, true);
        }
        const error = new Error("Upload a CSV file");
        error.status = 400;
        return cb(error);
    },
});

const receiveCustomerCsv = (req, res, next) => {
    uploadCsv.single("file")(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "CSV must be 40 MB or smaller"
            : error.message || "Could not read the CSV";
        return res.status(400).json({ success: false, message });
    });
};

const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quoted) {
            if (char === "\"") {
                if (source[index + 1] === "\"") {
                    cell += "\"";
                    index += 1;
                } else quoted = false;
            } else cell += char;
        } else if (char === "\"") quoted = true;
        else if (char === ",") {
            row.push(cell);
            cell = "";
        } else if (char === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else if (char !== "\r") cell += char;
    }
    if (cell.length || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((item) => item.some((value) => String(value).trim()));
};

const digits = (value) => String(value || "").replace(/[^\d]/g, "");

const prepareRows = (text) => {
    const table = parseCsv(text);
    if (table.length < 2) {
        const error = new Error("The CSV needs a header row and at least one customer");
        error.status = 400;
        throw error;
    }
    const header = table[0].map((item) => String(item).trim());
    const missing = ["retailerName", "firmName", "contactNo1", "addressLine", "villageCity", "state", "pincode"].filter((name) => !header.includes(name));
    if (missing.length) {
        const error = new Error(`CSV is missing ${missing.join(", ")}. Download the sample and use those column names.`);
        error.status = 400;
        throw error;
    }
    const data = table.slice(1);
    if (data.length > MAX_ROWS) {
        const error = new Error(`Upload at most ${MAX_ROWS} customers in one file`);
        error.status = 400;
        throw error;
    }
    const indexOf = Object.fromEntries(header.map((name, index) => [name, index]));
    const value = (line, name) => String(line[indexOf[name]] ?? "").trim();
    const seen = new Set();
    const ready = [];
    const errors = [];
    const pushError = (row, message) => {
        if (errors.length < 30) errors.push({ row, message });
    };
    data.forEach((line, offset) => {
        const row = offset + 2;
        const retailerName = value(line, "retailerName");
        const firmName = value(line, "firmName");
        const contactNo1 = digits(value(line, "contactNo1"));
        const contactNo2 = digits(value(line, "contactNo2"));
        const gstin = value(line, "gstin").toUpperCase();
        const addressLine = value(line, "addressLine");
        const villageCity = value(line, "villageCity");
        const state = value(line, "state");
        const pincode = value(line, "pincode");
        if (!retailerName || retailerName.length < 2) return pushError(row, "Retailer name must be at least 2 characters");
        if (!firmName) return pushError(row, "Firm name is required");
        if (!/^\d{10,15}$/.test(contactNo1)) return pushError(row, "Contact number must be 10 to 15 digits");
        if (contactNo2 && !/^\d{10,15}$/.test(contactNo2)) return pushError(row, "Contact number 2 must be 10 to 15 digits");
        if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) return pushError(row, "GSTIN must be 15 characters");
        if (!addressLine) return pushError(row, "Address is required");
        if (!villageCity) return pushError(row, "Village/City is required");
        if (!state) return pushError(row, "State is required");
        if (!pincode) return pushError(row, "Pin code is required");
        if (seen.has(contactNo1)) return pushError(row, "This phone is repeated in the file");
        seen.add(contactNo1);
        ready.push({
            row,
            retailerName,
            firmName,
            contactNo1,
            contactNo2: contactNo2 || undefined,
            gstin: gstin || undefined,
            dlNo: value(line, "dlNo") || undefined,
            address: {
                line: addressLine,
                villageCity,
                tehsil: value(line, "tehsil") || undefined,
                postOffice: value(line, "postOffice") || undefined,
                district: value(line, "district") || undefined,
                state,
                pincode,
                landmark: value(line, "landmark") || undefined,
            },
        });
    });
    return { ready, errors, skipped: data.length - ready.length };
};

const existingPhones = async (phones) => {
    const found = new Set();
    for (let index = 0; index < phones.length; index += BATCH) {
        const slice = phones.slice(index, index + BATCH);
        const rows = await Customer.find({ contactNo1: { $in: slice } }).select("contactNo1").lean();
        rows.forEach((item) => found.add(item.contactNo1));
    }
    return found;
};

const importCustomers = async (text, userId) => {
    const prepared = prepareRows(text);
    const phones = prepared.ready.map((item) => item.contactNo1);
    const taken = phones.length ? await existingPhones(phones) : new Set();
    const fresh = [];
    prepared.ready.forEach((item) => {
        if (taken.has(item.contactNo1)) {
            prepared.skipped += 1;
            if (prepared.errors.length < 30) prepared.errors.push({ row: item.row, message: "This phone already exists" });
            return;
        }
        fresh.push(item);
    });
    if (!fresh.length) {
        return { added: 0, skipped: prepared.skipped, errors: prepared.errors };
    }
    const codes = await reserveCustomerCodes(fresh.length);
    const now = new Date();
    const docs = fresh.map((item, index) => ({
        customerCode: codes[index],
        retailerName: item.retailerName,
        firmName: item.firmName,
        contactNo1: item.contactNo1,
        contactNo2: item.contactNo2,
        gstin: item.gstin,
        dlNo: item.dlNo,
        address: item.address,
        createdBy: userId,
        leadStage: "NEW",
        createdAt: now,
        updatedAt: now,
    }));
    let added = 0;
    const batches = [];
    for (let index = 0; index < docs.length; index += BATCH) batches.push(docs.slice(index, index + BATCH));
    const workers = Array.from({ length: Math.min(4, batches.length) }, async () => {
        while (batches.length) {
            const batch = batches.shift();
            if (!batch) return;
            try {
                const inserted = await Customer.insertMany(batch, { ordered: false });
                added += inserted.length;
            } catch (error) {
                added += error.insertedDocs?.length || 0;
                if (!error.insertedDocs?.length) throw error;
            }
        }
    });
    await Promise.all(workers);
    return { added, skipped: prepared.skipped, errors: prepared.errors };
};

module.exports = { SAMPLE, receiveCustomerCsv, importCustomers };
