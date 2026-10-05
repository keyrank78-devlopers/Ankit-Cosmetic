import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Edit2, Trash2, UserPlus, Users, ClipboardList, PhoneCall } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import customerService from "../../services/customerService";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import { useAuth } from "../../context/AuthContext";
import { Pager } from "../../components/ui/Pager";

const STAGES = [
  ["", "All stages"],
  ["NEW", "New"],
  ["ASSIGNED", "Assigned"],
  ["FOLLOW_UP", "Follow-up"],
  ["CONVERTED", "Converted"],
  ["LOST", "Lost"],
];
const stageName = (value) => ({ NEW: "New", ASSIGNED: "Assigned", FOLLOW_UP: "Follow-up", CONVERTED: "Converted", LOST: "Lost" }[value] || "New");
const stageTone = {
  NEW: "bg-slate-100 text-slate-700",
  ASSIGNED: "bg-indigo-100 text-indigo-800",
  FOLLOW_UP: "bg-amber-100 text-amber-800",
  CONVERTED: "bg-emerald-100 text-emerald-800",
  LOST: "bg-rose-100 text-rose-800",
};
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const emptyForm = {
  retailerName: "",
  firmName: "",
  contactNo1: "",
  contactNo2: "",
  gstin: "",
  dlNo: "",
  address: {
    line: "",
    villageCity: "",
    tehsil: "",
    postOffice: "",
    district: "",
    state: "",
    pincode: "",
    landmark: "",
  },
};

