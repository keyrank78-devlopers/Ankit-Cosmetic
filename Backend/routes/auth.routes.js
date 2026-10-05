const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { registerAdmin, login, refreshToken, logout, getMe, getMyProfile } = require("../controllers/auth.controller");
const { registerValidator, loginValidator } = require("../validators/auth.validator");
const validate = require("../middlewares/validate.middleware");
const { authenticate } = require("../middlewares/auth.middleware");

// ─── Auth-specific Rate Limiters ─────────────────────────────────────────────

// Login: max 10 attempts per 15 min per IP — brute-force protection
const loginLimiter = rateLimit({
    windowMs:        15 * 60 * 1000, // 15 minutes
    max:             10,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        success: false,
        message: "Too many login attempts from this IP. Please try again after 15 minutes.",
    },
});

// Register: max 5 registrations per hour per IP
const registerLimiter = rateLimit({
    windowMs:        60 * 60 * 1000, // 1 hour
    max:             5,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        success: false,
        message: "Too many registration attempts from this IP. Please try again after 1 hour.",
    },
});

// Refresh token: max 60 per 15 min per IP
const refreshLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             60,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        success: false,
        message: "Too many token refresh requests. Please try again shortly.",
    },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication API
 */

/**
 * @swagger
 * /api/v1/auth/admin/register:
 *   post:
 *     summary: Register an Admin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               admin_secret:
 *                 type: string
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *               address:
 *                 type: object
 *     responses:
 *       201:
 *         description: Admin created successfully
 */
router.post("/admin/register", registerLimiter, registerValidator, validate, registerAdmin);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login for Admin, Employee, Vendor
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", loginLimiter, loginValidator, validate, login);

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token refreshed
 */
router.post("/refresh-token", refreshLimiter, refreshToken);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post("/logout", authenticate, logout);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current logged in user profile
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Returns user profile
 */
router.get("/me", authenticate, getMe);
router.get("/profile", authenticate, getMyProfile);

module.exports = router;
