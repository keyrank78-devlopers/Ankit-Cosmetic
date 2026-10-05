const SubCategory = require("../models/SubCategory");
const Category = require("../models/Category");
const mongoose = require("mongoose");

// @desc    Create a SubCategory
// @route   POST /api/v1/admin/subcategories/create
// @access  Private/Admin
const createSubCategory = async (req, res, next) => {
    try {
        const { name, category } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: "Image is required" });
        }

        // Validate Category ID or Name
        let categoryId;
        if (mongoose.Types.ObjectId.isValid(category)) {
            categoryId = category;
        } else {
            const cat = await Category.findOne({ name: { $regex: new RegExp(`^${category}$`, "i") } });
            if (!cat) return res.status(404).json({ success: false, message: "Category not found" });
            categoryId = cat._id;
        }

        const parentCategory = await Category.findById(categoryId);
        if (!parentCategory) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        const subcategory = await SubCategory.create({
            name,
            category: categoryId,
            image: req.file.path, // Cloudinary URL
        });

        res.status(201).json({ success: true, data: subcategory });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "SubCategory name already exists in this category" });
        }
        next(error);
    }
};

// @desc    Get all SubCategories
// @route   GET /api/v1/admin/subcategories/list
// @access  Private/Admin
const getSubCategories = async (req, res, next) => {
    try {
        const { search, status, category, page = 1, limit = 10 } = req.query;
        
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

        if (category) {
            if (mongoose.Types.ObjectId.isValid(category)) {
                filter.category = category;
            } else {
                const cat = await Category.findOne({ name: { $regex: new RegExp(`^${category}$`, "i") } });
                if (cat) filter.category = cat._id;
                else filter.category = null;
            }
        }

        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const skip = (pageNum - 1) * limitNum;

        const total = await SubCategory.countDocuments(filter);
        const subcategories = await SubCategory.find(filter)
            .populate("category", "name categoryId")
            .skip(skip)
            .limit(limitNum)
            .sort({ createdAt: -1 });

        res.status(200).json({ 
            success: true, 
            data: subcategories,
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

// @desc    Update a SubCategory
// @route   PATCH /api/v1/admin/subcategories/update/:id
// @access  Private/Admin
const updateSubCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, category } = req.body;

        const subcategory = await SubCategory.findById(id);
        if (!subcategory) {
            return res.status(404).json({ success: false, message: "SubCategory not found" });
        }

        if (category) {
            let categoryId;
            if (mongoose.Types.ObjectId.isValid(category)) {
                categoryId = category;
            } else {
                const cat = await Category.findOne({ name: { $regex: new RegExp(`^${category}$`, "i") } });
                if (!cat) return res.status(404).json({ success: false, message: "Category not found" });
                categoryId = cat._id;
            }
            subcategory.category = categoryId;
        }

        if (name) {
            subcategory.name = name;
        }

        if (req.file) {
            subcategory.image = req.file.path;
        }

        await subcategory.save();

        res.status(200).json({ success: true, data: subcategory });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "SubCategory name already exists in this category" });
        }
        next(error);
    }
};

// @desc    Change SubCategory Status (Soft Delete)
// @route   PATCH /api/v1/admin/subcategories/status/:id
// @access  Private/Admin
const changeSubCategoryStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["ACTIVE", "INACTIVE"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const subcategory = await SubCategory.findByIdAndUpdate(id, { status }, { returnDocument: 'after', runValidators: true });
        if (!subcategory) {
            return res.status(404).json({ success: false, message: "SubCategory not found" });
        }

        res.status(200).json({ success: true, data: subcategory, message: `SubCategory marked as ${status}` });
    } catch (error) {
        next(error);
    }
};

// @desc    Get SubCategory Details by ID
// @route   GET /api/v1/admin/subcategories/details/:id
// @access  Private/Admin
const getSubCategoryById = async (req, res, next) => {
    try {
        const subcategory = await SubCategory.findById(req.params.id).populate("category", "name");
        if (!subcategory) {
            return res.status(404).json({ success: false, message: "SubCategory not found" });
        }
        res.status(200).json({ success: true, data: subcategory });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createSubCategory,
    getSubCategories,
    getSubCategoryById,
    updateSubCategory,
    changeSubCategoryStatus
};
