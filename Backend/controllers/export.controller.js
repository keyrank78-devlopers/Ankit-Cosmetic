const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const User = require("../models/User");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const FollowUp = require("../models/FollowUp");
const ExportRequest = require("../models/ExportRequest");
const { downlineIds } = require("../utils/reporting");

const TYPES = ["EMPLOYEES", "ORDERS", "CUSTOMERS"];
const ROW_CAP = 8000;
const TYPE_PERMS = {
    EMPLOYEES: ["VIEW_EMPLOYEES", "MANAGE_EMPLOYEES", "CREATE_EMPLOYEES", "EDIT_EMPLOYEES", "DELETE_EMPLOYEES"],
    ORDERS: ["VIEW_ORDERS"],
    CUSTOMERS: ["VIEW_CUSTOMERS"],
};
const FILTER_KEYS = {
    EMPLOYEES: ["search", "department", "designation", "manager"],
    ORDERS: ["search", "customerName", "customerCode", "product", "from", "to", "minQty", "maxQty", "minTotal", "maxTotal", "schemeType", "expiry", "status", "paymentMethod", "sort"],
    CUSTOMERS: ["search", "city", "state", "phone", "stage"],
};
const PLACED_STATUSES = ["PLACED", "PENDING_CONFIRM", "PENDING", "CONFIRM", "READY_TO_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"];
const PAYMENT_METHODS = ["COD", "ONLINE", "CASH", "ADVANCE_COD"];
const STAGES = ["NEW", "ASSIGNED", "FOLLOW_UP", "CONVERTED", "LOST"];

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fail = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const canExport = (user, type) => {
    if (!TYPES.includes(type)) return false;
    if (user?.userType === "ADMIN") return true;
    const need = TYPE_PERMS[type];
    const permissions = user?.permissions || [];
    if (permissions.some((item) => need.includes(item))) return true;
    const role = String(user?.role || "").toUpperCase().replace(/[\s_-]+/g, "");
    return role === "FIELDEXECUTIVE" && type !== "EMPLOYEES" && permissions.length === 0;
};

const cleanFilters = (type, source) => {
    const filters = {};
    for (const key of FILTER_KEYS[type] || []) {
        const value = source?.[key];
        if (value == null) continue;
        const text = String(value).trim().slice(0, 80);
        if (text) filters[key] = text;
    }
    return filters;
};

const stamp = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

const dayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const plain = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const isFieldExecutive = (user) => {
    const role = String(user?.role || user?.userType || "").toUpperCase().replace(/[\s_-]+/g, "");
    return role === "FIELDEXECUTIVE";
};

const leadScope = async (user) => {
    if (!user || user.userType === "ADMIN") return {};
    const below = await downlineIds(user._id);
    if (below.length) {
        const ids = [user._id, ...below];
        return { $or: [{ createdBy: { $in: ids } }, { assignedTo: { $in: ids } }] };
    }
    if (isFieldExecutive(user)) return { $or: [{ createdBy: user._id }, { assignedTo: user._id }] };
    return {};
};

const orderScope = async (user) => {
    if (!user || user.userType === "ADMIN") return {};
    const selfId = new mongoose.Types.ObjectId(user._id);
    const below = await downlineIds(user._id);
    if (below.length) return { createdBy: { $in: [selfId, ...below] } };
    if (isFieldExecutive(user)) return { createdBy: selfId };
    return {};
};

const styleSheet = (sheet) => {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
};

const sheetFrom = (workbook, name, columns, rows) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    if (rows.length) sheet.addRows(rows);
    styleSheet(sheet);
    return sheet;
};

