import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Dashboard } from "../pages/Dashboard";
import { Login } from "../pages/Login";
import { Departments } from "../pages/organization/Departments";
import { Designations } from "../pages/organization/Designations";
import { Categories } from "../pages/catalog/Categories";
import { CategoryForm } from "../pages/catalog/CategoryForm";
import { SubCategories } from "../pages/catalog/SubCategories";
import { SubCategoryForm } from "../pages/catalog/SubCategoryForm";
import { Products } from "../pages/business/Products";
import { ProductForm } from "../pages/business/ProductForm";
import { ProductView } from "../pages/business/ProductView";
import { Inventory } from "../pages/business/Inventory";
import { StockEntry } from "../pages/business/StockEntry";
import { StockHistory } from "../pages/business/StockHistory";
import { Customers } from "../pages/management/Customers";
import { Lead } from "../pages/management/Lead";
import { Employees } from "../pages/management/Employees";
import { EmployeeForm } from "../pages/management/EmployeeForm";
import { EmployeeProfile } from "../pages/management/EmployeeProfile";
import { Permissions } from "../pages/management/Permissions";
import { Gifts } from "../pages/schemes/Gifts";
import { GiftForm } from "../pages/schemes/GiftForm";
import { SchemeCreate } from "../pages/schemes/SchemeCreate";
import { Schemes } from "../pages/schemes/Schemes";
import { PlaceOrder } from "../pages/orders/PlaceOrder";
import { Orders } from "../pages/orders/Orders";
import { OrderDetails } from "../pages/orders/OrderDetails";
import { CustomerHistory } from "../pages/orders/CustomerHistory";
import { Revenue } from "../pages/orders/Revenue";
import { ReimbursementReport } from "../pages/orders/ReimbursementReport";
import { WarehouseReport } from "../pages/orders/WarehouseReport";
import { Targets } from "../pages/orders/Targets";
import { TargetReport } from "../pages/orders/TargetReport";
import { useAuth } from "../context/AuthContext";

