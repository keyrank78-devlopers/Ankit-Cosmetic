const { body } = require("express-validator");

const phone = (path, label, required) => {
    const chain = body(path).trim();
    if (!required) {
        return chain.optional({ values: "falsy" }).isMobilePhone("any").withMessage(`Provide a valid ${label}`);
    }
    return chain.notEmpty().withMessage(`${label} is required`).isMobilePhone("any").withMessage(`Provide a valid ${label}`);
};

const createCustomerValidator = [
    body("retailerName").trim().notEmpty().withMessage("Retailer name is required").isLength({ min: 2 }).withMessage("Retailer name must be at least 2 characters"),
    body("firmName").trim().notEmpty().withMessage("Firm name is required"),
    phone("contactNo1", "Contact No 1", true),
    phone("contactNo2", "Contact No 2", false),
    body("gstin").optional({ values: "falsy" }).trim().isLength({ min: 15, max: 15 }).withMessage("GSTIN must be 15 characters"),
    body("dlNo").optional({ values: "falsy" }).trim(),
    body("address.line").trim().notEmpty().withMessage("Address is required"),
    body("address.villageCity").trim().notEmpty().withMessage("Village/City is required"),
    body("address.tehsil").optional({ values: "falsy" }).trim(),
    body("address.postOffice").optional({ values: "falsy" }).trim(),
    body("address.district").optional({ values: "falsy" }).trim(),
    body("address.state").trim().notEmpty().withMessage("State is required"),
    body("address.pincode").trim().notEmpty().withMessage("Pin code is required"),
    body("address.landmark").optional({ values: "falsy" }).trim(),
];

const updateCustomerValidator = [
    body("retailerName").optional().trim().notEmpty().withMessage("Retailer name cannot be empty").isLength({ min: 2 }).withMessage("Retailer name must be at least 2 characters"),
    body("firmName").optional().trim().notEmpty().withMessage("Firm name cannot be empty"),
    phone("contactNo1", "Contact No 1", false),
    phone("contactNo2", "Contact No 2", false),
    body("gstin").optional({ values: "falsy" }).trim().isLength({ min: 15, max: 15 }).withMessage("GSTIN must be 15 characters"),
    body("dlNo").optional({ values: "falsy" }).trim(),
    body("address.line").optional().trim().notEmpty().withMessage("Address cannot be empty"),
    body("address.villageCity").optional().trim().notEmpty().withMessage("Village/City cannot be empty"),
    body("address.tehsil").optional({ values: "falsy" }).trim(),
    body("address.postOffice").optional({ values: "falsy" }).trim(),
    body("address.district").optional({ values: "falsy" }).trim(),
    body("address.state").optional().trim().notEmpty().withMessage("State cannot be empty"),
    body("address.pincode").optional().trim().notEmpty().withMessage("Pin code cannot be empty"),
    body("address.landmark").optional({ values: "falsy" }).trim(),
];

module.exports = { createCustomerValidator, updateCustomerValidator };
