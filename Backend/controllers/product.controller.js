const Product = require("../models/Product");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const generateId = require("../utils/generateId");
const mongoose = require("mongoose");

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (page, limit) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
};

const parseOptionalPrice = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return undefined;
    return price;
};

const priceRangeError = ({ sellPrice, minSalesPrice, maxSalesPrice }) => {
    const sell = sellPrice === undefined || sellPrice === null || sellPrice === "" ? null : Number(sellPrice);
    if (minSalesPrice != null && maxSalesPrice != null && minSalesPrice > maxSalesPrice) {
        return "Min sales price cannot be greater than max sales price";
    }
    if (minSalesPrice != null && sell != null && minSalesPrice > sell) {
        return "Min sales price cannot be greater than selling price";
    }
    if (maxSalesPrice != null && sell != null && maxSalesPrice < sell) {
        return "Max sales price cannot be less than selling price";
    }
    return null;
};

const parseStock = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const stock = Number(value);
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) return undefined;
    return stock;
};

const parseLowStockAt = (value) => {
    if (value === undefined || value === null || value === "") return 10;
    const level = Number(value);
    if (!Number.isFinite(level) || level < 0 || !Number.isInteger(level) || level > 1000000) return undefined;
    return level;
};

// @desc    Create a Product
// @route   POST /api/v1/admin/products/create
// @access  Private/Admin
const createProduct = async (req, res, next) => {
    try {
        const {
            name,
            productCode,
            gstPercent,
            category,
            subCategory,
            mrp,
            sellPrice,
            minSalesPrice,
            maxSalesPrice,
            stock,
            lowStockAt,
            description,
            metaTitle,
            metaDescription,
            metaKeyword,
        } = req.body;

        let variants = [];
        if (req.body.variants) {
            try {
                // Since it's sent via form-data, variants might be a stringified JSON array
                variants = typeof req.body.variants === "string" ? JSON.parse(req.body.variants) : req.body.variants;
            } catch (err) {
                return res.status(400).json({ success: false, message: "Invalid variants format. Must be a JSON array." });
            }
        }

        if (!req.files || !req.files.mainImage || req.files.mainImage.length === 0) {
            return res.status(400).json({ success: false, message: "mainImage is required" });
        }

        const mainImage = req.files.mainImage[0].path; // Cloudinary URL
        const otherImages = req.files.otherImages ? req.files.otherImages.map(file => file.path) : [];

        // Validate Category
        let categoryId;
        if (mongoose.Types.ObjectId.isValid(category)) {
            categoryId = category;
        } else {
            const cat = await Category.findOne({ name: { $regex: new RegExp(`^${category}$`, "i") } });
            if (!cat) return res.status(404).json({ success: false, message: "Category not found" });
            categoryId = cat._id;
        }

        // Validate SubCategory and check if it belongs to Category
        let subCategoryId;
        if (mongoose.Types.ObjectId.isValid(subCategory)) {
            subCategoryId = subCategory;
        } else {
            const subCat = await SubCategory.findOne({ name: { $regex: new RegExp(`^${subCategory}$`, "i") }, category: categoryId });
            if (!subCat) return res.status(404).json({ success: false, message: "SubCategory not found or doesn't belong to the specified category" });
            subCategoryId = subCat._id;
        }

        const validSubCategory = await SubCategory.findOne({ _id: subCategoryId, category: categoryId });
        if (!validSubCategory) {
            return res.status(400).json({ success: false, message: "SubCategory does not belong to the selected Category" });
        }

        // Generate slug
        let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        let slug = baseSlug;
        let slugExists = await Product.findOne({ slug });
        let counter = 1;
        while (slugExists) {
            slug = `${baseSlug}-${counter}`;
            slugExists = await Product.findOne({ slug });
            counter++;
        }

        const parsedStock = parseStock(stock);
        if (parsedStock === undefined) {
            return res.status(400).json({ success: false, message: "Stock must be a whole number, 0 or more" });
        }
        const alertAt = parseLowStockAt(lowStockAt);
        if (alertAt === undefined) {
            return res.status(400).json({ success: false, message: "Low stock alert must be a whole number, 0 or more" });
        }

        const parsedMin = parseOptionalPrice(minSalesPrice);
        const parsedMax = parseOptionalPrice(maxSalesPrice);
        if (parsedMin === undefined || parsedMax === undefined) {
            return res.status(400).json({ success: false, message: "Min and max sales price must be 0 or more" });
        }
        const rangeError = priceRangeError({ sellPrice, minSalesPrice: parsedMin, maxSalesPrice: parsedMax });
        if (rangeError) {
            return res.status(400).json({ success: false, message: rangeError });
        }

        const code = productCode ? String(productCode).trim().toUpperCase() : "";
        if (!code) {
            return res.status(400).json({ success: false, message: "Product code is required" });
        }
        const gst = Number(gstPercent);
        if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
            return res.status(400).json({ success: false, message: "GST percent must be between 0 and 100" });
        }
        const codeTaken = await Product.findOne({ productCode: code });
        if (codeTaken) {
            return res.status(409).json({ success: false, message: "This product code already exists" });
        }

        const productId = await generateId("PRD");

        const product = await Product.create({
            productId,
            productCode: code,
            gstPercent: gst,
            name,
            slug,
            category: categoryId,
            subCategory: subCategoryId,
            mrp,
            sellPrice,
            ...(parsedMin != null && { minSalesPrice: parsedMin }),
            ...(parsedMax != null && { maxSalesPrice: parsedMax }),
            stock: parsedStock === null ? 0 : parsedStock,
            lowStockAt: alertAt,
            description,
            metaTitle,
            metaDescription,
            metaKeyword,
            mainImage,
            otherImages,
            variants
        });

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all Products
// @route   GET /api/v1/public/products/list
// @access  Public
const getProducts = async (req, res, next) => {
    try {
        const { search, category, subCategory, status, stockStatus, page = 1, limit = 10 } = req.query;

        let filter = {};
        if (status) {
            if (!["ACTIVE", "INACTIVE"].includes(status)) {
                return res.status(400).json({ success: false, message: "Invalid status. Use ACTIVE or INACTIVE" });
            }
            filter.status = status;
        }

        if (stockStatus) {
            const normalized = String(stockStatus).toUpperCase();
            if (normalized === "IN_STOCK") filter.stock = { $gt: 0 };
            else if (normalized === "OUT_OF_STOCK") filter.$and = [...(filter.$and || []), { $or: [{ stock: { $lte: 0 } }, { stock: { $exists: false } }] }];
            else return res.status(400).json({ success: false, message: "Invalid stockStatus. Use IN_STOCK or OUT_OF_STOCK" });
        }
        
        if (search && String(search).trim()) {
            const rx = { $regex: escapeRegex(String(search).trim()), $options: "i" };
            filter.$and = [...(filter.$and || []), { $or: [{ name: rx }, { productId: rx }, { productCode: rx }] }];
        }

        // Handle category filter (ID or Name)
        if (category) {
            if (mongoose.Types.ObjectId.isValid(category)) {
                filter.category = category;
            } else {
                const cat = await Category.findOne({ name: { $regex: new RegExp(`^${category}$`, "i") } });
                if (cat) filter.category = cat._id;
                else filter.category = null;
            }
        }

        // Handle subCategory filter (ID or Name)
        if (subCategory) {
            if (mongoose.Types.ObjectId.isValid(subCategory)) {
                filter.subCategory = subCategory;
            } else {
                const subCat = await SubCategory.findOne({ name: { $regex: new RegExp(`^${subCategory}$`, "i") } });
                if (subCat) filter.subCategory = subCat._id;
                else filter.subCategory = null;
            }
        }

        const { pageNum, limitNum, skip } = parsePagination(page, limit);

        const total = await Product.countDocuments(filter);
        
        const products = await Product.find(filter)
            .populate("category", "name")
            .populate("subCategory", "name")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            data: products,
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

// @desc    Get Product Details
// @route   GET /api/v1/public/products/details/:identifier (ID or Slug)
// @access  Public
const getProductDetails = async (req, res, next) => {
    try {
        const { identifier } = req.params;
        
        let filter = {};
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            filter = { _id: identifier };
        } else {
            filter = { slug: identifier };
        }

        const product = await Product.findOne(filter)
            .populate("category", "name")
            .populate("subCategory", "name");

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a Product
// @route   PATCH /api/v1/admin/products/update/:id
// @access  Private/Admin
const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            name,
            productCode,
            gstPercent,
            category,
            subCategory,
            mrp,
            sellPrice,
            minSalesPrice,
            maxSalesPrice,
            stock,
            lowStockAt,
            description,
            metaTitle,
            metaDescription,
            metaKeyword,
        } = req.body;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Handle category update
        if (category) {
            let categoryId;
            if (mongoose.Types.ObjectId.isValid(category)) {
                categoryId = category;
            } else {
                const cat = await Category.findOne({ name: { $regex: new RegExp(`^${category}$`, "i") } });
                if (!cat) return res.status(404).json({ success: false, message: "Category not found" });
                categoryId = cat._id;
            }
            product.category = categoryId;
        }

        // Handle subCategory update
        if (subCategory) {
            let subCategoryId;
            if (mongoose.Types.ObjectId.isValid(subCategory)) {
                subCategoryId = subCategory;
            } else {
                const subCat = await SubCategory.findOne({ name: { $regex: new RegExp(`^${subCategory}$`, "i") }, category: product.category });
                if (!subCat) return res.status(404).json({ success: false, message: "SubCategory not found or doesn't belong to the category" });
                subCategoryId = subCat._id;
            }
            
            const validSubCategory = await SubCategory.findOne({ _id: subCategoryId, category: product.category });
            if (!validSubCategory) {
                return res.status(400).json({ success: false, message: "SubCategory does not belong to the selected Category" });
            }
            product.subCategory = subCategoryId;
        }

        // Update basic fields
        if (name && name !== product.name) {
            product.name = name;
            // Generate new slug if name changes
            let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            let slug = baseSlug;
            let slugExists = await Product.findOne({ slug, _id: { $ne: id } });
            let counter = 1;
            while (slugExists) {
                slug = `${baseSlug}-${counter}`;
                slugExists = await Product.findOne({ slug, _id: { $ne: id } });
                counter++;
            }
            product.slug = slug;
        }

        if (productCode !== undefined) {
            const code = String(productCode).trim().toUpperCase();
            if (!code) {
                return res.status(400).json({ success: false, message: "Product code is required" });
            }
            if (code !== product.productCode) {
                const codeTaken = await Product.findOne({ productCode: code, _id: { $ne: id } });
                if (codeTaken) {
                    return res.status(409).json({ success: false, message: "This product code already exists" });
                }
                product.productCode = code;
            }
        }
        if (gstPercent !== undefined && gstPercent !== "") {
            const gst = Number(gstPercent);
            if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
                return res.status(400).json({ success: false, message: "GST percent must be between 0 and 100" });
            }
            product.gstPercent = gst;
        }
        if (mrp !== undefined && mrp !== "") product.mrp = mrp;
        if (sellPrice !== undefined && sellPrice !== "") product.sellPrice = sellPrice;

        let nextMin = product.minSalesPrice ?? null;
        let nextMax = product.maxSalesPrice ?? null;
        if (minSalesPrice !== undefined) {
            const parsedMin = parseOptionalPrice(minSalesPrice);
            if (parsedMin === undefined) {
                return res.status(400).json({ success: false, message: "Min sales price must be 0 or more" });
            }
            nextMin = parsedMin;
        }
        if (maxSalesPrice !== undefined) {
            const parsedMax = parseOptionalPrice(maxSalesPrice);
            if (parsedMax === undefined) {
                return res.status(400).json({ success: false, message: "Max sales price must be 0 or more" });
            }
            nextMax = parsedMax;
        }
        const rangeError = priceRangeError({
            sellPrice: product.sellPrice,
            minSalesPrice: nextMin,
            maxSalesPrice: nextMax,
        });
        if (rangeError) {
            return res.status(400).json({ success: false, message: rangeError });
        }
        if (minSalesPrice !== undefined) product.minSalesPrice = nextMin === null ? undefined : nextMin;
        if (maxSalesPrice !== undefined) product.maxSalesPrice = nextMax === null ? undefined : nextMax;
        if (stock !== undefined && stock !== "") {
            const parsedStock = parseStock(stock);
            if (parsedStock === undefined || parsedStock === null) {
                return res.status(400).json({ success: false, message: "Stock must be a whole number, 0 or more" });
            }
            product.stock = parsedStock;
        }
        if (lowStockAt !== undefined) {
            const alertAt = parseLowStockAt(lowStockAt);
            if (alertAt === undefined) {
                return res.status(400).json({ success: false, message: "Low stock alert must be a whole number, 0 or more" });
            }
            product.lowStockAt = alertAt;
        }
        if (description) product.description = description;
        if (metaTitle) product.metaTitle = metaTitle;
        if (metaDescription) product.metaDescription = metaDescription;
        if (metaKeyword) product.metaKeyword = metaKeyword;

        // Handle variants
        if (req.body.variants) {
            try {
                product.variants = typeof req.body.variants === "string" ? JSON.parse(req.body.variants) : req.body.variants;
            } catch (err) {
                return res.status(400).json({ success: false, message: "Invalid variants format. Must be a JSON array." });
            }
        }

        // Handle File uploads
        if (req.files) {
            if (req.files.mainImage && req.files.mainImage.length > 0) {
                product.mainImage = req.files.mainImage[0].path;
            }
            
            if (req.files.otherImages && req.files.otherImages.length > 0) {
                const newOtherImages = req.files.otherImages.map(file => file.path);
                // Optionally append or replace. Here we append. 
                // A complete solution might allow deleting specific images via a separate array of IDs/URLs to remove.
                product.otherImages = [...product.otherImages, ...newOtherImages].slice(0, 5); // Limit to 5
            }
        }

        await product.save();

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
};

// @desc    Change Product Status (Soft Delete)
// @route   PATCH /api/v1/admin/products/status/:id
// @access  Private/Admin
const updateProductStock = async (req, res) => {
    res.status(400).json({
        success: false,
        message: "Add or remove stock from Inventory with a batch entry. Direct stock edits are closed.",
    });
};

const changeProductStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["ACTIVE", "INACTIVE"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const product = await Product.findByIdAndUpdate(id, { status }, { returnDocument: 'after', runValidators: true });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.status(200).json({ success: true, data: product, message: `Product marked as ${status}` });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createProduct,
    getProducts,
    getProductDetails,
    updateProduct,
    updateProductStock,
    changeProductStatus
};
