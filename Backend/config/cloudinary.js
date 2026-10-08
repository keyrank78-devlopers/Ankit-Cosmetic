const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "crm/categories",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
    },
});

const upload = multer({ storage: storage });

const giftStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "crm/gifts",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
    },
});

const giftImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const uploadGiftImage = multer({
    storage: giftStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!giftImageTypes.has(file.mimetype)) {
            const error = new Error("Image must be a jpg, png, webp, or avif file");
            error.status = 400;
            return cb(error);
        }
        cb(null, true);
    },
});

const qrStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "crm/payment-qr",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
    },
});

const uploadPaymentQrFile = multer({
    storage: qrStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!giftImageTypes.has(file.mimetype)) {
            const error = new Error("QR image must be a jpg, png, webp, or avif file");
            error.status = 400;
            return cb(error);
        }
        cb(null, true);
    },
});

const receivePaymentQr = (req, res, next) => {
    uploadPaymentQrFile.single("image")(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "QR image must be 5 MB or smaller"
            : error.message || "Could not read the QR image";
        return res.status(400).json({ success: false, message });
    });
};

const employeeDocTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"]);

const uploadEmployeeDocuments = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 8 },
    fileFilter: (req, file, cb) => {
        if (!employeeDocTypes.has(file.mimetype)) {
            const error = new Error("Document must be a PDF, jpg, png, webp, or avif file");
            error.status = 400;
            return cb(error);
        }
        cb(null, true);
    },
});

const receiveEmployeeDocuments = (req, res, next) => {
    uploadEmployeeDocuments.array("documents", 8)(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Each document must be 8 MB or smaller"
            : error.message || "Could not read the document";
        return res.status(400).json({ success: false, message });
    });
};

const uploadEmployeeFile = (file) => new Promise((resolve, reject) => {
    const resourceType = file.mimetype === "application/pdf" ? "raw" : "image";
    const stream = cloudinary.uploader.upload_stream(
        { folder: "crm/employee-documents", resource_type: resourceType },
        (error, result) => (error ? reject(error) : resolve(result))
    );
    Readable.from(file.buffer).pipe(stream);
});

const destroyCloudinaryFile = (publicId, resourceType) => {
    if (!publicId) return Promise.resolve();
    return cloudinary.uploader.destroy(publicId, { resource_type: resourceType || "image" }).catch(() => {});
};

module.exports = upload;
module.exports.uploadGiftImage = uploadGiftImage;
module.exports.receivePaymentQr = receivePaymentQr;
module.exports.receiveEmployeeDocuments = receiveEmployeeDocuments;
module.exports.uploadEmployeeFile = uploadEmployeeFile;
module.exports.destroyCloudinaryFile = destroyCloudinaryFile;