const PrivateRoute = ({ children }) => {
  const { token, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  const isAuthenticated = token && token !== "undefined" && token !== "null" && token !== "";
  return isAuthenticated ? children : <Navigate to="/" replace />;
};

const AuthRoute = ({ children }) => {
  const { token, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  const isAuthenticated = token && token !== "undefined" && token !== "null" && token !== "";
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
};

const RoleRoute = ({ children, allowedRoles = [], permissionsNeeded = [] }) => {
  const { hasRole, hasPermission, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  const roleAllowed = allowedRoles.length === 0 || hasRole(allowedRoles);
  const permissionAllowed = permissionsNeeded.length === 0 || hasPermission(permissionsNeeded);

  if (!roleAllowed || !permissionAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<AuthRoute><Login /></AuthRoute>} />

      <Route path="/dashboard" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="profile" element={<EmployeeProfile />} />

        <Route path="departments" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["MANAGE_DEPARTMENTS", "VIEW_DEPARTMENTS", "CREATE_DEPARTMENTS", "EDIT_DEPARTMENTS", "DELETE_DEPARTMENTS"]}><Departments /></RoleRoute>} />
        <Route path="designations" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["MANAGE_DESIGNATIONS", "VIEW_DESIGNATIONS", "CREATE_DESIGNATIONS", "EDIT_DESIGNATIONS", "DELETE_DESIGNATIONS"]}><Designations /></RoleRoute>} />
        <Route path="permissions" element={<RoleRoute allowedRoles={["ADMIN"]} permissionsNeeded={["MANAGE_PERMISSIONS"]}><Permissions /></RoleRoute>} />

        <Route path="customers" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_CUSTOMERS"]}><Customers /></RoleRoute>} />
        <Route path="customers/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_CUSTOMERS"]}><Lead /></RoleRoute>} />
        <Route path="orders" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_ORDERS"]}><Orders /></RoleRoute>} />
        <Route path="orders/reimbursements" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_REIMBURSEMENTS"]}><ReimbursementReport /></RoleRoute>} />
        <Route path="orders/warehouse" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_DELIVERY"]}><WarehouseReport /></RoleRoute>} />
        <Route path="orders/new" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["PLACE_ORDERS"]}><PlaceOrder /></RoleRoute>} />
        <Route path="orders/customer/:customerId" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_ORDERS"]}><CustomerHistory /></RoleRoute>} />
        <Route path="orders/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_ORDERS"]}><OrderDetails /></RoleRoute>} />
        <Route path="revenue" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_REVENUE"]}><Revenue /></RoleRoute>} />
        <Route path="targets/report" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["VIEW_TARGETS", "MANAGE_TARGETS"]}><TargetReport /></RoleRoute>} />
        <Route path="targets" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"]} permissionsNeeded={["MANAGE_TARGETS"]}><Targets /></RoleRoute>} />
        <Route path="employees" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_EMPLOYEES", "MANAGE_EMPLOYEES", "CREATE_EMPLOYEES", "EDIT_EMPLOYEES", "DELETE_EMPLOYEES"]}><Employees /></RoleRoute>} />
        <Route path="employees/create" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["CREATE_EMPLOYEES", "MANAGE_EMPLOYEES", "EDIT_EMPLOYEES"]}><EmployeeForm /></RoleRoute>} />
        <Route path="employees/edit/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["EDIT_EMPLOYEES", "MANAGE_EMPLOYEES"]}><EmployeeForm /></RoleRoute>} />
        <Route path="employees/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_EMPLOYEES", "MANAGE_EMPLOYEES", "CREATE_EMPLOYEES", "EDIT_EMPLOYEES", "DELETE_EMPLOYEES"]}><EmployeeProfile /></RoleRoute>} />

        <Route path="categories" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_CATEGORIES"]}><Categories /></RoleRoute>} />
        <Route path="categories/create" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_CATEGORIES"]}><CategoryForm /></RoleRoute>} />
        <Route path="categories/edit/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_CATEGORIES"]}><CategoryForm /></RoleRoute>} />

        <Route path="subcategories" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_SUBCATEGORIES"]}><SubCategories /></RoleRoute>} />
        <Route path="subcategories/create" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_SUBCATEGORIES"]}><SubCategoryForm /></RoleRoute>} />
        <Route path="subcategories/edit/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_SUBCATEGORIES"]}><SubCategoryForm /></RoleRoute>} />

        <Route path="products" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "VENDOR"]} permissionsNeeded={["VIEW_PRODUCTS"]}><Products /></RoleRoute>} />
        <Route path="products/create" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "VENDOR"]} permissionsNeeded={["VIEW_PRODUCTS"]}><ProductForm /></RoleRoute>} />
        <Route path="products/edit/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "VENDOR"]} permissionsNeeded={["VIEW_PRODUCTS"]}><ProductForm /></RoleRoute>} />
        <Route path="products/view/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE", "VENDOR"]} permissionsNeeded={["VIEW_PRODUCTS"]}><ProductView /></RoleRoute>} />

        <Route path="inventory" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_INVENTORY"]}><Inventory /></RoleRoute>} />
        <Route path="inventory/entry" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["MANAGE_INVENTORY", "EDIT_PRODUCTS"]}><StockEntry /></RoleRoute>} />
        <Route path="inventory/history" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_INVENTORY"]}><StockHistory /></RoleRoute>} />

        <Route path="gifts" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_GIFTS", "CREATE_GIFTS"]}><Gifts /></RoleRoute>} />
        <Route path="gifts/create" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["CREATE_GIFTS"]}><GiftForm /></RoleRoute>} />
        <Route path="gifts/edit/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["CREATE_GIFTS"]}><GiftForm /></RoleRoute>} />
        <Route path="schemes" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["VIEW_SCHEMES", "CREATE_SCHEMES"]}><Schemes /></RoleRoute>} />
        <Route path="schemes/create" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["CREATE_SCHEMES"]}><SchemeCreate /></RoleRoute>} />
        <Route path="schemes/edit/:id" element={<RoleRoute allowedRoles={["ADMIN", "EMPLOYEE"]} permissionsNeeded={["CREATE_SCHEMES"]}><SchemeCreate /></RoleRoute>} />

        <Route path="*" element={<div className="p-4">404 Not Found</div>} />
      </Route>
    </Routes>
  );
};
