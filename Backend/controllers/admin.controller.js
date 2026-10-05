const mongoose = require("mongoose");
const User = require("../models/User");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const generateId = require("../utils/generateId");
const { downlineIds } = require("../utils/reporting");
const { loadUserProfile } = require("../utils/userProfile");

// ─── Helper ───────────────────────────────────────────────────────────────────
// Escapes special regex characters to prevent ReDoS attacks
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Safe pagination parser — guards against NaN, negative, and absurdly large values
const parsePagination = (page, limit) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100); // cap at 100
    const skip = (pageNum - 1) * limitNum;
    return { pageNum, limitNum, skip };
};

const parseEmployeePayload = (req, res, next) => {
    if (typeof req.body.address === "string") {
        try {
            req.body.address = JSON.parse(req.body.address);
        } catch {
            return res.status(400).json({ success: false, message: "Address is not valid" });
        }
    }
    if (typeof req.body.documentNames === "string") {
        try {
            req.body.documentNames = JSON.parse(req.body.documentNames);
        } catch {
            return res.status(400).json({ success: false, message: "Document names are not valid" });
        }
    }
    if (typeof req.body.removeDocumentIds === "string") {
        try {
            req.body.removeDocumentIds = JSON.parse(req.body.removeDocumentIds);
        } catch {
            return res.status(400).json({ success: false, message: "Document removal list is not valid" });
        }
    }
    next();
};

const saveEmployeeDocuments = async (files, names) => {
    const uploads = files || [];
    const labels = Array.isArray(names) ? names.map((name) => String(name || "").trim()) : [];
    if (!uploads.length && !labels.length) return [];
    if (uploads.length !== labels.length || labels.some((name) => !name || name.length > 80)) {
        const error = new Error("Each document needs a name and a PDF or image");
        error.status = 400;
        throw error;
    }
    const saved = [];
    try {
        for (let index = 0; index < uploads.length; index += 1) {
            const file = uploads[index];
            const result = await uploadEmployeeFile(file);
            saved.push({
                name: labels[index],
                url: result.secure_url,
                publicId: result.public_id,
                resourceType: result.resource_type,
                format: result.format || (file.mimetype === "application/pdf" ? "pdf" : ""),
            });
        }
        return saved;
    } catch (error) {
        await Promise.all(saved.map((doc) => destroyCloudinaryFile(doc.publicId, doc.resourceType)));
        throw error;
    }
};

const assertReportingManager = async (managerId, employeeId) => {
    if (managerId === undefined || managerId === null || String(managerId).trim() === "") return null;
    if (!mongoose.Types.ObjectId.isValid(managerId)) {
        const error = new Error("Invalid reporting manager");
        error.status = 400;
        throw error;
    }
    if (employeeId && String(managerId) === String(employeeId)) {
        const error = new Error("An employee cannot report to themselves");
        error.status = 400;
        throw error;
    }
    const manager = await User.findOne({ _id: managerId, userType: "EMPLOYEE", status: "ACTIVE" }).select("_id");
    if (!manager) {
        const error = new Error("Reporting manager must be an active employee");
        error.status = 400;
        throw error;
    }
    if (employeeId) {
        const below = await downlineIds(employeeId);
        if (below.some((id) => String(id) === String(managerId))) {
            const error = new Error("That person is already below this employee");
            error.status = 400;
            throw error;
        }
    }
    return manager._id;
};
// @route   POST /api/v1/admin/employees/create
// @access  Private/Admin
const createEmployee = async (req, res, next) => {
    try {
        const { name, email, phone, password, address, role, department, designation, permissions } = req.body;

        // Validate department ObjectId format before DB call
        if (!mongoose.Types.ObjectId.isValid(department)) {
            return res.status(400).json({ success: false, message: "Invalid department ID format" });
        }
        if (!mongoose.Types.ObjectId.isValid(designation)) {
            return res.status(400).json({ success: false, message: "Invalid designation ID format" });
        }

        // 1. Validate Department exists and is ACTIVE
        const dept = await Department.findById(department);
        if (!dept) {
            return res.status(404).json({ success: false, message: "Department not found" });
        }
        if (dept.status !== "ACTIVE") {
            return res.status(400).json({ success: false, message: "Cannot assign an INACTIVE department" });
        }

        // 2. Validate Designation exists and is ACTIVE
        const desig = await Designation.findById(designation);
        if (!desig) {
            return res.status(404).json({ success: false, message: "Designation not found" });
        }
        if (desig.status !== "ACTIVE") {
            return res.status(400).json({ success: false, message: "Cannot assign an INACTIVE designation" });
        }

        // 3. Validate Designation belongs to Department
        if (desig.department.toString() !== dept._id.toString()) {
            return res.status(400).json({
                success: false,
                message: "Validation Error: The selected Designation does not belong to the selected Department",
            });
        }

        // 4. Validate unique email and phone
        const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "User with email or phone already exists" });
        }

        let reportingManager = null;
        const managerValue = req.body.reportingManager;
        if (managerValue !== undefined && managerValue !== null && String(managerValue).trim() !== "") {
            try {
                reportingManager = await assertReportingManager(managerValue, null);
            } catch (error) {
                return res.status(error.status || 400).json({ success: false, message: error.message });
            }
        }

        const employeeId = await generateId("EMP");
        let documents = [];
        try {
            documents = await saveEmployeeDocuments(req.files, req.body.documentNames);
        } catch (error) {
            return res.status(error.status || 500).json({ success: false, message: error.message || "Could not save documents" });
        }

        try {
            const newEmployee = await User.create({
                name, email, phone, password, address,
                userType: "EMPLOYEE",
                employeeId,
                role,
                department: dept._id,
                designation: desig._id,
                ...(reportingManager ? { reportingManager } : {}),
                permissions,
                documents,
            });

            res.status(201).json({
                success: true,
                message: "Employee created successfully",
                data: {
                    id: newEmployee._id,
                    employeeId: newEmployee.employeeId,
                    name: newEmployee.name,
                    email: newEmployee.email,
                    documents: newEmployee.documents,
                },
            });
        } catch (error) {
            await Promise.all(documents.map((doc) => destroyCloudinaryFile(doc.publicId, doc.resourceType)));
            throw error;
        }
    } catch (error) {
        next(error);
    }
};

