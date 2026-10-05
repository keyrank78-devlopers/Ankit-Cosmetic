const { body } = require("express-validator");

const priceRule = (required) => {
    const chain = body("price").trim();
    const checked = required ? chain.notEmpty().withMessage("Price is required") : chain.optional({ values: "undefined" });
    return checked.custom((value) => {
        if (!/^\d+(\.\d{1,2})?$/.test(String(value))) {
            throw new Error("Price must be a number with up to 2 decimal places");
        }
        return true;
    });
};

const stockRule = (field, required) => {
    const chain = body(field).trim();
    const checked = required ? chain.notEmpty().withMessage("Stock is required") : chain.optional({ values: "undefined" });
    return checked.custom((value) => {
        if (!/^\d+$/.test(String(value))) {
            throw new Error("Stock must be a whole number, 0 or more");
        }
        return true;
    });
};

const createGiftValidator = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("Gift name is required")
        .isLength({ min: 2, max: 80 })
        .withMessage("Gift name must be 2 to 80 characters"),
    priceRule(true),
    body("description")
        .optional({ values: "undefined" })
        .trim()
        .isLength({ max: 200 })
        .withMessage("Description can be at most 200 characters"),
    stockRule("stock", true),
];

const updateGiftValidator = [
    body("name")
        .optional({ values: "undefined" })
        .trim()
        .notEmpty()
        .withMessage("Gift name is required")
        .isLength({ min: 2, max: 80 })
        .withMessage("Gift name must be 2 to 80 characters"),
    priceRule(false),
    body("description")
        .optional({ values: "undefined" })
        .trim()
        .isLength({ max: 200 })
        .withMessage("Description can be at most 200 characters"),
];

const updateGiftStockValidator = [
    stockRule("stock", true),
];

module.exports = { createGiftValidator, updateGiftValidator, updateGiftStockValidator };
