const app = require("./app");

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});

// ─── Process-level Error Handlers ────────────────────────────────────────────
// Catches unhandled promise rejections (e.g. DB queries that threw without try/catch)
process.on("unhandledRejection", (reason, promise) => {
    console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION:`, reason);
    // Gracefully close server before exiting — lets in-flight requests finish
    server.close(() => {
        console.error("Server closed due to unhandled rejection. Exiting...");
        process.exit(1);
    });
});

// Catches synchronous exceptions that weren't caught anywhere
process.on("uncaughtException", (err) => {
    console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION:`, err.stack || err.message);
    server.close(() => {
        console.error("Server closed due to uncaught exception. Exiting...");
        process.exit(1);
    });
});

// Graceful shutdown on SIGTERM (e.g. Docker stop, Kubernetes pod termination)
process.on("SIGTERM", () => {
    console.log(`[${new Date().toISOString()}] SIGTERM received. Shutting down gracefully...`);
    server.close(() => {
        console.log("Server closed. Goodbye.");
        process.exit(0);
    });
});