import {
  LayoutDashboard,
  Building2,
  Users,
  Package,
  Tags,
  Boxes,
  Warehouse,
  PackagePlus,
  History,
  ShoppingCart,
  ClipboardList,
  Truck,
  Undo2,
  IndianRupee,
  Target,
  Building,
  Briefcase,
  ShieldCheck,
  Gift,
  BadgePercent,
} from "lucide-react";

export const navigationData = [
  {
    group: "Dashboard",
    items: [
      { name: "Overview", href: "/dashboard", icon: LayoutDashboard, allowedRoles: ["ADMIN", "EMPLOYEE", "VENDOR", "FIELD_EXECUTIVE"] },
    ],
  },
  {
    group: "Organization",
    items: [
      { name: "Departments", href: "/dashboard/departments", icon: Building, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["MANAGE_DEPARTMENTS", "VIEW_DEPARTMENTS", "CREATE_DEPARTMENTS", "EDIT_DEPARTMENTS", "DELETE_DEPARTMENTS"] },
      { name: "Designations", href: "/dashboard/designations", icon: Briefcase, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["MANAGE_DESIGNATIONS", "VIEW_DESIGNATIONS", "CREATE_DESIGNATIONS", "EDIT_DESIGNATIONS", "DELETE_DESIGNATIONS"] },
      { name: "Permissions", href: "/dashboard/permissions", icon: ShieldCheck, allowedRoles: ["ADMIN"], permissionsNeeded: ["MANAGE_PERMISSIONS"] },
      { name: "Employees", href: "/dashboard/employees", icon: Building2, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["VIEW_EMPLOYEES", "MANAGE_EMPLOYEES", "CREATE_EMPLOYEES", "EDIT_EMPLOYEES", "DELETE_EMPLOYEES"] },
      { name: "Customers", href: "/dashboard/customers", icon: Users, allowedRoles: ["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"], permissionsNeeded: ["VIEW_CUSTOMERS"] },
      { name: "Place Order", href: "/dashboard/orders/new", icon: ShoppingCart, allowedRoles: ["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"], permissionsNeeded: ["PLACE_ORDERS"] },
      { name: "Orders", href: "/dashboard/orders", icon: ClipboardList, allowedRoles: ["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"], permissionsNeeded: ["VIEW_ORDERS"] },
      { name: "Reimbursements", href: "/dashboard/orders/reimbursements", icon: Undo2, allowedRoles: ["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"], permissionsNeeded: ["VIEW_REIMBURSEMENTS"] },
      { name: "Delivery report", href: "/dashboard/orders/warehouse", icon: Truck, allowedRoles: ["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"], permissionsNeeded: ["VIEW_DELIVERY"] },
      { name: "Revenue", href: "/dashboard/revenue", icon: IndianRupee, allowedRoles: ["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"], permissionsNeeded: ["VIEW_REVENUE"] },
      {
        name: "Sales targets",
        icon: Target,
        allowedRoles: ["ADMIN", "EMPLOYEE", "FIELD_EXECUTIVE"],
        children: [
          { name: "Set target", href: "/dashboard/targets", permissionsNeeded: ["MANAGE_TARGETS"] },
          { name: "Target report", href: "/dashboard/targets/report", permissionsNeeded: ["VIEW_TARGETS", "MANAGE_TARGETS"] },
        ],
      },
    ],
  },
  {
    group: "Catalog",
    items: [
      { name: "Categories", href: "/dashboard/categories", icon: Tags, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["VIEW_CATEGORIES"] },
      { name: "SubCategories", href: "/dashboard/subcategories", icon: Boxes, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["VIEW_SUBCATEGORIES"] },
    ],
  },
  {
    group: "Business",
    items: [
      { name: "Products", href: "/dashboard/products", icon: Package, allowedRoles: ["ADMIN", "EMPLOYEE", "VENDOR"], permissionsNeeded: ["VIEW_PRODUCTS"] },
      { name: "Inventory", href: "/dashboard/inventory", icon: Warehouse, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["VIEW_INVENTORY"] },
      { name: "Stock entry", href: "/dashboard/inventory/entry", icon: PackagePlus, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["MANAGE_INVENTORY", "EDIT_PRODUCTS"] },
      { name: "Stock history", href: "/dashboard/inventory/history", icon: History, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["VIEW_INVENTORY"] },
    ],
  },
  {
    group: "Schemes",
    items: [
      { name: "Gifts", href: "/dashboard/gifts", icon: Gift, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["VIEW_GIFTS", "CREATE_GIFTS"] },
      { name: "Schemes", href: "/dashboard/schemes", icon: BadgePercent, allowedRoles: ["ADMIN", "EMPLOYEE"], permissionsNeeded: ["VIEW_SCHEMES", "CREATE_SCHEMES"] },
    ],
  },
];