const employeeRows = async (filters) => {
    const filter = { userType: { $in: ["EMPLOYEE", "VENDOR"] } };
    if (filters.department) {
        if (mongoose.Types.ObjectId.isValid(filters.department)) filter.department = filters.department;
        else {
            const dept = await Department.findOne({ name: { $regex: new RegExp(`^${escapeRegex(filters.department)}$`, "i") } });
            filter.department = dept ? dept._id : null;
        }
    }
    if (filters.designation) {
        if (mongoose.Types.ObjectId.isValid(filters.designation)) filter.designation = filters.designation;
        else {
            const desig = await Designation.findOne({ name: { $regex: new RegExp(`^${escapeRegex(filters.designation)}$`, "i") } });
            filter.designation = desig ? desig._id : null;
        }
    }
    if (filters.search) {
        const safeSearch = escapeRegex(filters.search);
        filter.$or = ["name", "email", "phone", "employeeId", "vendorId"].map((field) => ({ [field]: { $regex: safeSearch, $options: "i" } }));
    }
    if (filters.manager) {
        if (!mongoose.Types.ObjectId.isValid(filters.manager)) throw fail(400, "Invalid manager");
        filter.reportingManager = filters.manager;
    }
    const total = await User.countDocuments(filter);
    if (total > ROW_CAP) throw fail(400, "Too many employees for one file. Narrow the filter.");
    const people = await User.find(filter)
        .select("-password -refreshToken")
        .populate("department", "name")
        .populate("designation", "name")
        .populate("reportingManager", "name employeeId")
        .sort({ createdAt: -1 })
        .lean();
    return people.map((person) => ({
        employeeId: person.employeeId || person.vendorId || "",
        name: person.name || "",
        email: person.email || "",
        phone: person.phone || "",
        userType: person.userType || "",
        role: person.role || "",
        status: person.status || "",
        department: person.department?.name || "",
        designation: person.designation?.name || "",
        manager: person.reportingManager?.name || "",
        managerId: person.reportingManager?.employeeId || "",
        city: person.address?.city || "",
        state: person.address?.state || "",
        pincode: person.address?.pincode || "",
        locality: person.address?.locality || "",
        street: person.address?.street || "",
        landmark: person.address?.landmark || "",
        permissions: (person.permissions || []).join(", "),
        documents: (person.documents || []).map((doc) => doc.name).filter(Boolean).join(", "),
        createdAt: stamp(person.createdAt),
    }));
};

const customerFilter = async (user, filters) => {
    const contains = (value) => ({ $regex: escapeRegex(String(value).trim()), $options: "i" });
    const clauses = [];
    if (filters.search) {
        const rx = contains(filters.search);
        clauses.push({
            $or: ["retailerName", "firmName", "contactNo1", "contactNo2", "gstin", "dlNo", "customerCode", "address.line", "address.villageCity", "address.tehsil", "address.postOffice", "address.district", "address.state", "address.pincode", "address.landmark"].map((field) => ({ [field]: rx })),
        });
    }
    if (filters.city) {
        const rx = contains(filters.city);
        clauses.push({ $or: [{ "address.villageCity": rx }, { "address.district": rx }] });
    }
    if (filters.state) clauses.push({ "address.state": contains(filters.state) });
    if (filters.phone) {
        const rx = contains(filters.phone);
        clauses.push({ $or: [{ contactNo1: rx }, { contactNo2: rx }] });
    }
    if (filters.stage && STAGES.includes(filters.stage)) {
        clauses.push(filters.stage === "NEW"
            ? { $or: [{ leadStage: "NEW" }, { leadStage: { $exists: false } }, { leadStage: null }] }
            : { leadStage: filters.stage });
    }
    const scope = await leadScope(user);
    if (scope.$or) clauses.push(scope);
    return clauses.length ? { $and: clauses } : {};
};

