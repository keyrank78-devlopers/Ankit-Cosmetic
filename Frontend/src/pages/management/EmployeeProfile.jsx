import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Mail, MapPin, Phone, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const prettyRole = (role) => String(role || "Employee").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const PERMISSION_LABELS = {
  VIEW_CUSTOMERS: "View customers",
  CREATE_CUSTOMERS: "Add customers",
  EDIT_CUSTOMERS: "Edit customers",
  DELETE_CUSTOMERS: "Delete customers",
  ASSIGN_LEADS: "Assign leads",
  FOLLOW_UP_LEADS: "Lead follow-up",
  VIEW_EMPLOYEES: "View employees",
  CREATE_EMPLOYEES: "Create employees",
  EDIT_EMPLOYEES: "Edit employees",
  DELETE_EMPLOYEES: "Delete employees",
  MANAGE_EMPLOYEES: "Manage employees",
  VIEW_DEPARTMENTS: "View departments",
  CREATE_DEPARTMENTS: "Create departments",
  EDIT_DEPARTMENTS: "Edit departments",
  DELETE_DEPARTMENTS: "Delete departments",
  MANAGE_DEPARTMENTS: "Manage departments",
  VIEW_DESIGNATIONS: "View designations",
  CREATE_DESIGNATIONS: "Create designations",
  EDIT_DESIGNATIONS: "Edit designations",
  DELETE_DESIGNATIONS: "Delete designations",
  MANAGE_DESIGNATIONS: "Manage designations",
  VIEW_PRODUCTS: "View products",
  CREATE_PRODUCTS: "Create products",
  EDIT_PRODUCTS: "Edit products",
  DELETE_PRODUCTS: "Delete products",
  VIEW_INVENTORY: "View inventory",
  MANAGE_INVENTORY: "Manage inventory",
  VIEW_CATEGORIES: "View categories",
  MANAGE_CATEGORIES: "Manage categories",
  VIEW_SUBCATEGORIES: "View subcategories",
  MANAGE_SUBCATEGORIES: "Manage subcategories",
  PLACE_ORDERS: "Place orders",
  VIEW_ORDERS: "View orders",
  UPDATE_ORDER_STATUS: "Update order status",
  DELETE_ORDERS: "Delete orders",
  VIEW_REIMBURSEMENTS: "View reimbursements",
  VIEW_DELIVERY: "View delivery report",
  VIEW_TARGETS: "View sales targets",
  MANAGE_TARGETS: "Set sales targets",
  VIEW_REVENUE: "View revenue",
  CREATE_GIFTS: "Create gifts",
  VIEW_GIFTS: "View gifts",
  VIEW_SCHEMES: "View schemes",
  CREATE_SCHEMES: "Manage schemes",
  MANAGE_PERMISSIONS: "Manage permissions",
};

