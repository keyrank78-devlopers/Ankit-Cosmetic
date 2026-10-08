import { useState, useEffect } from "react";
import { 
  ShieldCheck, User, Building, Briefcase, CheckSquare, Square, Save, Search, CheckCircle2, Lock, Users, Package, Tags
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import employeeService from "../../services/employeeService";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import { useAuth } from "../../context/AuthContext";
import { Pager } from "../../components/ui/Pager";

const PERMISSION_GROUPS = [
  {
    category: "Customers",
    permissions: [
      { key: "VIEW_CUSTOMERS", label: "View Customers", desc: "List and open customer records" },
      { key: "CREATE_CUSTOMERS", label: "Add Customers", desc: "Create a customer (shop lead)" },
      { key: "EDIT_CUSTOMERS", label: "Edit Customers", desc: "Update customer contact and address" },
      { key: "DELETE_CUSTOMERS", label: "Delete Customers", desc: "Remove a customer record" },
      { key: "ASSIGN_LEADS", label: "Assign Leads", desc: "Give a customer lead to yourself or someone who reports to you" },
      { key: "FOLLOW_UP_LEADS", label: "Lead Follow-up", desc: "Log a call, the next follow-up time, and the purpose of the call" },
    ]
  },
  {
    category: "Employee & Staff Management",
    permissions: [
      { key: "VIEW_EMPLOYEES", label: "View Employees", desc: "Access employee directory and profiles" },
      { key: "CREATE_EMPLOYEES", label: "Create Employees", desc: "Add new employee records" },
      { key: "EDIT_EMPLOYEES", label: "Edit Employees", desc: "Modify employee details, roles and assignments" },
      { key: "DELETE_EMPLOYEES", label: "Delete Employees", desc: "Deactivate or permanently delete an employee" },
      { key: "MANAGE_EMPLOYEES", label: "Manage Employees", desc: "Full employee access, including create and edit" },
    ]
  },
  {
    category: "Vendor Management",
    permissions: [
      { key: "VIEW_VENDORS", label: "View Vendors", desc: "Access vendor directory and details" },
      { key: "CREATE_VENDORS", label: "Create Vendors", desc: "Register new vendors in system" },
      { key: "EDIT_VENDORS", label: "Edit Vendors", desc: "Update vendor information and credentials" },
      { key: "DELETE_VENDORS", label: "Deactivate Vendors", desc: "Change vendor status or remove" },
    ]
  },
  {
    category: "Departments & Designations",
    permissions: [
      { key: "VIEW_DEPARTMENTS", label: "View Departments", desc: "View company departments list" },
      { key: "CREATE_DEPARTMENTS", label: "Create Departments", desc: "Add new company departments" },
      { key: "EDIT_DEPARTMENTS", label: "Edit Departments", desc: "Update department name and details" },
      { key: "DELETE_DEPARTMENTS", label: "Delete Departments", desc: "Remove or deactivate departments" },
      { key: "MANAGE_DEPARTMENTS", label: "Manage Departments", desc: "Full department access" },
      { key: "VIEW_DESIGNATIONS", label: "View Designations", desc: "View designations list" },
      { key: "CREATE_DESIGNATIONS", label: "Create Designations", desc: "Add new job designations" },
      { key: "EDIT_DESIGNATIONS", label: "Edit Designations", desc: "Update designation titles" },
      { key: "DELETE_DESIGNATIONS", label: "Delete Designations", desc: "Remove or deactivate designations" },
      { key: "MANAGE_DESIGNATIONS", label: "Manage Designations", desc: "Full designation access" },
    ]
  },
  {
    category: "Products & Inventory",
    permissions: [
      { key: "VIEW_PRODUCTS", label: "View Products", desc: "Access product catalog and prices" },
      { key: "CREATE_PRODUCTS", label: "Create Products", desc: "Add new products with prices & images" },
      { key: "EDIT_PRODUCTS", label: "Edit Products", desc: "Update product MRP, sell price & details" },
      { key: "DELETE_PRODUCTS", label: "Delete Products", desc: "Remove product items" },
      { key: "VIEW_INVENTORY", label: "View Inventory", desc: "View warehouse inventory stock" },
      { key: "MANAGE_INVENTORY", label: "Manage Inventory", desc: "Add, update, or delete production and batch stock entries" },
    ]
  },
  {
    category: "Catalog (Categories & SubCategories)",
    permissions: [
      { key: "VIEW_CATEGORIES", label: "View Categories", desc: "Access product categories list" },
      { key: "MANAGE_CATEGORIES", label: "Manage Categories", desc: "Create, edit or delete categories" },
      { key: "VIEW_SUBCATEGORIES", label: "View SubCategories", desc: "Access sub-categories list" },
      { key: "MANAGE_SUBCATEGORIES", label: "Manage SubCategories", desc: "Create, edit or delete sub-categories" },
    ]
  },
  {
    category: "Orders & Revenue",
    permissions: [
      { key: "PLACE_ORDERS", label: "Place Order", desc: "Create an order, add products, show the payment QR, and save payment dates" },
      { key: "VIEW_ORDERS", label: "View Orders", desc: "Open the order list and order details. No status change, delete, or other actions" },
      { key: "UPDATE_ORDER_STATUS", label: "Update Order Status", desc: "Move an order from pending to confirm, ready, out for delivery, and delivered" },
      { key: "DELETE_ORDERS", label: "Delete Orders", desc: "Delete a placed order and release locked stock" },
      { key: "VIEW_REIMBURSEMENTS", label: "View Reimbursements", desc: "Open the damage, expiry, return, and other reimbursement report" },
      { key: "VIEW_DELIVERY", label: "View Delivery Report", desc: "See pending, confirm, preparing, out for delivery, and delivered" },
      { key: "VIEW_REVENUE", label: "View Revenue", desc: "See revenue, GST, and the COD or online filter" },
      { key: "VIEW_TARGETS", label: "View Sales Targets", desc: "See target, achieved, pending, and who placed which order" },
      { key: "MANAGE_TARGETS", label: "Set Sales Targets", desc: "Give, edit, or delete a monthly sales target" },
    ]
  },
  {
    category: "Schemes",
    permissions: [
      { key: "CREATE_GIFTS", label: "Create Gifts", desc: "Add gifts, update their details, and manage stock" },
      { key: "VIEW_GIFTS", label: "View Gifts", desc: "See the gift list" },
      { key: "VIEW_SCHEMES", label: "View Schemes", desc: "See the scheme list" },
      { key: "CREATE_SCHEMES", label: "Manage Schemes", desc: "Create, edit, and delete slab, open request, and first-order schemes" },
    ]
  },
  {
    category: "System",
    permissions: [
      { key: "MANAGE_PERMISSIONS", label: "Manage System Permissions", desc: "Grant or revoke role permissions" },
    ]
  }
];

export function Permissions() {
  const { user: currentUser } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [userTypeFilter, setUserTypeFilter] = useState("ALL"); // "ALL" | "EMPLOYEE" | "VENDOR"
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await employeeService.getEmployees({
        page,
        limit,
        userType: userTypeFilter,
        search: debouncedSearch || undefined,
      });
      const uList = res.data || [];
      setUsersList(uList);
      setPages(res.pagination?.pages || 1);
      setTotal(res.pagination?.total || 0);
      if (uList.length > 0 && !selectedUser) {
        setSelectedUser(uList[0]);
        setUserPermissions(uList[0].permissions || []);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [userTypeFilter, debouncedSearch, limit]);

  useEffect(() => {
    fetchUsers();
  }, [userTypeFilter, debouncedSearch, page, limit]);

  const handleSelectUser = (usr) => {
    setSelectedUser(usr);
    setUserPermissions(usr.permissions || []);
  };

  const togglePermission = (permKey) => {
    setUserPermissions(prev => 
      prev.includes(permKey) 
        ? prev.filter(k => k !== permKey)
        : [...prev, permKey]
    );
  };

  const handleSelectAllGroup = (group) => {
    const groupKeys = group.permissions.map(p => p.key);
    const allSelected = groupKeys.every(k => userPermissions.includes(k));

    if (allSelected) {
      setUserPermissions(prev => prev.filter(k => !groupKeys.includes(k)));
    } else {
      setUserPermissions(prev => Array.from(new Set([...prev, ...groupKeys])));
    }
  };

  const handleSelectAllSystem = () => {
    const allKeys = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));
    setUserPermissions(allKeys);
  };

  const handleClearAll = () => {
    setUserPermissions([]);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      await employeeService.updateUserPermissions(selectedUser._id, userPermissions);
      toast.success(`Permissions updated successfully for ${selectedUser.name}!`);
      
      setUsersList(prev => prev.map(u => u._id === selectedUser._id ? { ...u, permissions: userPermissions } : u));
      setSelectedUser(prev => prev ? { ...prev, permissions: userPermissions } : null);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  if (loading && usersList.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-slate-500 font-medium">Loading permissions management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="h-7 w-7 text-indigo-600" />
            Role & Module Permissions Control
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Assign custom module access & action privileges for Employees, Vendors, Departments & Products.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="text-slate-600"
          >
            Clear All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAllSystem}
            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
          >
            Select All
          </Button>
          <Button
            onClick={handleSavePermissions}
            disabled={saving || !selectedUser}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: User Selection (Employees & Vendors) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" /> Select User
            </h3>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
              {usersList.length} Total
            </span>
          </div>

          {/* User Type Filter Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setUserTypeFilter("ALL")}
              className={cn("py-1.5 rounded transition-all", userTypeFilter === "ALL" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              All Users
            </button>
            <button
              onClick={() => setUserTypeFilter("EMPLOYEE")}
              className={cn("py-1.5 rounded transition-all", userTypeFilter === "EMPLOYEE" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              Employees
            </button>
            <button
              onClick={() => setUserTypeFilter("VENDOR")}
              className={cn("py-1.5 rounded transition-all", userTypeFilter === "VENDOR" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              Vendors
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, email, ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* User List Scrollable Container */}
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {usersList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No matching users found.</p>
            ) : (
              usersList.map((usr) => {
                const isSelected = selectedUser?._id === usr._id;
                const permCount = usr.permissions?.length || 0;
                return (
                  <button
                    key={usr._id}
                    onClick={() => handleSelectUser(usr)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all space-y-1.5",
                      isSelected
                        ? "bg-indigo-50/80 border-indigo-300 shadow-sm ring-1 ring-indigo-500/20"
                        : "bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {usr.name}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                        usr.userType === "VENDOR" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                      )}>
                        {usr.employeeId || usr.vendorId || usr.userType}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 truncate">{usr.email}</p>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span className="truncate">
                        {usr.designation?.name || usr.role || usr.userType}
                      </span>
                      <span className="font-semibold text-indigo-600 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                        {permCount} Permissions
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <Pager page={page} pages={pages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
        </div>

        {/* Right Column: Detailed Permissions Matrix */}
        <div className="lg:col-span-2 space-y-6">
          {selectedUser ? (
            <div className="space-y-6">
              
              {/* Selected User Header Card */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-900 text-white p-5 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{selectedUser.name}</h2>
                    <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                      {selectedUser.employeeId || selectedUser.vendorId || selectedUser.userType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{selectedUser.email} • {selectedUser.phone}</p>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 space-y-0.5">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Designation / Role</span>
                    <span className="font-bold text-white">{selectedUser.designation?.name || selectedUser.role || selectedUser.userType}</span>
                  </div>
                  <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 space-y-0.5">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Active Permissions</span>
                    <span className="font-bold text-indigo-400">{userPermissions.length} Active</span>
                  </div>
                </div>
              </div>

              {/* Module Permission Groups - Scrollable Container */}
              <div className="space-y-6 max-h-[620px] overflow-y-auto pr-2 pb-4">
                {PERMISSION_GROUPS.map((group) => {
                  const groupKeys = group.permissions.map(p => p.key);
                  const isAllSelected = groupKeys.every(k => userPermissions.includes(k));

                  return (
                    <div key={group.category} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                      
                      {/* Group Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="font-bold text-slate-900 text-sm tracking-wide uppercase flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                          {group.category}
                        </h3>

                        <button
                          onClick={() => handleSelectAllGroup(group)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          {isAllSelected ? "Deselect Group" : "Select Entire Group"}
                        </button>
                      </div>

                      {/* Checkboxes Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {group.permissions.map((perm) => {
                          const isChecked = userPermissions.includes(perm.key);
                          return (
                            <label
                              key={perm.key}
                              onClick={() => togglePermission(perm.key)}
                              className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none",
                                isChecked
                                  ? "bg-indigo-50/60 border-indigo-300 text-indigo-900"
                                  : "bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100/60"
                              )}
                            >
                              <div className="mt-0.5 shrink-0">
                                {isChecked ? (
                                  <CheckSquare className="h-4 w-4 text-indigo-600" />
                                ) : (
                                  <Square className="h-4 w-4 text-slate-400" />
                                )}
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-xs font-bold block">{perm.label}</span>
                                <span className="text-[11px] text-slate-500 block leading-tight">{perm.desc}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 space-y-3">
              <Lock className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="text-base font-semibold">Select a user from the left panel to manage permissions.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
export default Permissions;