const customerBook = async (user, filters) => {
    const filter = await customerFilter(user, filters);
    const total = await Customer.countDocuments(filter);
    if (total > ROW_CAP) throw fail(400, "Too many customers for one file. Narrow the filter.");
    const customers = await Customer.find(filter)
        .populate({ path: "createdBy", select: "name employeeId" })
        .populate({ path: "assignedTo", select: "name employeeId" })
        .sort({ createdAt: -1 })
        .lean();
    const ids = customers.map((item) => item._id);
    const followUps = ids.length
        ? await FollowUp.find({ customer: { $in: ids } }).populate({ path: "by", select: "name employeeId" }).sort({ at: -1 }).limit(ROW_CAP).lean()
        : [];
    const byId = new Map(customers.map((item) => [String(item._id), item]));
    return {
        customers: customers.map((item) => ({
            customerCode: item.customerCode || "",
            retailerName: item.retailerName || "",
            firmName: item.firmName || "",
            contactNo1: item.contactNo1 || "",
            contactNo2: item.contactNo2 || "",
            gstin: item.gstin || "",
            dlNo: item.dlNo || "",
            line: item.address?.line || "",
            villageCity: item.address?.villageCity || "",
            tehsil: item.address?.tehsil || "",
            postOffice: item.address?.postOffice || "",
            district: item.address?.district || "",
            state: item.address?.state || "",
            pincode: item.address?.pincode || "",
            landmark: item.address?.landmark || "",
            stage: item.leadStage || "NEW",
            assignedTo: item.assignedTo?.name || "",
            assignedId: item.assignedTo?.employeeId || "",
            assignedAt: stamp(item.assignedAt),
            nextFollowUpAt: stamp(item.nextFollowUpAt),
            nextPurpose: item.nextPurpose || "",
            lastFollowUpAt: stamp(item.lastFollowUpAt),
            lostReason: item.lostReason || "",
            createdBy: item.createdBy?.name || "",
            createdAt: stamp(item.createdAt),
        })),
        followUps: followUps.map((item) => {
            const customer = byId.get(String(item.customer));
            return {
                customerCode: customer?.customerCode || "",
                retailerName: customer?.retailerName || "",
                at: stamp(item.at),
                by: item.by?.name || "",
                purpose: item.purpose || "",
                note: item.note || "",
                result: item.result || "",
                nextFollowUpAt: stamp(item.nextFollowUpAt),
                nextPurpose: item.nextPurpose || "",
            };
        }),
    };
};

