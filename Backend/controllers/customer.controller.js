const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const FollowUp = require("../models/FollowUp");
const User = require("../models/User");
const { nextCustomerCode } = require("../utils/customerCode");
const { SAMPLE, receiveCustomerCsv, importCustomers } = require("../utils/customerImport");
const { downlineIds } = require("../utils/reporting");

const STAGES = ["NEW", "ASSIGNED", "FOLLOW_UP", "CONVERTED", "LOST"];
const RESULTS = ["NO_ANSWER", "INTERESTED", "FOLLOW_UP", "NOT_INTERESTED"];

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (page, limit) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;
    return { pageNum, limitNum, skip };
};

const isFieldExecutive = (user) => {
    const role = String(user?.role || "").toUpperCase().replace(/[\s_-]+/g, "");
    return role === "FIELDEXECUTIVE";
};

// Admin always passes. A saved permission list is checked exactly.
// A field executive with no saved permissions still passes this module.
const allowCustomer = (...required) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (req.user.userType === "ADMIN") return next();
    const permissions = req.user.permissions || [];
    if (permissions.length > 0) {
        if (required.some((permission) => permissions.includes(permission))) return next();
        return res.status(403).json({
            success: false,
            message: "Forbidden — missing required permission",
            code: "PERMISSION_DENIED",
        });
    }
    if (isFieldExecutive(req.user)) return next();
    if (required.some((permission) => permissions.includes(permission))) {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: "Forbidden — missing required permission",
        code: "PERMISSION_DENIED",
    });
};

const withDesignation = { path: "designation", select: "name" };

const populateCreatedBy = {
    path: "createdBy",
    select: "name email userType role employeeId designation",
    populate: withDesignation,
};

const populateAssigned = {
    path: "assignedTo",
    select: "name employeeId role designation",
    populate: withDesignation,
};

const populateAssignedBy = {
    path: "assignedBy",
    select: "name employeeId role designation",
    populate: withDesignation,
};

const populateActor = {
    path: "by",
    select: "name employeeId role designation",
    populate: withDesignation,
};

const leadScope = async (user) => {
    if (!user || user.userType === "ADMIN") return {};
    const below = await downlineIds(user._id);
    if (below.length) {
        const ids = [user._id, ...below];
        return { $or: [{ createdBy: { $in: ids } }, { assignedTo: { $in: ids } }] };
    }
    if (isFieldExecutive(user)) {
        return { $or: [{ createdBy: user._id }, { assignedTo: user._id }] };
    }
    return {};
};

const canSeeCustomer = async (user, customer) => {
    const scope = await leadScope(user);
    if (!scope.$or) return true;
    const ids = new Set(scope.$or[0].createdBy.$in.map((id) => String(id)));
    return ids.has(String(customer.createdBy)) || ids.has(String(customer.assignedTo || ""));
};

const loadVisibleCustomer = async (user, id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return { error: { status: 400, message: "Invalid customer" } };
    const customer = await Customer.findById(id);
    if (!customer) return { error: { status: 404, message: "Customer not found" } };
    if (!(await canSeeCustomer(user, customer))) return { error: { status: 403, message: "You cannot open this lead" } };
    return { customer };
};

const cleanPurpose = (value, label) => {
    const purpose = String(value || "").trim();
    if (!purpose) return { error: `${label} is required` };
    if (purpose.length > 160) return { error: `${label} must be 160 characters or less` };
    return { purpose };
};

const text = (value) => (value && String(value).trim()) || undefined;

const buildAddress = (address) => ({
    line: address.line.trim(),
    villageCity: address.villageCity.trim(),
    tehsil: text(address.tehsil),
    postOffice: text(address.postOffice),
    district: text(address.district),
    state: address.state.trim(),
    pincode: String(address.pincode).trim(),
    landmark: text(address.landmark),
});

