const express = require("express");
const router = express.Router();

// Controllers
const { createEmployee, getEmployees, getEmployeeById, updateEmployee, changeEmployeeStatus, deleteEmployee, createVendor, updateUserPermissions, parseEmployeePayload } = require("../controllers/admin.controller");
const {
    createDepartment,
    getDepartments,
    getDepartmentById,
    updateDepartment,
    changeDepartmentStatus
} = require("../controllers/department.controller");
const {
    createDesignation,
    getDesignations,
    getDesignationById,
    getDesignationsByDepartment,
    updateDesignation,
    changeDesignationStatus
} = require("../controllers/designation.controller");
// Middlewares & Validators
const { registerValidator } = require("../validators/auth.validator");
const validate = require("../middlewares/validate.middleware");
const { receiveEmployeeDocuments, receivePaymentQr } = require("../config/cloudinary");
const { authenticate, authorize, checkPermission } = require("../middlewares/auth.middleware");
const {
    allowCustomer,
    createCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer,
    listAssignees,
    assignLead,
    getFollowUps,
    addFollowUp,
    receiveCustomerCsv,
    customerSample,
    importCustomerFile,
} = require("../controllers/customer.controller");
const { createCustomerValidator, updateCustomerValidator } = require("../validators/customer.validator");
const { receiveGiftImage, createGift, getGifts, getGiftById, updateGift, updateGiftStock, deleteGift } = require("../controllers/gift.controller");
const { createGiftValidator, updateGiftValidator, updateGiftStockValidator } = require("../validators/gift.validator");
const { createScheme, getSchemes, getSchemeById, updateScheme, deleteScheme } = require("../controllers/scheme.controller");
const {
    catalog,
    startOrder,
    setLine,
    removeLine,
    schemeOptions,
    setScheme,
    setExpiry,
    placeOrder,
    cancelOrder,
    deleteOrder,
    getOrder,
    customerHistory,
    listOrders,
    revenue,
    getPaymentQr,
    setPaymentQr,
    addPaymentPromise,
    updatePaymentPromise,
    deletePaymentPromise,
    updateOrderStatus,
    getDashboard,
    getReimbursements,
    getExpiryStock,
    getWarehouseReport,
} = require("../controllers/order.controller");
const { getTargets, setTarget, getTargetOrders } = require("../controllers/target.controller");
const { downloadDirect, requestExport, myExport, listExports, reviewExport, downloadApproved } = require("../controllers/export.controller");

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management APIs
 */

// All admin routes should be protected for authenticated users with appropriate roles
router.use(authenticate, authorize("ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"));

// --- Employee Routes ---
/**
 * @swagger
 * /api/v1/admin/employees/create:
 *   post:
 *     summary: Create an Employee
 *     tags: [Admin - Employees]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
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
 *                 properties:
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   pincode:
 *                     type: string
 *                   locality:
 *                     type: string
 *                   street:
 *                     type: string
 *                   landmark:
 *                     type: string
 *               department:
 *                 type: string
 *                 description: ObjectId of the department
 *               designation:
 *                 type: string
 *                 description: ObjectId of the designation
 *     responses:
 *       201:
 *         description: Employee created successfully
 */
router.post("/employees/create", receiveEmployeeDocuments, parseEmployeePayload, registerValidator, validate, createEmployee);

/**
 * @swagger
 * /api/v1/admin/employees/list:
 *   get:
 *     summary: Get all Employees
 *     tags: [Admin - Employees]
 *     security:
 *       - BearerAuth: []
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
 *         description: Search by name, email, or phone
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by Department ID
 *       - in: query
 *         name: designation
 *         schema:
 *           type: string
 *         description: Filter by Designation ID
 *     responses:
 *       200:
 *         description: List of employees
 */
router.get("/employees/list", getEmployees);

/**
 * @swagger
 * /api/v1/admin/employees/details/{id}:
 *   get:
 *     summary: Get Employee Details by ID
 *     tags: [Admin - Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employee details
 */
router.get("/employees/details/:id", getEmployeeById);

