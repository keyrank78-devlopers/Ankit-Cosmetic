const Category = require("../models/Category");
const generateId = require("../utils/generateId");

// @desc    Create a Category
// @route   POST /api/v1/admin/categories/create
// @access  Private/Admin
const createCategory = async (req, res, next) => {
    try {
        const { name } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Picture is required" });
        }

        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ success: false, message: "Category name already exists" });
        }

        const categoryId = await generateId("CAT");

        const category = await Category.create({
            categoryId,
            name,
            picture: req.file.path, // Cloudinary URL
        });

        res.status(201).json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all Categories
// @route   GET /api/v1/admin/categories/list
// @access  Private/Admin
const getCategories = async (req, res, next) => {
    try {
        const { search, status, page = 1, limit = 10 } = req.query;
        
        let filter = {};
        if (status) {
            if (!["ACTIVE", "INACTIVE"].includes(status)) {
                return res.status(400).json({ success: false, message: "Invalid status. Use ACTIVE or INACTIVE" });
            }
            filter.status = status;
        }
        if (search && String(search).trim()) {
            const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.name = { $regex: safe, $options: "i" };
        }

        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        const total = await Category.countDocuments(filter);
        const categories = await Category.find(filter)
            .skip(skip)
            .limit(limitNum)
            .sort({ createdAt: -1 });

        res.status(200).json({ 
            success: true, 
            data: categories,
            pagination: {
                total,
                page: pageNum,
                pages: Math.ceil(total / limitNum),
                limit: limitNum
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a Category
// @route   PATCH /api/v1/admin/categories/update/:id
// @access  Private/Admin
const updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        if (name && name !== category.name) {
            const existingName = await Category.findOne({ name });
            if (existingName) {
                return res.status(400).json({ success: false, message: "Category name already exists" });
            }
            category.name = name;
        }

        if (req.file) {
            category.picture = req.file.path;
        }

        await category.save();

        res.status(200).json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
};

// @desc    Change Category Status (Soft Delete)
// @route   PATCH /api/v1/admin/categories/status/:id
// @access  Private/Admin
const changeCategoryStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["ACTIVE", "INACTIVE"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const category = await Category.findByIdAndUpdate(id, { status }, { returnDocument: 'after', runValidators: true });
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.status(200).json({ success: true, data: category, message: `Category marked as ${status}` });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Category Details by ID
// @route   GET /api/v1/admin/categories/details/:id
// @access  Private/Admin
const getCategoryById = async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }
        res.status(200).json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    changeCategoryStatus
};