const createCustomer = async (req, res, next) => {
    try {
        const { retailerName, firmName, contactNo1, contactNo2, gstin, dlNo, address } = req.body;

        const existing = await Customer.findOne({ contactNo1: contactNo1.trim() });
        if (existing) {
            return res.status(409).json({ success: false, message: "A customer with this contact number already exists" });
        }

        const customer = await Customer.create({
            customerCode: await nextCustomerCode(),
            retailerName: retailerName.trim(),
            firmName: firmName.trim(),
            contactNo1: contactNo1.trim(),
            contactNo2: text(contactNo2),
            gstin: text(gstin)?.toUpperCase(),
            dlNo: text(dlNo),
            address: buildAddress(address),
            createdBy: req.user._id,
            leadStage: "NEW",
        });

        const populated = await Customer.findById(customer._id).populate(populateCreatedBy).lean();
        res.status(201).json({ success: true, message: "Customer created", data: populated });
    } catch (error) {
        next(error);
    }
};

const getCustomers = async (req, res, next) => {
    try {
        const { search, city, state, phone, stage, page = 1, limit = 10 } = req.query;
        const { pageNum, limitNum, skip } = parsePagination(page, limit);
        const contains = (value) => ({ $regex: escapeRegex(String(value).trim()), $options: "i" });

        const clauses = [];
        if (search && String(search).trim()) {
            const rx = contains(search);
            clauses.push({
                $or: [
                    { retailerName: rx },
                    { firmName: rx },
                    { contactNo1: rx },
                    { contactNo2: rx },
                    { gstin: rx },
                    { dlNo: rx },
                    { customerCode: rx },
                    { "address.line": rx },
                    { "address.villageCity": rx },
                    { "address.tehsil": rx },
                    { "address.postOffice": rx },
                    { "address.district": rx },
                    { "address.state": rx },
                    { "address.pincode": rx },
                    { "address.landmark": rx },
                ],
            });
        }
        if (city && String(city).trim()) {
            const rx = contains(city);
            clauses.push({ $or: [{ "address.villageCity": rx }, { "address.district": rx }] });
        }
        if (state && String(state).trim()) {
            clauses.push({ "address.state": contains(state) });
        }
        if (phone && String(phone).trim()) {
            const rx = contains(phone);
            clauses.push({ $or: [{ contactNo1: rx }, { contactNo2: rx }] });
        }
        if (stage && STAGES.includes(String(stage))) {
            clauses.push(stage === "NEW"
                ? { $or: [{ leadStage: "NEW" }, { leadStage: { $exists: false } }, { leadStage: null }] }
                : { leadStage: stage });
        }
        const scope = await leadScope(req.user);
        if (scope.$or) clauses.push(scope);

        const filter = clauses.length ? { $and: clauses } : {};

        const [total, customers] = await Promise.all([
            Customer.countDocuments(filter),
            Customer.find(filter)
                .populate(populateCreatedBy)
                .populate(populateAssigned)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
        ]);

        res.status(200).json({
            success: true,
            data: customers,
            pagination: {
                total,
                page: pageNum,
                pages: Math.ceil(total / limitNum) || 0,
                limit: limitNum,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getCustomerById = async (req, res, next) => {
    try {
        const loaded = await loadVisibleCustomer(req.user, req.params.id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const customer = await Customer.findById(loaded.customer._id).populate(populateCreatedBy).populate(populateAssigned).populate(populateAssignedBy).lean();
        let convertedBy = null;
        if (customer.convertedOrder) {
            const order = await Order.findById(customer.convertedOrder).select("orderCode placedAt createdBy").populate({ path: "createdBy", select: "name employeeId role designation", populate: withDesignation }).lean();
            if (order) convertedBy = { orderCode: order.orderCode || "", at: order.placedAt, by: order.createdBy || null };
        }
        res.status(200).json({ success: true, data: { ...customer, convertedBy } });
    } catch (error) {
        next(error);
    }
};

const updateCustomer = async (req, res, next) => {
    try {
        const loaded = await loadVisibleCustomer(req.user, req.params.id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { customer } = loaded;

        const { retailerName, firmName, contactNo1, contactNo2, gstin, dlNo, address } = req.body;

        if (contactNo1 && contactNo1.trim() !== customer.contactNo1) {
            const taken = await Customer.findOne({ contactNo1: contactNo1.trim(), _id: { $ne: customer._id } });
            if (taken) {
                return res.status(409).json({ success: false, message: "A customer with this contact number already exists" });
            }
            customer.contactNo1 = contactNo1.trim();
        }

        if (retailerName !== undefined) customer.retailerName = retailerName.trim();
        if (firmName !== undefined) customer.firmName = firmName.trim();
        if (contactNo2 !== undefined) customer.contactNo2 = text(contactNo2);
        if (gstin !== undefined) customer.gstin = text(gstin)?.toUpperCase();
        if (dlNo !== undefined) customer.dlNo = text(dlNo);

        if (address) {
            const current = customer.address || {};
            customer.address = {
                line: address.line !== undefined ? address.line.trim() : current.line,
                villageCity: address.villageCity !== undefined ? address.villageCity.trim() : current.villageCity,
                tehsil: address.tehsil !== undefined ? text(address.tehsil) : current.tehsil,
                postOffice: address.postOffice !== undefined ? text(address.postOffice) : current.postOffice,
                district: address.district !== undefined ? text(address.district) : current.district,
                state: address.state !== undefined ? address.state.trim() : current.state,
                pincode: address.pincode !== undefined ? String(address.pincode).trim() : current.pincode,
                landmark: address.landmark !== undefined ? text(address.landmark) : current.landmark,
            };
        }

        if (!customer.customerCode) customer.customerCode = await nextCustomerCode();

        await customer.save();
        const populated = await Customer.findById(customer._id).populate(populateCreatedBy).populate(populateAssigned).lean();
        res.status(200).json({ success: true, message: "Customer updated", data: populated });
    } catch (error) {
        next(error);
    }
};

const deleteCustomer = async (req, res, next) => {
    try {
        const loaded = await loadVisibleCustomer(req.user, req.params.id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        await FollowUp.deleteMany({ customer: loaded.customer._id });
        await loaded.customer.deleteOne();
        res.status(200).json({ success: true, message: "Customer deleted" });
    } catch (error) {
        next(error);
    }
};

const listAssignees = async (req, res, next) => {
    try {
        const search = String(req.query.search || "").trim();
        const filter = { status: "ACTIVE", userType: { $in: ["EMPLOYEE", "FIELD_EXECUTIVE"] } };
        if (req.user.userType !== "ADMIN") {
            const below = await downlineIds(req.user._id);
            filter._id = { $in: [req.user._id, ...below] };
        }
        if (search) {
            const rx = { $regex: escapeRegex(search), $options: "i" };
            filter.$or = [{ name: rx }, { employeeId: rx }];
        }
        const people = await User.find(filter).select("name employeeId role designation").populate(withDesignation).sort({ name: 1 }).limit(100).lean();
        res.status(200).json({ success: true, data: people });
    } catch (error) {
        next(error);
    }
};

const assignLead = async (req, res, next) => {
    try {
        const loaded = await loadVisibleCustomer(req.user, req.params.id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const userId = String(req.body.userId || "");
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Choose a person" });
        }
        if (req.user.userType !== "ADMIN") {
            const below = await downlineIds(req.user._id);
            const allowed = new Set([String(req.user._id), ...below.map((id) => String(id))]);
            if (!allowed.has(userId)) {
                return res.status(403).json({ success: false, message: "You can assign a lead only to yourself or someone who reports to you" });
            }
        }
        const assignee = await User.findOne({ _id: userId, status: "ACTIVE", userType: { $in: ["EMPLOYEE", "FIELD_EXECUTIVE"] } }).select("_id").lean();
        if (!assignee) return res.status(400).json({ success: false, message: "That person cannot take a lead" });

        const { customer } = loaded;
        customer.assignedTo = assignee._id;
        customer.assignedBy = req.user._id;
        customer.assignedAt = new Date();
        if (!customer.leadStage || customer.leadStage === "NEW" || customer.leadStage === "LOST") {
            if (customer.leadStage === "LOST") customer.lostReason = undefined;
            customer.leadStage = "ASSIGNED";
        }
        await customer.save();
        const populated = await Customer.findById(customer._id).populate(populateCreatedBy).populate(populateAssigned).populate(populateAssignedBy).lean();
        res.status(200).json({ success: true, message: "Lead assigned", data: populated });
    } catch (error) {
        next(error);
    }
};

const getFollowUps = async (req, res, next) => {
    try {
        const loaded = await loadVisibleCustomer(req.user, req.params.id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const { pageNum, limitNum, skip } = parsePagination(req.query.page, req.query.limit);
        const filter = { customer: loaded.customer._id };
        const [total, rows] = await Promise.all([
            FollowUp.countDocuments(filter),
            FollowUp.find(filter).sort({ at: -1, _id: -1 }).skip(skip).limit(limitNum).populate(populateActor).lean(),
        ]);
        res.status(200).json({
            success: true,
            data: rows,
            pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 0, limit: limitNum },
        });
    } catch (error) {
        next(error);
    }
};

const addFollowUp = async (req, res, next) => {
    try {
        const loaded = await loadVisibleCustomer(req.user, req.params.id);
        if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
        const purpose = cleanPurpose(req.body.purpose, "Purpose of this call");
        if (purpose.error) return res.status(400).json({ success: false, message: purpose.error });
        const result = String(req.body.result || "");
        if (!RESULTS.includes(result)) return res.status(400).json({ success: false, message: "Choose what happened on the call" });
        const note = String(req.body.note || "").trim();
        if (note.length > 500) return res.status(400).json({ success: false, message: "Call note must be 500 characters or less" });
        const at = req.body.at ? new Date(req.body.at) : new Date();
        if (Number.isNaN(at.getTime())) return res.status(400).json({ success: false, message: "Call time is not valid" });

        let nextAt = null;
        let nextPurpose = "";
        if (result !== "NOT_INTERESTED") {
            nextAt = req.body.nextFollowUpAt ? new Date(req.body.nextFollowUpAt) : null;
            if (!nextAt || Number.isNaN(nextAt.getTime())) {
                return res.status(400).json({ success: false, message: "Next follow-up date and time is required" });
            }
            const upcoming = cleanPurpose(req.body.nextPurpose, "Purpose of the next call");
            if (upcoming.error) return res.status(400).json({ success: false, message: upcoming.error });
            nextPurpose = upcoming.purpose;
        }

        const { customer } = loaded;
        const entry = await FollowUp.create({
            customer: customer._id,
            by: req.user._id,
            at,
            purpose: purpose.purpose,
            note,
            result,
            nextFollowUpAt: nextAt || undefined,
            nextPurpose: nextPurpose || undefined,
        });
        customer.lastFollowUpAt = at;
        if (result === "NOT_INTERESTED") {
            if (customer.leadStage !== "CONVERTED") {
                customer.leadStage = "LOST";
                customer.lostReason = note.slice(0, 200) || "Not interested";
            }
            customer.nextFollowUpAt = undefined;
            customer.nextPurpose = undefined;
        } else {
            customer.nextFollowUpAt = nextAt;
            customer.nextPurpose = nextPurpose;
            if (customer.leadStage !== "CONVERTED") customer.leadStage = "FOLLOW_UP";
        }
        await customer.save();
        const saved = await FollowUp.findById(entry._id).populate(populateActor).lean();
        const populated = await Customer.findById(customer._id).populate(populateCreatedBy).populate(populateAssigned).populate(populateAssignedBy).lean();
        res.status(201).json({ success: true, message: "Follow-up saved", data: { followUp: saved, customer: populated } });
    } catch (error) {
        next(error);
    }
};

const customerSample = (req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"customer-sample.csv\"");
    res.send(SAMPLE);
};

const importCustomerFile = async (req, res, next) => {
    try {
        if (!req.file?.buffer?.length) {
            return res.status(400).json({ success: false, message: "Choose a CSV file" });
        }
        const result = await importCustomers(req.file.buffer.toString("utf8"), req.user._id);
        const message = result.added
            ? `${result.added} customer${result.added === 1 ? "" : "s"} added${result.skipped ? `, ${result.skipped} skipped` : ""}`
            : "No customers were added";
        res.status(result.added ? 201 : 400).json({ success: Boolean(result.added), message, data: result });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        if (error.code === 11000) return res.status(409).json({ success: false, message: "A phone number in the file is already saved" });
        next(error);
    }
};

module.exports = {
    allowCustomer,
    receiveCustomerCsv,
    customerSample,
    importCustomerFile,
    createCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer,
    listAssignees,
    assignLead,
    getFollowUps,
    addFollowUp,
};
