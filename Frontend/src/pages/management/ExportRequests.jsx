import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import api from "../../services/api";

const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const labels = { EMPLOYEES: "Employees", ORDERS: "Orders", CUSTOMERS: "Customers" };

const filterText = (filters) => {
  const parts = Object.entries(filters || {}).filter(([, value]) => String(value || "").trim());
  return parts.length ? parts.map(([key, value]) => `${key}: ${value}`).join(" · ") : "No filter";
};

export function ExportRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/exports");
      setRows(res.data.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load export requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const review = async (id, action) => {
    setBusyId(id);
    try {
      const res = await api.patch(`/admin/exports/${id}`, { action });
      toast.success(res.data.message || "Updated");
      setRows((current) => current.map((row) => (row._id === id ? res.data.data : row)));
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update the request");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Export requests</h1>
        <p className="mt-1 text-sm text-slate-500">Approve a request and that person can download the Excel once, with the filters they had.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">List</th>
              <th className="px-4 py-3">Filters</th>
              <th className="px-4 py-3">Asked</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>No download requests yet.</td></tr>
            ) : rows.map((row) => (
              <tr key={row._id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.requestedBy?.name || "Employee"}</p>
                  <p className="text-xs text-slate-500">{row.requestedBy?.employeeId || ""}</p>
                </td>
                <td className="px-4 py-3">{labels[row.type] || row.type}</td>
                <td className="max-w-xs px-4 py-3 text-slate-600">{filterText(row.filters)}</td>
                <td className="px-4 py-3 text-slate-600">{row.createdAt ? when.format(new Date(row.createdAt)) : ""}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">
                  {row.status === "PENDING" && (
                    <div className="flex gap-2">
                      <Button type="button" disabled={busyId === row._id} onClick={() => review(row._id, "APPROVE")}>Approve</Button>
                      <Button type="button" variant="outline" disabled={busyId === row._id} onClick={() => review(row._id, "REJECT")}>Reject</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