const orderMatch = async (user, filters) => {
    const numberOrNull = (value) => {
        if (value == null || String(value).trim() === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : NaN;
    };
    const minQty = numberOrNull(filters.minQty);
    const maxQty = numberOrNull(filters.maxQty);
    const minTotal = numberOrNull(filters.minTotal);
    const maxTotal = numberOrNull(filters.maxTotal);
    if ([minQty, maxQty, minTotal, maxTotal].some((value) => Number.isNaN(value))) throw fail(400, "Quantity and amount filters must be numbers");
    if ((minQty !== null && maxQty !== null && minQty > maxQty) || (minTotal !== null && maxTotal !== null && minTotal > maxTotal)) {
        throw fail(400, "The minimum filter cannot be greater than the maximum");
    }
    if ((filters.from && !/^\d{4}-\d{2}-\d{2}$/.test(filters.from)) || (filters.to && !/^\d{4}-\d{2}-\d{2}$/.test(filters.to))) {
        throw fail(400, "Use a valid date range");
    }
    const requestedStatus = filters.status || "";
    const match = requestedStatus === "PENDING"
        ? { status: { $in: ["PLACED", "PENDING_CONFIRM", "PENDING"] } }
        : ["CONFIRM", "READY_TO_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(requestedStatus)
            ? { status: requestedStatus }
            : { status: { $in: PLACED_STATUSES } };
    if (PAYMENT_METHODS.includes(filters.paymentMethod || "")) match.paymentMethod = filters.paymentMethod;
    if (filters.from || filters.to) {
        match.placedAt = {};
        if (filters.from) match.placedAt.$gte = new Date(`${filters.from}T00:00:00`);
        if (filters.to) match.placedAt.$lte = new Date(`${filters.to}T23:59:59.999`);
    }
    if (filters.schemeType === "NONE") match.schemeType = { $exists: false };
    else if (["SLAB", "OPEN", "FIRST_ORDER"].includes(filters.schemeType || "")) match.schemeType = filters.schemeType;
    if (filters.expiry === "yes") match.expiryEnabled = true;
    if (filters.expiry === "no") match.expiryEnabled = { $ne: true };
    if (filters.product) match["lines.name"] = { $regex: escapeRegex(filters.product), $options: "i" };
    if (minTotal !== null || maxTotal !== null) {
        match.total = {};
        if (minTotal !== null) match.total.$gte = minTotal;
        if (maxTotal !== null) match.total.$lte = maxTotal;
    }
    const afterLookup = {};
    if (filters.customerName) afterLookup["customerDoc.retailerName"] = { $regex: escapeRegex(filters.customerName), $options: "i" };
    if (filters.customerCode) afterLookup["customerDoc.customerCode"] = { $regex: escapeRegex(filters.customerCode), $options: "i" };
    if (filters.search) {
        const rx = { $regex: escapeRegex(filters.search), $options: "i" };
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
    Object.assign(match, await orderScope(user));
    const sorts = {
        newest: { placedAt: -1 },
        oldest: { placedAt: 1 },
        total_desc: { total: -1 },
        total_asc: { total: 1 },
        qty_desc: { totalQty: -1 },
        qty_asc: { totalQty: 1 },
    };
    return { match, afterLookup, sort: sorts[filters.sort] || sorts.newest };
};

const orderBook = async (user, filters) => {
    const { match, afterLookup, sort } = await orderMatch(user, filters);
    const orders = await Order.aggregate([
        { $match: match },
        {
            $lookup: {
                from: Customer.collection.name,
                localField: "customer",
                foreignField: "_id",
                pipeline: [{ $project: { retailerName: 1, firmName: 1, customerCode: 1, contactNo1: 1 } }],
                as: "customerDoc",
            },
        },
        { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: User.collection.name,
                localField: "createdBy",
                foreignField: "_id",
                pipeline: [{ $project: { name: 1, employeeId: 1 } }],
                as: "placedBy",
            },
        },
        { $unwind: { path: "$placedBy", preserveNullAndEmptyArrays: true } },
        { $addFields: { totalQty: { $sum: "$lines.quantity" } } },
        { $match: afterLookup },
        { $sort: sort },
        { $limit: ROW_CAP + 1 },
    ]);
    if (orders.length > ROW_CAP) throw fail(400, "Too many orders for one file. Narrow the filter.");
    const lines = [];
    const payments = [];
    const claims = [];
    for (const order of orders) {
        const shared = {
            orderCode: order.orderCode || "",
            placedAt: stamp(order.placedAt),
            status: order.status || "",
            customer: order.customerDoc?.retailerName || "",
            firm: order.customerDoc?.firmName || "",
            customerCode: order.customerDoc?.customerCode || "",
            phone: order.customerDoc?.contactNo1 || "",
            payment: order.paymentMethod || "",
            pending: order.pendingAmount ?? "",
            subtotal: order.subtotal ?? "",
            gst: order.gstTotal ?? "",
            total: order.total ?? "",
            totalQty: order.totalQty || 0,
            scheme: order.schemeName || "",
            schemeType: order.schemeType || "",
            gifts: (order.schemeGifts || []).map((gift) => `${gift.name}${gift.price != null ? ` (${gift.price})` : ""}`).filter(Boolean).join(", "),
            schemeNote: plain(order.schemeNote),
            commitment: order.schemeCommitmentAmount ?? "",
            commitmentMonths: order.schemeCommitmentMonths ?? "",
            placedBy: order.placedBy?.name || "",
        };
        const products = order.lines?.length ? order.lines : [{}];
        for (const line of products) {
            const qty = Number(line.quantity) || 0;
            const price = Number(line.sellPrice) || 0;
            lines.push({
                ...shared,
                product: line.name || "",
                quantity: line.quantity ?? "",
                offerPrice: line.sellPrice ?? "",
                lineAmount: line.name ? round2(qty * price) : "",
                mrp: line.mrp ?? "",
                gstPercent: line.gstPercent ?? "",
                remark: line.remark || "",
            });
        }
        for (const promise of order.paymentPromises || []) {
            payments.push({
                orderCode: shared.orderCode,
                customer: shared.customer,
                amount: promise.amount ?? "",
                dueDate: promise.dueDate || "",
                status: promise.status || "",
                receivedAt: stamp(promise.receivedAt),
            });
        }
        for (const item of order.expiryLines || []) {
            const qty = Number(item.quantity) || 0;
            const mrp = Number(item.mrp) || 0;
            const giveQty = Number(item.givenQuantity) || 0;
            const giveMrp = Number(item.givenMrp) || 0;
            claims.push({
                orderCode: shared.orderCode,
                customer: shared.customer,
                type: item.type || "",
                product: item.name || "",
                quantity: item.quantity ?? "",
                mrp: item.mrp ?? "",
                amount: item.mrp != null ? round2(qty * mrp) : "",
                note: item.note || "",
                otherLabel: item.otherLabel || "",
                givenProduct: item.givenName || "",
                givenQuantity: item.givenQuantity ?? "",
                givenMrp: item.givenMrp ?? "",
                givenAmount: item.givenMrp != null ? round2(giveQty * giveMrp) : "",
                stockGiven: item.stockGiven ?? "",
                stockShort: item.stockShort ?? "",
            });
        }
    }
    if (lines.length > ROW_CAP || payments.length > ROW_CAP || claims.length > ROW_CAP) {
        throw fail(400, "Too many rows for one file. Narrow the filter.");
    }
    return { lines, payments, claims };
};

const workbookFor = async (user, type, filters) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Ankit Cosmetic";
    if (type === "EMPLOYEES") {
        sheetFrom(workbook, "Employees", [
            { header: "Employee id", key: "employeeId", width: 16 },
            { header: "Name", key: "name", width: 24 },
            { header: "Email", key: "email", width: 28 },
            { header: "Phone", key: "phone", width: 16 },
            { header: "Type", key: "userType", width: 14 },
            { header: "Role", key: "role", width: 18 },
            { header: "Status", key: "status", width: 12 },
            { header: "Department", key: "department", width: 20 },
            { header: "Designation", key: "designation", width: 20 },
            { header: "Reporting manager", key: "manager", width: 22 },
            { header: "Manager id", key: "managerId", width: 16 },
            { header: "City", key: "city", width: 16 },
            { header: "State", key: "state", width: 16 },
            { header: "Pincode", key: "pincode", width: 12 },
            { header: "Locality", key: "locality", width: 18 },
            { header: "Street", key: "street", width: 22 },
            { header: "Landmark", key: "landmark", width: 18 },
            { header: "Permissions", key: "permissions", width: 36 },
            { header: "Documents", key: "documents", width: 28 },
            { header: "Created", key: "createdAt", width: 22 },
        ], await employeeRows(filters));
    } else if (type === "CUSTOMERS") {
        const book = await customerBook(user, filters);
        sheetFrom(workbook, "Customers", [
            { header: "Customer id", key: "customerCode", width: 18 },
            { header: "Retailer", key: "retailerName", width: 22 },
            { header: "Firm", key: "firmName", width: 22 },
            { header: "Phone", key: "contactNo1", width: 16 },
            { header: "Phone 2", key: "contactNo2", width: 16 },
            { header: "GSTIN", key: "gstin", width: 18 },
            { header: "DL no", key: "dlNo", width: 16 },
            { header: "Address", key: "line", width: 28 },
            { header: "Village / city", key: "villageCity", width: 18 },
            { header: "Tehsil", key: "tehsil", width: 16 },
            { header: "Post office", key: "postOffice", width: 16 },
            { header: "District", key: "district", width: 16 },
            { header: "State", key: "state", width: 16 },
            { header: "Pincode", key: "pincode", width: 12 },
            { header: "Landmark", key: "landmark", width: 18 },
            { header: "Stage", key: "stage", width: 14 },
            { header: "Assigned to", key: "assignedTo", width: 20 },
            { header: "Assignee id", key: "assignedId", width: 16 },
            { header: "Assigned at", key: "assignedAt", width: 22 },
            { header: "Next follow-up", key: "nextFollowUpAt", width: 22 },
            { header: "Next purpose", key: "nextPurpose", width: 24 },
            { header: "Last follow-up", key: "lastFollowUpAt", width: 22 },
            { header: "Lost reason", key: "lostReason", width: 24 },
            { header: "Created by", key: "createdBy", width: 20 },
            { header: "Created", key: "createdAt", width: 22 },
        ], book.customers);
        sheetFrom(workbook, "Follow-ups", [
            { header: "Customer id", key: "customerCode", width: 18 },
            { header: "Retailer", key: "retailerName", width: 22 },
            { header: "When", key: "at", width: 22 },
            { header: "By", key: "by", width: 20 },
            { header: "Purpose", key: "purpose", width: 24 },
            { header: "Note", key: "note", width: 32 },
            { header: "Result", key: "result", width: 16 },
            { header: "Next follow-up", key: "nextFollowUpAt", width: 22 },
            { header: "Next purpose", key: "nextPurpose", width: 24 },
        ], book.followUps);
    } else {
        const book = await orderBook(user, filters);
        sheetFrom(workbook, "Orders", [
            { header: "Order id", key: "orderCode", width: 18 },
            { header: "Placed", key: "placedAt", width: 22 },
            { header: "Status", key: "status", width: 18 },
            { header: "Customer", key: "customer", width: 22 },
            { header: "Firm", key: "firm", width: 22 },
            { header: "Customer id", key: "customerCode", width: 18 },
            { header: "Phone", key: "phone", width: 16 },
            { header: "Payment", key: "payment", width: 14 },
            { header: "Pending", key: "pending", width: 12 },
            { header: "Subtotal", key: "subtotal", width: 12 },
            { header: "GST", key: "gst", width: 12 },
            { header: "Total", key: "total", width: 12 },
            { header: "Order qty", key: "totalQty", width: 12 },
            { header: "Scheme", key: "scheme", width: 20 },
            { header: "Scheme type", key: "schemeType", width: 14 },
            { header: "Gifts", key: "gifts", width: 28 },
            { header: "Scheme note", key: "schemeNote", width: 28 },
            { header: "Commitment", key: "commitment", width: 14 },
            { header: "Months", key: "commitmentMonths", width: 10 },
            { header: "Placed by", key: "placedBy", width: 20 },
            { header: "Product", key: "product", width: 24 },
            { header: "Qty", key: "quantity", width: 8 },
            { header: "Offer price", key: "offerPrice", width: 12 },
            { header: "Line amount", key: "lineAmount", width: 14 },
            { header: "MRP", key: "mrp", width: 10 },
            { header: "GST %", key: "gstPercent", width: 10 },
            { header: "Remark", key: "remark", width: 28 },
        ], book.lines);
        sheetFrom(workbook, "Payments", [
            { header: "Order id", key: "orderCode", width: 18 },
            { header: "Customer", key: "customer", width: 22 },
            { header: "Amount", key: "amount", width: 12 },
            { header: "Due date", key: "dueDate", width: 14 },
            { header: "Status", key: "status", width: 12 },
            { header: "Received", key: "receivedAt", width: 22 },
        ], book.payments);
        sheetFrom(workbook, "Reimbursements", [
            { header: "Order id", key: "orderCode", width: 18 },
            { header: "Customer", key: "customer", width: 22 },
            { header: "Type", key: "type", width: 12 },
            { header: "Other label", key: "otherLabel", width: 16 },
            { header: "Product in", key: "product", width: 22 },
            { header: "Qty in", key: "quantity", width: 10 },
            { header: "MRP", key: "mrp", width: 10 },
            { header: "Amount", key: "amount", width: 12 },
            { header: "Note", key: "note", width: 24 },
            { header: "Given product", key: "givenProduct", width: 22 },
            { header: "Given qty", key: "givenQuantity", width: 12 },
            { header: "Given MRP", key: "givenMrp", width: 12 },
            { header: "Given amount", key: "givenAmount", width: 14 },
            { header: "From stock", key: "stockGiven", width: 12 },
            { header: "To manufacture", key: "stockShort", width: 16 },
        ], book.claims);
    }
    return workbook.xlsx.writeBuffer();
};

const sendFile = (res, buffer, type) => {
    const filename = `${type.toLowerCase()}-${dayKey()}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
};

const presentRequest = (item) => ({
    _id: item._id,
    type: item.type,
    filters: item.filters || {},
    status: item.status,
    note: item.note || "",
    createdAt: item.createdAt,
    reviewedAt: item.reviewedAt || null,
    usedAt: item.usedAt || null,
    requestedBy: item.requestedBy && typeof item.requestedBy === "object"
        ? { _id: item.requestedBy._id, name: item.requestedBy.name, employeeId: item.requestedBy.employeeId || "" }
        : item.requestedBy,
});

const downloadDirect = async (req, res, next) => {
    try {
        if (req.user.userType !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Ask an admin to approve this download" });
        }
        const type = String(req.query.type || "").trim().toUpperCase();
        if (!canExport(req.user, type)) return res.status(400).json({ success: false, message: "Choose employees, orders, or customers" });
        const buffer = await workbookFor(req.user, type, cleanFilters(type, req.query));
        sendFile(res, buffer, type);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const requestExport = async (req, res, next) => {
    try {
        const type = String(req.body.type || "").trim().toUpperCase();
        if (!canExport(req.user, type)) {
            return res.status(403).json({ success: false, message: "You cannot export this list" });
        }
        if (req.user.userType === "ADMIN") {
            return res.status(400).json({ success: false, message: "Admin can download directly" });
        }
        const filters = cleanFilters(type, req.body.filters || {});
        const open = await ExportRequest.findOne({ requestedBy: req.user._id, type, status: { $in: ["PENDING", "APPROVED"] } });
        if (open?.status === "APPROVED") {
            return res.status(409).json({ success: false, message: "Download the approved file before asking again" });
        }
        if (open) {
            open.filters = filters;
            await open.save();
            return res.status(200).json({ success: true, message: "Download request updated", data: presentRequest(open) });
        }
        const created = await ExportRequest.create({ type, requestedBy: req.user._id, filters, status: "PENDING" });
        res.status(201).json({ success: true, message: "Download request sent to admin", data: presentRequest(created) });
    } catch (error) {
        next(error);
    }
};

const myExport = async (req, res, next) => {
    try {
        const type = String(req.query.type || "").trim().toUpperCase();
        if (!TYPES.includes(type)) return res.status(400).json({ success: false, message: "Choose a list" });
        const open = await ExportRequest.findOne({ requestedBy: req.user._id, type, status: { $in: ["PENDING", "APPROVED"] } }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: open ? presentRequest(open) : null });
    } catch (error) {
        next(error);
    }
};

const listExports = async (req, res, next) => {
    try {
        const status = String(req.query.status || "").trim().toUpperCase();
        const filter = status && ["PENDING", "APPROVED", "REJECTED", "USED"].includes(status) ? { status } : {};
        const rows = await ExportRequest.find(filter)
            .populate("requestedBy", "name employeeId")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.status(200).json({ success: true, data: rows.map(presentRequest) });
    } catch (error) {
        next(error);
    }
};

const reviewExport = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid request" });
        }
        const action = String(req.body.action || "").trim().toUpperCase();
        if (!["APPROVE", "REJECT"].includes(action)) {
            return res.status(400).json({ success: false, message: "Approve or reject the request" });
        }
        const request = await ExportRequest.findById(req.params.id);
        if (!request || request.status !== "PENDING") {
            return res.status(404).json({ success: false, message: "Pending request not found" });
        }
        request.status = action === "APPROVE" ? "APPROVED" : "REJECTED";
        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();
        request.note = String(req.body.note || "").trim().slice(0, 200);
        await request.save();
        const saved = await ExportRequest.findById(request._id).populate("requestedBy", "name employeeId").lean();
        res.status(200).json({ success: true, message: action === "APPROVE" ? "Download approved" : "Download rejected", data: presentRequest(saved) });
    } catch (error) {
        next(error);
    }
};

const downloadApproved = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid request" });
        }
        const request = await ExportRequest.findById(req.params.id);
        if (!request || String(request.requestedBy) !== String(req.user._id)) {
            return res.status(404).json({ success: false, message: "Approved download not found" });
        }
        if (request.status !== "APPROVED") {
            return res.status(400).json({ success: false, message: "This download is not approved" });
        }
        if (!canExport(req.user, request.type)) {
            return res.status(403).json({ success: false, message: "You cannot export this list" });
        }
        const buffer = await workbookFor(req.user, request.type, request.filters || {});
        request.status = "USED";
        request.usedAt = new Date();
        await request.save();
        sendFile(res, buffer, request.type);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

module.exports = {
    downloadDirect,
    requestExport,
    myExport,
    listExports,
    reviewExport,
    downloadApproved,
};