/**
 * @swagger
 * /api/v1/admin/employees/update/{id}:
 *   patch:
 *     summary: Update an Employee
 *     tags: [Admin - Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: object
 *               role:
 *                 type: string
 *               department:
 *                 type: string
 *               designation:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Employee updated
 */
router.patch("/employees/update/:id", receiveEmployeeDocuments, parseEmployeePayload, updateEmployee);

/**
 * @swagger
 * /api/v1/admin/employees/status/{id}:
 *   patch:
 *     summary: Change Employee Status (Soft Delete)
 *     tags: [Admin - Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Status changed
 */
router.patch("/employees/status/:id", changeEmployeeStatus);

/**
 * @swagger
 * /api/v1/admin/employees/{id}:
 *   delete:
 *     summary: Delete an Employee
 *     tags: [Admin - Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employee deleted
 */
router.delete("/employees/:id", deleteEmployee);
router.put("/users/:id/permissions", updateUserPermissions);

// --- Vendor Routes ---
/**
 * @swagger
 * /api/v1/admin/vendors/create:
 *   post:
 *     summary: Create a Vendor
 *     tags: [Admin - Vendors]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
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
 *                 properties:
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   pincode:
 *                     type: string
 *                   locality:
 *                     type: string
 *                   street:
 *                     type: string
 *                   landmark:
 *                     type: string
 *     responses:
 *       201:
 *         description: Vendor created successfully
 */
router.post("/vendors/create", registerValidator, validate, createVendor);

// --- Department Routes ---
/**
 * @swagger
 * /api/v1/admin/departments/create:
 *   post:
 *     summary: Create a Department
 *     tags: [Admin - Departments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Department created
 */
router.post("/departments/create", createDepartment);

/**
 * @swagger
 * /api/v1/admin/departments/list:
 *   get:
 *     summary: Get all Departments
 *     tags: [Admin - Departments]
 *     security:
 *       - BearerAuth: []
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
 *         description: List of Departments
 */
router.get("/departments/list", getDepartments);

/**
 * @swagger
 * /api/v1/admin/departments/details/{id}:
 *   get:
 *     summary: Get Department by ID
 *     tags: [Admin - Departments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department details
 */
router.get("/departments/details/:id", getDepartmentById);

/**
 * @swagger
 * /api/v1/admin/departments/update/{id}:
 *   patch:
 *     summary: Update Department
 *     tags: [Admin - Departments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Department updated
 */
router.patch("/departments/update/:id", updateDepartment);

/**
 * @swagger
 * /api/v1/admin/departments/status/{id}:
 *   patch:
 *     summary: Change Department Status
 *     tags: [Admin - Departments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Status changed
 */
router.patch("/departments/status/:id", changeDepartmentStatus);

// --- Designation Routes ---
/**
 * @swagger
 * /api/v1/admin/designations/create:
 *   post:
 *     summary: Create a Designation
 *     tags: [Admin - Designations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               department:
 *                 type: string
 *                 description: ObjectId of the department
 *     responses:
 *       201:
 *         description: Designation created
 */
router.post("/designations/create", createDesignation);

/**
 * @swagger
 * /api/v1/admin/designations/list:
 *   get:
 *     summary: Get all Designations
 *     tags: [Admin - Designations]
 *     security:
 *       - BearerAuth: []
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
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by Department ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of Designations
 */
router.get("/designations/list", getDesignations);

/**
 * @swagger
 * /api/v1/admin/designations/details/{id}:
 *   get:
 *     summary: Get Designation by ID
 *     tags: [Admin - Designations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Designation details
 */
router.get("/designations/details/:id", getDesignationById);

/**
 * @swagger
 * /api/v1/admin/designations/list/department/{departmentId}:
 *   get:
 *     summary: Get Designations by Department ID
 *     tags: [Admin - Designations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of Designations
 */
router.get("/designations/list/department/:departmentId", getDesignationsByDepartment);

/**
 * @swagger
 * /api/v1/admin/designations/update/{id}:
 *   patch:
 *     summary: Update Designation
 *     tags: [Admin - Designations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Designation updated
 */
router.patch("/designations/update/:id", updateDesignation);

/**
 * @swagger
 * /api/v1/admin/designations/status/{id}:
 *   patch:
 *     summary: Change Designation Status
 *     tags: [Admin - Designations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Status changed
 */