// @desc    List Employees
// @route   GET /api/v1/admin/employees/list
// @access  Private/Admin
const getEmployees = async (req, res, next) => {
    try {
        if (req.query.picker === "1") {
            const people = await User.find({ userType: "EMPLOYEE", status: "ACTIVE" })
                .select("name employeeId designation role")
                .populate("designation", "name")
                .sort({ name: 1 })
                .limit(500)
                .lean();
            return res.status(200).json({ success: true, data: people });
        }

        const { department, designation, search, manager, page = 1, limit = 10 } = req.query;
        const { pageNum, limitNum, skip } = parsePagination(page, limit);

        let filter = {};
        if (req.query.userType && req.query.userType !== "ALL") {
            filter.userType = req.query.userType;
        } else {
            filter.userType = { $in: ["EMPLOYEE", "VENDOR"] };
        }

        // Department filter — accept ObjectId or name string
        if (department) {
            if (mongoose.Types.ObjectId.isValid(department)) {
                filter.department = department;
            } else {
                const dept = await Department.findOne({
                    name: { $regex: new RegExp(`^${escapeRegex(department)}$`, "i") },
                });
                filter.department = dept ? dept._id : null;
            }
        }

        // Designation filter — accept ObjectId or name string
        if (designation) {
            if (mongoose.Types.ObjectId.isValid(designation)) {
                filter.designation = designation;
            } else {
                const desig = await Designation.findOne({
                    name: { $regex: new RegExp(`^${escapeRegex(designation)}$`, "i") },
                });
                filter.designation = desig ? desig._id : null;
            }
        }

        // Search by name, email, or phone — regex escaped to prevent ReDoS
        if (search) {
            const safeSearch = escapeRegex(search);
            filter.$or = [
                { name: { $regex: safeSearch, $options: "i" } },
                { email: { $regex: safeSearch, $options: "i" } },
                { phone: { $regex: safeSearch, $options: "i" } },
                { employeeId: { $regex: safeSearch, $options: "i" } },
                { vendorId: { $regex: safeSearch, $options: "i" } },
            ];
        }
        if (manager) {
            if (!mongoose.Types.ObjectId.isValid(manager)) {
                return res.status(400).json({ success: false, message: "Invalid manager" });
            }
            filter.reportingManager = manager;
        }

        const [total, employees] = await Promise.all([
            User.countDocuments(filter),
            User.find(filter)
                .select("-password -refreshToken")
                .populate("department", "name")
                .populate("designation", "name")
                .populate("reportingManager", "name employeeId")
                .skip(skip)
                .limit(limitNum)
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        res.status(200).json({
            success: true,
            data: employees,
            pagination: {
                total,
                page: pageNum,
                pages: Math.ceil(total / limitNum),
                limit: limitNum,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Employee Details by ID
// @route   GET /api/v1/admin/employees/details/:id
// @access  Private/Admin
const getEmployeeById = async (req, res, next) => {
    try {
        const profile = await loadUserProfile(req.params.id, { employeesOnly: true });
        if (!profile) {
            return res.status(404).json({ success: false, message: "Employee not found" });
        }
        res.status(200).json({ success: true, ...profile });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

// @desc    Update Employee
// @route   PATCH /api/v1/admin/employees/update/:id
// @access  Private/Admin
const updateEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, phone, password, address, role, department, designation, permissions, removeDocumentIds } = req.body;

        const employee = await User.findById(id);
        if (!employee || employee.userType !== "EMPLOYEE") {
            return res.status(404).json({ success: false, message: "Employee not found" });
        }

        if (department && !mongoose.Types.ObjectId.isValid(department)) {
            return res.status(400).json({ success: false, message: "Invalid department ID" });
        }
        if (designation && !mongoose.Types.ObjectId.isValid(designation)) {
            return res.status(400).json({ success: false, message: "Invalid designation ID" });
        }

        if (name) employee.name = name;
        if (phone) employee.phone = phone;
        if (typeof password === "string" && password.trim()) {
            if (password.trim().length < 6) {
                return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
            }
            employee.password = password;
        }
        if (address) employee.address = address;
        if (role) employee.role = role;
        if (department) employee.department = department;
        if (designation) employee.designation = designation;
        if (Object.prototype.hasOwnProperty.call(req.body, "reportingManager")) {
            const managerValue = req.body.reportingManager;
            if (managerValue === undefined || managerValue === null || String(managerValue).trim() === "") {
                employee.reportingManager = null;
            } else {
                try {
                    employee.reportingManager = await assertReportingManager(managerValue, employee._id);
                } catch (error) {
                    return res.status(error.status || 400).json({ success: false, message: error.message });
                }
            }
        }
        if (permissions) employee.permissions = permissions;

        const removeIds = Array.isArray(removeDocumentIds) ? removeDocumentIds.map(String) : [];
        const removed = (employee.documents || []).filter((doc) => removeIds.includes(String(doc._id)));
        if (removed.length) {
            employee.documents = employee.documents.filter((doc) => !removeIds.includes(String(doc._id)));
        }
        let added = [];
        try {
            added = await saveEmployeeDocuments(req.files, req.body.documentNames);
        } catch (error) {
            return res.status(error.status || 500).json({ success: false, message: error.message || "Could not save documents" });
        }
        if ((employee.documents?.length || 0) + added.length > 8) {
            await Promise.all(added.map((doc) => destroyCloudinaryFile(doc.publicId, doc.resourceType)));
            return res.status(400).json({ success: false, message: "An employee can have up to 8 documents" });
        }
        employee.documents = [...(employee.documents || []), ...added];

        try {
            await employee.save();
        } catch (error) {
            await Promise.all(added.map((doc) => destroyCloudinaryFile(doc.publicId, doc.resourceType)));
            throw error;
        }
        await Promise.all(removed.map((doc) => destroyCloudinaryFile(doc.publicId, doc.resourceType)));

        const saved = employee.toObject();
        delete saved.password;
        delete saved.refreshToken;

        res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: saved
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Change Employee Status (Soft Delete)
// @route   PATCH /api/v1/admin/employees/status/:id
// @access  Private/Admin
const changeEmployeeStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["ACTIVE", "INACTIVE"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const employee = await User.findById(id);
        if (!employee || employee.userType !== "EMPLOYEE") {
            return res.status(404).json({ success: false, message: "Employee not found" });
        }

        employee.status = status;
        await employee.save();

        res.status(200).json({
            success: true,
            message: "Employee status updated successfully"
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete an Employee
// @route   DELETE /api/v1/admin/employees/:id
// @access  Private/Admin
const deleteEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid employee ID format" });
        }
        if (String(req.user._id) === String(id)) {
            return res.status(400).json({ success: false, message: "You cannot delete your own account" });
        }

        const employee = await User.findOne({ _id: id, userType: "EMPLOYEE" });
        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found" });
        }

        const documents = employee.documents || [];
        await User.updateMany({ reportingManager: employee._id }, { $unset: { reportingManager: "" } });
        await employee.deleteOne();
        await Promise.all(documents.map((doc) => destroyCloudinaryFile(doc.publicId, doc.resourceType)));

        res.status(200).json({ success: true, message: "Employee deleted successfully" });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a Vendor
// @route   POST /api/v1/admin/vendors/create
// @access  Private/Admin
const createVendor = async (req, res, next) => {
    try {
        const { name, email, phone, password, address } = req.body;

        const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "User with email or phone already exists" });
        }

        const vendorId = await generateId("VEN");

        const newVendor = await User.create({
            name, email, phone, password, address,
            userType: "VENDOR",
            vendorId,
        });

        res.status(201).json({
            success: true,
            message: "Vendor created successfully",
            data: {
                id: newVendor._id,
                vendorId: newVendor.vendorId,
                name: newVendor.name,
                email: newVendor.email,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update User Permissions
// @route   PUT /api/v1/admin/users/:id/permissions
// @access  Private/Admin
const updateUserPermissions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, message: "Permissions must be an array of string keys" });
        }

        const userDoc = await User.findById(id);
        if (!userDoc) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        userDoc.permissions = permissions;
        await userDoc.save();

        res.status(200).json({
            success: true,
            message: "User permissions updated successfully",
            data: {
                id: userDoc._id,
                name: userDoc.name,
                permissions: userDoc.permissions
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { createEmployee, getEmployees, getEmployeeById, updateEmployee, changeEmployeeStatus, deleteEmployee, createVendor, updateUserPermissions, parseEmployeePayload };