const addressLine = (address) => {
  if (!address) return "No address saved";
  return [address.street, address.locality, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(", ");
};

function Stat({ label, value, tone = "border-indigo-200 bg-white" }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function EmployeeProfile() {
  const { id } = useParams();
  const mine = !id;
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("MANAGE_EMPLOYEES") || hasPermission("EDIT_EMPLOYEES");
  const [employee, setEmployee] = useState(null);
  const [team, setTeam] = useState([]);
  const [orders, setOrders] = useState(null);
  const [customers, setCustomers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get(mine ? "/auth/profile" : `/admin/employees/details/${id}`);
        if (cancelled) return;
        setEmployee(res.data.data);
        setTeam(res.data.team || []);
        setOrders(res.data.orders || null);
        setCustomers(res.data.customers || 0);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, mine]);

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Loading profile...</div>;
  }
  if (!employee) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Employee not found.</div>;
  }

  const initials = employee.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(mine ? "/dashboard" : "/dashboard/employees")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{mine ? "My profile" : "Employee profile"}</h1>
            <p className="text-sm text-slate-500">Joined {employee.createdAt ? when.format(new Date(employee.createdAt)) : "—"}</p>
          </div>
        </div>
        {canEdit && employee.userType === "EMPLOYEE" && (
          <Button onClick={() => navigate(`/dashboard/employees/edit/${employee._id}`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-800 to-violet-600 px-6 py-8 text-white">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-fuchsia-400 text-2xl font-semibold text-white shadow-md">{initials || "E"}</div>
            <div>
              <h2 className="text-2xl font-semibold">{employee.name}</h2>
              <p className="text-sm text-indigo-100">{employee.employeeId || "No employee id"} · {prettyRole(employee.role)}</p>
              <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${employee.status === "ACTIVE" ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-50" : "border-rose-200 bg-rose-500/20 text-rose-50"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${employee.status === "ACTIVE" ? "bg-emerald-300" : "bg-rose-300"}`} />
                {employee.status || "ACTIVE"}
              </span>
            </div>
          </div>
        </div>
        <div className="grid gap-3 px-6 py-5 text-sm text-slate-600 sm:grid-cols-3">
          <p className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />{employee.email}</p>
          <p className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />{employee.phone}</p>
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />{addressLine(employee.address)}</p>
        </div>
      </div>

      <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Customers" value={customers} tone="border-indigo-100 bg-gradient-to-br from-white to-indigo-50" />
            <Stat label="Orders" value={orders?.placed || 0} tone="border-violet-100 bg-gradient-to-br from-white to-slate-50" />
            <Stat label="Order value" value={money.format(orders?.amount || 0)} tone="border-teal-100 bg-gradient-to-br from-white to-teal-50" />
            <Stat label="Delivered" value={orders?.delivered || 0} tone="border-emerald-200 bg-emerald-50" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Pending" value={orders?.pending || 0} tone="border-amber-200 bg-amber-50" />
            <Stat label="Confirm" value={orders?.confirm || 0} tone="border-indigo-200 bg-indigo-50" />
            <Stat label="Preparing" value={orders?.ready || 0} tone="border-sky-200 bg-sky-50" />
            <Stat label="Out for delivery" value={orders?.out || 0} tone="border-teal-200 bg-teal-50" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Work</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Department</dt><dd className="text-right text-slate-900">{employee.department?.name || "—"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Designation</dt><dd className="text-right text-slate-900">{employee.designation?.name || "—"}</dd></div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Reports to</dt>
                  <dd className="text-right text-slate-900">
                    {employee.reportingManager?._id ? (
                      <Link className="text-indigo-700 hover:underline" to={`/dashboard/employees/${employee.reportingManager._id}`}>{employee.reportingManager.name}</Link>
                    ) : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Team</h3>
              {team.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No one reports to this employee.</p>
              ) : (
                <ul className="mt-3 divide-y divide-indigo-50">
                  {team.map((person) => (
                    <li key={person._id} className="flex items-center justify-between py-2">
                      <div>
                        <Link className="text-sm font-medium text-indigo-700 hover:underline" to={`/dashboard/employees/${person._id}`}>{person.name}</Link>
                        <p className="text-xs text-slate-500">{person.employeeId} · {prettyRole(person.role)}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${person.status === "ACTIVE" ? "bg-indigo-50 text-indigo-800" : "bg-rose-50 text-rose-800"}`}>{person.status || "ACTIVE"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
            {(employee.documents || []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No documents uploaded.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {employee.documents.map((doc) => (
                  <li key={doc._id}>
                    <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-gradient-to-r from-white to-indigo-50 px-3 py-2 text-sm text-indigo-800 hover:border-indigo-200">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{doc.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Permissions</h3>
            {(employee.permissions || []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No extra permissions. Access follows the role.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {employee.permissions.map((key) => (
                  <span key={key} className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">{PERMISSION_LABELS[key] || key}</span>
                ))}
              </div>
            )}
          </section>
      </div>
    </div>
  );
}
