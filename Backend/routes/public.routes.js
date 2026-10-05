const express = require("express");
const router = express.Router();

const { getCategories } = require("../controllers/category.controller");
const { getSubCategories } = require("../controllers/subcategory.controller");

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Public APIs (No Auth Required)
 */

// --- Category Routes ---
/**
 * @swagger
 * /api/v1/public/categories/list:
 *   get:
 *     summary: Get all Categories (Public)
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of Categories
 */
router.get("/categories/list", getCategories);

// --- SubCategory Routes ---
/**
 * @swagger
 * /api/v1/public/subcategories/list:
 *   get:
 *     summary: Get all SubCategories (Public)
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by Category ID or Name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of SubCategories
 */
router.get("/subcategories/list", getSubCategories);

// --- Product Routes ---
const { getProducts, getProductDetails } = require("../controllers/product.controller");

/**
 * @swagger
 * /api/v1/public/products/list:
 *   get:
 *     summary: Get all Products (Public)
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by product name or description
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by Category ID or Name
 *       - in: query
 *         name: subCategory
 *         schema:
 *           type: string
 *         description: Filter by SubCategory ID or Name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of Products
 */
router.get("/products/list", getProducts);

/**
 * @swagger
 * /api/v1/public/products/details/{identifier}:
 *   get:
 *     summary: Get Product Details (Public)
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: identifier
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or Slug
 *     responses:
 *       200:
 *         description: Product details
 */
router.get("/products/details/:identifier", getProductDetails);

module.exports = router;
