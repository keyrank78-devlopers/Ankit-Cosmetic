import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Plus, Search } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { Pager } from "../../components/ui/Pager";

const dayKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const shiftDay = (day, count) => {
  const date = new Date(`${day}T12:00:00+05:30`);
  date.setDate(date.getDate() + count);
  return dayKey(date);
};
const prettyDate = (value) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const inputDate = (value) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
const ENTRY_LABEL = { OPENING: "Opening", PRODUCTION: "Manufactured", DAMAGE: "Damage", EXPIRY: "Expiry", RETURN: "Return" };

export function Inventory() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("MANAGE_INVENTORY") || hasPermission("EDIT_PRODUCTS");
  const today = dayKey(new Date());

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [batch, setBatch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedBatch, setDebouncedBatch] = useState("");
  const [from, setFrom] = useState(shiftDay(today, -6));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedBatch(batch);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, batch]);

  useEffect(() => {
    const fetchSheet = async () => {
      try {
        setLoading(true);
        const res = await api.get("/admin/inventory", { params: { search: debouncedSearch, batch: debouncedBatch, from, to, page, limit } });
        setRows(res.data.data || []);
        setTotal(res.data.pagination?.total || 0);
        setTotalPages(res.data.pagination?.pages || 1);
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to load inventory");
      } finally {
        setLoading(false);
      }
    };
    fetchSheet();
  }, [debouncedSearch, debouncedBatch, from, to, page, limit, refresh]);

  const openEdit = (row) => {
    setEditing({
      id: row.entry._id,
      type: row.entry.type,
      batchNo: row.batchNo,
      quantity: String(row.entry.quantity),
      note: row.entry.note || "",
      caseSize: row.caseSize || "",
      mfgDate: inputDate(row.mfgDate),
      expiryDate: inputDate(row.expiryDate),
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editing) return;
    try {
      setSaving(true);
      await api.patch(`/admin/inventory/entry/${editing.id}`, {
        quantity: Number(editing.quantity),
        note: editing.note,
        caseSize: editing.caseSize,
        mfgDate: editing.mfgDate,
        expiryDate: editing.expiryDate,
      });
      toast.success("Stock entry updated");
      setEditing(null);
      setRefresh((current) => current + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update the stock entry");
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (row) => {
    const label = `${ENTRY_LABEL[row.entry.type] || row.entry.type} ${row.entry.quantity}`;
    if (!window.confirm(`Delete this ${label} entry for ${row.batchNo || "this batch"}? Stock will be adjusted.`)) return;
    try {
      await api.delete(`/admin/inventory/entry/${row.entry._id}`);
      toast.success("Stock entry deleted");
      setRefresh((current) => current + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete the stock entry");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">Opening, daily movement, and closing for each batch.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/dashboard/inventory/history")}>
            <History className="mr-2 h-4 w-4" />
            Stock history
          </Button>
          {canManage && (
            <Button onClick={() => navigate("/dashboard/inventory/entry")}>
              <Plus className="mr-2 h-4 w-4" />
              Stock entry
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:flex-wrap">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search product" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        </div>
        <Input className="lg:w-40" placeholder="Batch" value={batch} onChange={(event) => { setBatch(event.target.value); setPage(1); }} />
        <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Product", "Current", "Batch", "Case", "MFG", "Expiry", "Opening", "Closing", "Reserved", "Available", "Actions"].map((heading) => (
                  <th key={heading} className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase text-slate-500 ${heading === "Actions" ? "text-right" : "text-left"}`}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">Loading inventory...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">No products found.</td></tr>
              ) : rows.map((row) => (
                <tr key={row._id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{row.product?.name || "Product"}</p>
                    <p className="text-xs text-slate-500">{row.product?.productCode || row.product?.productId} · MRP {row.product?.mrp ?? "—"}</p>
                    {row.product?._id && (
                      <button type="button" className="mt-1 text-xs font-medium text-indigo-700 hover:underline" onClick={() => navigate(`/dashboard/inventory/history?product=${row.product._id}`)}>
                        Full history
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">{row.onHand}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.batchNo || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.caseSize || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{prettyDate(row.mfgDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{prettyDate(row.expiryDate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">{row.opening}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.closing}</td>
                  <td className="px-4 py-3 text-sm text-amber-700">{row.reserved}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.available}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canManage && row.entry ? (
                      <div className="inline-flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>Edit</Button>
                        <Button type="button" size="sm" variant="outline" className="text-rose-700" onClick={() => removeEntry(row)}>Delete</Button>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={totalPages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Update entry</h2>
              <p className="mt-1 text-sm text-slate-500">{ENTRY_LABEL[editing.type] || editing.type} · Batch {editing.batchNo}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Quantity</label>
              <Input type="number" min="1" step="1" required value={editing.quantity} disabled={saving} onChange={(event) => setEditing((prev) => ({ ...prev, quantity: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Case size</label>
              <Input value={editing.caseSize} disabled={saving} onChange={(event) => setEditing((prev) => ({ ...prev, caseSize: event.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">MFG date</label>
                <Input type="date" required value={editing.mfgDate} disabled={saving} onChange={(event) => setEditing((prev) => ({ ...prev, mfgDate: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Expiry date</label>
                <Input type="date" required value={editing.expiryDate} disabled={saving} onChange={(event) => setEditing((prev) => ({ ...prev, expiryDate: event.target.value }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Note</label>
              <Input maxLength={200} value={editing.note} disabled={saving} onChange={(event) => setEditing((prev) => ({ ...prev, note: event.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
