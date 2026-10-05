const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authenticate = async (req, res, next) => {
    try {
        let token;

        // Extract token from Authorization header (Bearer <token>)
        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authorized — no token provided",
            });
        }

        // ── Verify token with granular error codes ────────────────────────────
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({
                    success: false,
                    message: "Access token expired — please refresh",
                    code: "TOKEN_EXPIRED",
                });
            }
            if (err.name === "JsonWebTokenError") {
                return res.status(401).json({
                    success: false,
                    message: "Invalid token — please login again",
                    code: "TOKEN_INVALID",
                });
            }
            if (err.name === "NotBeforeError") {
                return res.status(401).json({
                    success: false,
                    message: "Token not yet active",
                    code: "TOKEN_NOT_ACTIVE",
                });
            }
            // Unknown JWT error
            return res.status(401).json({
                success: false,
                message: "Token verification failed",
            });
        }

        // ── Fetch user and attach to request ─────────────────────────────────
        const user = await User.findById(decoded.id).select("-password -refreshToken").populate("designation");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User belonging to this token no longer exists",
                code: "USER_NOT_FOUND",
            });
        }

        if (user.status === "BLOCKED") {
            return res.status(403).json({
                success: false,
                message: "Your account has been blocked. Please contact support.",
                code: "ACCOUNT_BLOCKED",
            });
        }

        if (user.status === "INACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact support.",
                code: "ACCOUNT_INACTIVE",
            });
        }

        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }

        // Allow if userType OR role matches any of the required roles
        if (!roles.includes(req.user.userType) && !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden — you do not have permission to access this resource",
                code: "FORBIDDEN",
            });
        }

        next();
    };
};

const checkPermission = (...requiredPermissions) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }

        // Admin always has full bypass access
        if (req.user.userType === "ADMIN") {
            return next();
        }

        const userPermissions = req.user.permissions || [];
        const hasPerm = requiredPermissions.some(perm => userPermissions.includes(perm));

        if (!hasPerm) {
            return res.status(403).json({
                success: false,
                message: "Forbidden — missing required permission",
                code: "PERMISSION_DENIED"
            });
        }

        next();
    };
};

module.exports = { authenticate, authorize, checkPermission };

