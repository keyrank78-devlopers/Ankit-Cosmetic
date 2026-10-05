const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "CRM API Documentation",
            version: "1.0.0",
            description: "API Documentation for CRM Backend (Auth, Admin, Employees, Departments, Designations, Leads)"
        },
        servers: [
            {
                url: process.env.VITE_API_URL || "https://crm-82ep.onrender.com",
                description: "Live Server"
            },
            {
                url: "http://localhost:5000",
                description: "Local Server"
            }
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT"
                }
            }
        },
        security: [
            {
                BearerAuth: []
            }
        ]
    },
    apis: ["./routes/*.js"], // Automatically find swagger docs in route files
};

const specs = swaggerJsDoc(options);

const setupSwagger = (app) => {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
    console.log("✅ Swagger docs available at http://localhost:5000/api-docs");
};

module.exports = setupSwagger;