router.patch("/designations/status/:id", changeDesignationStatus);

// --- Category Routes ---
const { createCategory, getCategoryById, updateCategory, changeCategoryStatus } = require("../controllers/category.controller");
const upload = require("../config/cloudinary");

/**
 * @swagger
 * /api/v1/admin/categories/details/{id}:
 *   get:
 *     summary: Get Category Details by ID
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category details
 */
router.get("/categories/details/:id", getCategoryById);

/**
 * @swagger
 * /api/v1/admin/categories/create:
 *   post:
 *     summary: Create a Category
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               picture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Category created
 */
router.post("/categories/create", upload.single("picture"), createCategory);

/**
 * @swagger
 * /api/v1/admin/categories/update/{id}:
 *   patch:
 *     summary: Update Category
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               picture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Category updated
 */
router.patch("/categories/update/:id", upload.single("picture"), updateCategory);

/**
 * @swagger
 * /api/v1/admin/categories/status/{id}:
 *   patch:
 *     summary: Change Category Status
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Status changed
 */
router.patch("/categories/status/:id", changeCategoryStatus);



// --- SubCategory Routes ---
const { createSubCategory, getSubCategoryById, updateSubCategory, changeSubCategoryStatus } = require("../controllers/subcategory.controller");

/**
 * @swagger
 * /api/v1/admin/subcategories/details/{id}:
 *   get:
 *     summary: Get SubCategory Details by ID
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SubCategory details
 */
router.get("/subcategories/details/:id", getSubCategoryById);

/**
 * @swagger
 * /api/v1/admin/subcategories/create:
 *   post:
 *     summary: Create a SubCategory
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *                 description: Category ID or Name
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: SubCategory created
 */
router.post("/subcategories/create", upload.single("image"), createSubCategory);

/**
 * @swagger
 * /api/v1/admin/subcategories/update/{id}:
 *   patch:
 *     summary: Update SubCategory
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *                 description: Category ID or Name
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: SubCategory updated
 */
router.patch("/subcategories/update/:id", upload.single("image"), updateSubCategory);

/**
 * @swagger
 * /api/v1/admin/subcategories/status/{id}:
 *   patch:
 *     summary: Change SubCategory Status
 *     tags: [Admin - Categories]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Status changed
 */
router.patch("/subcategories/status/:id", changeSubCategoryStatus);



// --- Product Routes ---
const { createProduct, updateProduct, updateProductStock, changeProductStatus } = require("../controllers/product.controller");

/**
 * @swagger
 * /api/v1/admin/products/create:
 *   post:
 *     summary: Create a Product
 *     tags: [Admin - Products]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *                 description: Category ID or Name
 *               subCategory:
 *                 type: string
 *                 description: SubCategory ID or Name
 *               mrp:
 *                 type: number
 *               sellPrice:
 *                 type: number
 *               minSalesPrice:
 *                 type: number
 *                 description: Optional minimum sales price
 *               maxSalesPrice:
 *                 type: number
 *                 description: Optional maximum sales price
 *               description:
 *                 type: string
 *               metaTitle:
 *                 type: string
 *               metaDescription:
 *                 type: string
 *               metaKeyword:
 *                 type: string
 *               variants:
 *                 type: string
 *                 description: JSON stringified array of objects e.g., [{"key":"Size","value":"XL"}]
 *               mainImage:
 *                 type: string
 *                 format: binary
 *                 description: Primary product image
 *               otherImages:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Additional product images (up to 5)
 *     responses:
 *       201:
 *         description: Product created successfully
 */
router.post(
    "/products/create",
    upload.fields([
        { name: "mainImage", maxCount: 1 },
        { name: "otherImages", maxCount: 5 }
    ]),
    createProduct
);

/**
 * @swagger
 * /api/v1/admin/products/update/{id}:
 *   patch:
 *     summary: Update Product
 *     tags: [Admin - Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               subCategory:
 *                 type: string
 *               mrp:
 *                 type: number
 *               sellPrice:
 *                 type: number
 *               minSalesPrice:
 *                 type: number
 *                 description: Optional minimum sales price
 *               maxSalesPrice:
 *                 type: number
 *                 description: Optional maximum sales price
 *               description:
 *                 type: string
 *               metaTitle:
 *                 type: string
 *               metaDescription:
 *                 type: string
 *               metaKeyword:
 *                 type: string
 *               variants:
 *                 type: string
 *               mainImage:
 *                 type: string
 *                 format: binary
 *               otherImages:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Product updated
 */