export function Customers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState(() => (hasPermission("CREATE_CUSTOMERS") && searchParams.get("new") === "1" ? "new" : "existing"));
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({ city: "", state: "", phone: "", stage: "" });
  const [debouncedFilters, setDebouncedFilters] = useState({ city: "", state: "", phone: "", stage: "" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const canCreate = hasPermission("CREATE_CUSTOMERS");
  const canEdit = hasPermission("EDIT_CUSTOMERS");
  const canDelete = hasPermission("DELETE_CUSTOMERS");
  const canViewOrders = hasPermission("VIEW_ORDERS");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 400);
    return () => clearTimeout(timer);
  }, [filters]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await customerService.getCustomers({
        search: debouncedSearch,
        city: debouncedFilters.city,
        state: debouncedFilters.state,
        phone: debouncedFilters.phone,
        stage: debouncedFilters.stage,
        page,
        limit,
      });
      setCustomers(res.data || []);
      setTotalPages(res.pagination?.pages || 1);
      setTotal(res.pagination?.total || 0);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "existing") fetchCustomers();
  }, [debouncedSearch, debouncedFilters, page, limit, tab]);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setAddress = (name, value) => {
    setForm((prev) => ({ ...prev, address: { ...prev.address, [name]: value } }));
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setTab("new");
  };

  const openEdit = (customer) => {
    setEditingId(customer._id);
    setForm({
      retailerName: customer.retailerName || "",
      firmName: customer.firmName || "",
      contactNo1: customer.contactNo1 || "",
      contactNo2: customer.contactNo2 || "",
      gstin: customer.gstin || "",
      dlNo: customer.dlNo || "",
      address: {
        line: customer.address?.line || "",
        villageCity: customer.address?.villageCity || "",
        tehsil: customer.address?.tehsil || "",
        postOffice: customer.address?.postOffice || "",
        district: customer.address?.district || "",
        state: customer.address?.state || "",
        pincode: customer.address?.pincode || "",
        landmark: customer.address?.landmark || "",
      },
    });
    setTab("new");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      retailerName: form.retailerName.trim(),
      firmName: form.firmName.trim(),
      contactNo1: form.contactNo1.trim(),
      contactNo2: form.contactNo2.trim(),
      gstin: form.gstin.trim(),
      dlNo: form.dlNo.trim(),
      address: {
        line: form.address.line.trim(),
        villageCity: form.address.villageCity.trim(),
        tehsil: form.address.tehsil.trim(),
        postOffice: form.address.postOffice.trim(),
        district: form.address.district.trim(),
        state: form.address.state.trim(),
        pincode: form.address.pincode.trim(),
        landmark: form.address.landmark.trim(),
      },
    };

    try {
      setSaving(true);
      if (editingId) {
        await customerService.updateCustomer(editingId, payload);
        toast.success("Customer updated");
      } else {
        await customerService.createCustomer(payload);
        toast.success("Customer created");
      }
      setEditingId(null);
      setForm(emptyForm);
      setPage(1);
      setTab("existing");
    } catch (error) {
      const validation = error.response?.data?.errors?.[0]?.message;
      toast.error(validation || error.response?.data?.message || "Could not save customer");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer) => {
    if (!window.confirm(`Delete ${customer.retailerName}?`)) return;
    try {
      await customerService.deleteCustomer(customer._id);
      toast.success("Customer deleted");
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete customer");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">A customer is a lead. Field staff add it here, then call, follow up, or place an order.</p>
        </div>
        {canCreate && tab === "existing" && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Customer
          </Button>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("existing")}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
            tab === "existing" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          <Users className="h-4 w-4" />
          Existing
        </button>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
            if (editingId) setTab("new");
            else openNew();
          }}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
              tab === "new" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <UserPlus className="h-4 w-4" />
            {editingId ? "Edit" : "New"}
          </button>
        )}
      </div>

      {tab === "existing" ? (
        <>
          <div className="grid gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search retailer, firm, GSTIN..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Input
              placeholder="City"
              value={filters.city}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, city: e.target.value }));
                setPage(1);
              }}
            />
            <Input
              placeholder="State"
              value={filters.state}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, state: e.target.value }));
                setPage(1);
              }}
            />
            <Input
              placeholder="Phone number"
              value={filters.phone}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, phone: e.target.value }));
                setPage(1);
              }}
            />
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={filters.stage}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, stage: e.target.value }));
                setPage(1);
              }}
            >
              {STAGES.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
            </select>
            <p className="self-center text-sm text-slate-500 sm:col-span-2 lg:col-span-4">{total} customer{total === 1 ? "" : "s"}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Retailer</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">GSTIN / DL</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Next follow-up</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-slate-500">Loading customers...</td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-slate-500">No customers found.</td>
                    </tr>
                  ) : (
                    customers.map((customer) => (
                      <tr key={customer._id}>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-900">{customer.retailerName}</p>
                          <p className="text-xs text-slate-500">{customer.customerCode || customer.firmName}</p>
                          {customer.customerCode && <p className="text-xs text-slate-500">{customer.firmName}</p>}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <p>{customer.contactNo1}</p>
                          {customer.contactNo2 && (
                            <p className="text-xs text-slate-500">{customer.contactNo2}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <p>{customer.gstin || "—"}</p>
                          <p className="text-xs text-slate-500">{customer.dlNo || "No DL"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", stageTone[customer.leadStage] || stageTone.NEW)}>{stageName(customer.leadStage)}</span>
                          <p className="mt-1 text-xs text-slate-500">{customer.assignedTo ? [customer.assignedTo.name, customer.assignedTo.designation?.name].filter(Boolean).join(" · ") : "Not assigned"}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <p>{customer.nextFollowUpAt ? when.format(new Date(customer.nextFollowUpAt)) : "—"}</p>
                          <p className="text-xs text-slate-500">{customer.nextPurpose || ""}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/customers/${customer._id}`)} title="Lead">
                              <PhoneCall className="h-4 w-4 text-indigo-600" />
                            </Button>
                            {canViewOrders && (
                              <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/orders/customer/${customer._id}`)} title="Order history">
                                <ClipboardList className="h-4 w-4 text-indigo-600" />
                              </Button>
                            )}
                            {canEdit && (
                              <Button variant="ghost" size="icon" onClick={() => openEdit(customer)} title="Edit">
                                <Edit2 className="h-4 w-4 text-slate-500" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(customer)} title="Delete">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pager page={page} pages={totalPages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-medium text-slate-900">{editingId ? "Edit customer" : "New customer"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Field label="Retailer Name *">
                <Input value={form.retailerName} onChange={(e) => setField("retailerName", e.target.value)} required disabled={saving} />
              </Field>
              <Field label="Firm Name *">
                <Input value={form.firmName} onChange={(e) => setField("firmName", e.target.value)} required disabled={saving} />
              </Field>
              <Field label="Contact No 1 *">
                <Input value={form.contactNo1} onChange={(e) => setField("contactNo1", e.target.value)} required disabled={saving} />
              </Field>
              <Field label="Contact No 2">
                <Input value={form.contactNo2} onChange={(e) => setField("contactNo2", e.target.value)} disabled={saving} />
              </Field>
              <Field label="GSTIN">
                <Input value={form.gstin} onChange={(e) => setField("gstin", e.target.value.toUpperCase())} maxLength={15} disabled={saving} />
              </Field>
              <Field label="DL No">
                <Input value={form.dlNo} onChange={(e) => setField("dlNo", e.target.value)} disabled={saving} />
              </Field>
            </div>
          </div>

          <div className="p-6 space-y-4 bg-slate-50">
            <h3 className="text-lg font-medium text-slate-900">Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Field label="Address *">
                <Input value={form.address.line} onChange={(e) => setAddress("line", e.target.value)} required disabled={saving} />
              </Field>
              <Field label="Village/City *">
                <Input value={form.address.villageCity} onChange={(e) => setAddress("villageCity", e.target.value)} required disabled={saving} />
              </Field>
              <Field label="Tehsil">
                <Input value={form.address.tehsil} onChange={(e) => setAddress("tehsil", e.target.value)} disabled={saving} />
              </Field>
              <Field label="Post Office">
                <Input value={form.address.postOffice} onChange={(e) => setAddress("postOffice", e.target.value)} disabled={saving} />
              </Field>
              <Field label="District">
                <Input value={form.address.district} onChange={(e) => setAddress("district", e.target.value)} disabled={saving} />
              </Field>
              <Field label="State *">
                <Input value={form.address.state} onChange={(e) => setAddress("state", e.target.value)} required disabled={saving} />
              </Field>
              <Field label="Pin Code *">
                <Input value={form.address.pincode} onChange={(e) => setAddress("pincode", e.target.value)} required disabled={saving} />
              </Field>
              <Field label="Nearby/Landmark">
                <Input value={form.address.landmark} onChange={(e) => setAddress("landmark", e.target.value)} disabled={saving} />
              </Field>
            </div>
          </div>

          <div className="p-6 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setTab("existing")} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving} disabled={saving}>
              {editingId ? "Update customer" : "Save customer"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
