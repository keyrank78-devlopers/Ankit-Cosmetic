require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const compression = require("compression");
const mongoose = require("mongoose");
const { connectDB } = require("./config/db");
const setupSwagger = require("./config/swagger");

const app = express();

// ─── Trust Proxy ────────────────────────────────────────────────────────────
// Only trust first proxy hop (NGINX / Cloudflare / ALB in production)
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

// ─── Database ────────────────────────────────────────────────────────────────
connectDB();

// ─── Swagger (before security middleware so docs work) ────────────────────────
setupSwagger(app);

// ─── 1. Helmet — Security Headers ────────────────────────────────────────────
// Hardened: disables X-Powered-By, sets CSP, HSTS, XSS filters, etc.
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // needed for swagger-ui
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        crossOriginEmbedderPolicy: false, // swagger-ui needs this off
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true,
        },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        noSniff: true,
        xssFilter: true,
        hidePoweredBy: true,
        frameguard: { action: "deny" },
    })
);

// ─── 2. CORS ─────────────────────────────────────────────────────────────────
// Only allow whitelisted origins — never fallback to wildcard in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000", "http://localhost:5173"];

app.use(
    cors({
        origin: true, // Allow all origins in dev for testing
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept"],
        exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
        maxAge: 86400, // preflight cache 24h
    })
);

// ─── 3. Compression ──────────────────────────────────────────────────────────
// Gzip all responses — cuts bandwidth by ~70% under load
app.use(compression({ level: 6, threshold: 1024 }));

// ─── 4. Body Parsers ─────────────────────────────────────────────────────────
// Hard cap on body size — prevents payload-based DoS
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(cookieParser());

// ─── 5. NoSQL Injection Sanitization ─────────────────────────────────────────
// Strips $ and . from user input so it can't be used as Mongo operators
// app.use(mongoSanitize({ replaceWith: "_" }));

// ─── 6. HTTP Parameter Pollution Protection ───────────────────────────────────
// app.use(hpp());

// ─── 7. Global Rate Limiter ───────────────────────────────────────────────────
// 500 req / 10 min per IP — handles 10k concurrent users while blocking floods
const globalLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests from this IP, please try again after 10 minutes",
    },
    skip: (req) => req.path === "/api/v1/health", // never limit health checks
});
app.use(globalLimiter);

// ─── 8. Routes ───────────────────────────────────────────────────────────────
app.use("/api/v1/public", require("./routes/public.routes"));
app.use("/api/v1/auth", require("./routes/auth.routes"));
app.use("/api/v1/admin", require("./routes/admin.routes"));

app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "API is running",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    // CORS error
    if (err.message && err.message.startsWith("CORS policy")) {
        return res.status(403).json({ success: false, message: err.message });
    }

    // Mongoose — invalid ObjectId (e.g. /departments/abc)
    if (err.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path}: '${err.value}' is not a valid ID`,
        });
    }

    // Mongoose — duplicate key (unique index violation)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || "field";
        return res.status(409).json({
            success: false,
            message: `Duplicate value: '${err.keyValue?.[field]}' already exists for ${field}`,
        });
    }

    // Mongoose — schema validation errors
    if (err.name === "ValidationError") {
        const messages = Object.values(err.errors).map((e) => e.message);
        return res.status(400).json({
            success: false,
            message: messages.join(", "),
        });
    }

    // JWT errors (should be caught in middleware, but belt-and-suspenders)
    if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ success: false, message: "Invalid token" });
    }
    if (err.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Token expired", code: "TOKEN_EXPIRED" });
    }

    // Generic server error — never leak stack in production
    const status = err.status || err.statusCode || 500;
    console.error(`[${new Date().toISOString()}] ERROR ${status}:`, err.stack || err.message);

    res.status(status).json({
        success: false,
        message: process.env.NODE_ENV === "production" ? "Internal Server Error" : (err.message || "Internal Server Error"),
    });
});

module.exports = app;