router.patch(
    "/products/update/:id",
    upload.fields([
        { name: "mainImage", maxCount: 1 },
        { name: "otherImages", maxCount: 5 }
    ]),
    updateProduct
);

/**
 * @swagger
 * /api/v1/admin/products/status/{id}:
 *   patch:
 *     summary: Change Product Status
 *     tags: [Admin - Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *     responses:
 *       200:
 *         description: Status changed
 */
router.patch("/products/status/:id", changeProductStatus);
router.patch("/products/stock/:id", updateProductStock);

const { getInventory, getInventoryHistory, postInventoryEntry, patchInventoryEntry, deleteInventoryEntry } = require("../controllers/inventory.controller");
router.get("/inventory/expiry", checkPermission("VIEW_INVENTORY", "MANAGE_INVENTORY", "EDIT_PRODUCTS"), getExpiryStock);
router.get("/inventory", checkPermission("VIEW_INVENTORY", "MANAGE_INVENTORY", "EDIT_PRODUCTS"), getInventory);
router.get("/inventory/history", checkPermission("VIEW_INVENTORY", "MANAGE_INVENTORY", "EDIT_PRODUCTS"), getInventoryHistory);
router.post("/inventory/entry", checkPermission("MANAGE_INVENTORY", "EDIT_PRODUCTS"), postInventoryEntry);
router.patch("/inventory/entry/:id", checkPermission("MANAGE_INVENTORY", "EDIT_PRODUCTS"), patchInventoryEntry);
router.delete("/inventory/entry/:id", checkPermission("MANAGE_INVENTORY", "EDIT_PRODUCTS"), deleteInventoryEntry);

// Customers (leads). Admin and Field Executive always pass.
// A sales manager (or any employee) can do an action only after admin grants that permission.
router.post("/customers", allowCustomer("CREATE_CUSTOMERS"), createCustomerValidator, validate, createCustomer);
router.get("/customers/import-sample", allowCustomer("CREATE_CUSTOMERS"), customerSample);
router.post("/customers/import", allowCustomer("CREATE_CUSTOMERS"), receiveCustomerCsv, importCustomerFile);
router.get("/customers", allowCustomer("VIEW_CUSTOMERS"), getCustomers);
router.get("/customers/assignees", allowCustomer("ASSIGN_LEADS"), listAssignees);
router.put("/customers/:id/assign", allowCustomer("ASSIGN_LEADS"), assignLead);
router.get("/customers/:id/follow-ups", allowCustomer("VIEW_CUSTOMERS"), getFollowUps);
router.post("/customers/:id/follow-ups", allowCustomer("FOLLOW_UP_LEADS"), addFollowUp);
router.get("/customers/:id", allowCustomer("VIEW_CUSTOMERS"), getCustomerById);
router.put("/customers/:id", allowCustomer("EDIT_CUSTOMERS"), updateCustomerValidator, validate, updateCustomer);
router.delete("/customers/:id", allowCustomer("DELETE_CUSTOMERS"), deleteCustomer);

router.post("/gifts", checkPermission("CREATE_GIFTS"), receiveGiftImage, createGiftValidator, validate, createGift);
router.get("/gifts", checkPermission("VIEW_GIFTS", "CREATE_GIFTS", "CREATE_SCHEMES"), getGifts);
router.get("/gifts/:id", checkPermission("VIEW_GIFTS", "CREATE_GIFTS", "CREATE_SCHEMES"), getGiftById);
router.patch("/gifts/:id/stock", checkPermission("CREATE_GIFTS"), updateGiftStockValidator, validate, updateGiftStock);
router.patch("/gifts/:id", checkPermission("CREATE_GIFTS"), receiveGiftImage, updateGiftValidator, validate, updateGift);
router.delete("/gifts/:id", checkPermission("CREATE_GIFTS"), deleteGift);
router.post("/schemes", checkPermission("CREATE_SCHEMES"), createScheme);
router.get("/schemes", checkPermission("VIEW_SCHEMES", "CREATE_SCHEMES"), getSchemes);
router.get("/schemes/:id", checkPermission("VIEW_SCHEMES", "CREATE_SCHEMES"), getSchemeById);
router.patch("/schemes/:id", checkPermission("CREATE_SCHEMES"), updateScheme);
router.delete("/schemes/:id", checkPermission("CREATE_SCHEMES"), deleteScheme);

router.get("/targets/orders", allowCustomer("VIEW_TARGETS", "MANAGE_TARGETS"), getTargetOrders);
router.get("/targets", allowCustomer("VIEW_TARGETS", "MANAGE_TARGETS"), getTargets);
router.put("/targets", allowCustomer("MANAGE_TARGETS"), setTarget);
router.get("/dashboard", allowCustomer("VIEW_CUSTOMERS", "VIEW_ORDERS", "PLACE_ORDERS", "VIEW_REVENUE", "VIEW_PRODUCTS", "EDIT_PRODUCTS", "VIEW_INVENTORY", "MANAGE_INVENTORY", "VIEW_TARGETS", "MANAGE_TARGETS", "VIEW_REIMBURSEMENTS"), getDashboard);
router.get("/orders/revenue", allowCustomer("VIEW_REVENUE"), revenue);
router.get("/orders/reimbursements", allowCustomer("VIEW_REIMBURSEMENTS"), getReimbursements);
router.get("/orders/warehouse", allowCustomer("VIEW_DELIVERY"), getWarehouseReport);
router.get("/orders", allowCustomer("VIEW_ORDERS"), listOrders);
router.get("/orders/catalog", allowCustomer("PLACE_ORDERS"), catalog);
router.get("/orders/customer/:customerId", allowCustomer("VIEW_ORDERS"), customerHistory);
router.get("/orders/:id", allowCustomer("VIEW_ORDERS"), getOrder);
router.post("/orders", allowCustomer("PLACE_ORDERS"), startOrder);
router.put("/orders/:id/lines", allowCustomer("PLACE_ORDERS"), setLine);
router.delete("/orders/:id/lines/:productId", allowCustomer("PLACE_ORDERS"), removeLine);
router.get("/orders/:id/schemes", allowCustomer("PLACE_ORDERS"), schemeOptions);
router.put("/orders/:id/scheme", allowCustomer("PLACE_ORDERS"), setScheme);
router.put("/orders/:id/expiry", allowCustomer("PLACE_ORDERS"), setExpiry);
router.post("/orders/:id/place", allowCustomer("PLACE_ORDERS"), placeOrder);
router.post("/orders/:id/cancel", allowCustomer("PLACE_ORDERS"), cancelOrder);
router.get("/settings/payment-qr", allowCustomer("PLACE_ORDERS", "VIEW_ORDERS"), getPaymentQr);
router.put("/settings/payment-qr", authorize("ADMIN"), receivePaymentQr, setPaymentQr);
router.post("/orders/:id/promises", allowCustomer("PLACE_ORDERS", "UPDATE_ORDER_STATUS"), addPaymentPromise);
router.patch("/orders/:id/promises/:promiseId", allowCustomer("PLACE_ORDERS", "UPDATE_ORDER_STATUS"), updatePaymentPromise);
router.delete("/orders/:id/promises/:promiseId", allowCustomer("PLACE_ORDERS", "UPDATE_ORDER_STATUS"), deletePaymentPromise);
router.patch("/orders/:id/status", allowCustomer("UPDATE_ORDER_STATUS"), updateOrderStatus);
router.delete("/orders/:id", allowCustomer("DELETE_ORDERS"), deleteOrder);

router.get("/exports/file", authorize("ADMIN"), downloadDirect);
router.post("/exports/request", requestExport);
router.get("/exports/mine", myExport);
router.get("/exports", authorize("ADMIN"), listExports);
router.patch("/exports/:id", authorize("ADMIN"), reviewExport);
router.get("/exports/:id/file", downloadApproved);

module.exports = router;
