import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import { useAuth } from "../../context/AuthContext";
import { Pager, pageSize } from "../../components/ui/Pager";

const TYPES = [
  { value: "", label: "All movements" },
  { value: "PRODUCTION", label: "Manufactured" },
  { value: "SALE", label: "Delivered" },
  { value: "DAMAGE", label: "Damage" },
  { value: "EXPIRY", label: "Expiry" },
  { value: "RETURN", label: "Return" },
  { value: "OPENING", label: "Opening" },
];

const TYPE_LABEL = {
  PRODUCTION: "Manufactured",
  SALE: "Delivered",
  DAMAGE: "Damage",
  EXPIRY: "Expiry",
  RETURN: "Return",
  OPENING: "Opening",
};

const emptySummary = { OPENING: 0, PRODUCTION: 0, SALE: 0, DAMAGE: 0, EXPIRY: 0, RETURN: 0 };

const inputDate = (value) => (
  value
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value))
    : ""
);

const prettyWhen = (value) => (
  value
    ? new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
    : "—"
);

export function StockHistory() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("MANAGE_INVENTORY") || hasPermission("EDIT_PRODUCTS");
  const [params, setParams] = useSearchParams();
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);
  const limit = pageSize(params.get("limit"), 20);

  const [search, setSearch] = useState(params.get("search") || "");
  const [batch, setBatch] = useState(params.get("batch") || "");
  const [order, setOrder] = useState(params.get("order") || "");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        const apply = (key, value) => {
          const trimmed = value.trim();
          if (trimmed) next.set(key, trimmed);
          else next.delete(key);
        };
        const same = (next.get("search") || "") === search.trim()
          && (next.get("batch") || "") === batch.trim()
          && (next.get("order") || "") === order.trim();
        if (same) return current;
        apply("search", search);
        apply("batch", batch);
        apply("order", order);
        if (search.trim()) next.delete("product");
        next.delete("page");
        return next;
      }, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [search, batch, order, setParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get("/admin/inventory/history", {
          params: {
            product: params.get("product") || undefined,
            search: params.get("search") || undefined,
            batch: params.get("batch") || undefined,
            type: params.get("type") || undefined,
            from: params.get("from") || undefined,
            to: params.get("to") || undefined,
            order: params.get("order") || undefined,
            page,
            limit,
          },
        });
        if (cancelled) return;
        setRows(res.data.data || []);
        setSummary({ ...emptySummary, ...(res.data.summary || {}) });
        setProduct(res.data.product || null);
        setTotal(res.data.pagination?.total || 0);
        setTotalPages(res.data.pagination?.pages || 1);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load stock history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [params, page, refresh]);

  const setQuery = (updates) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    next.delete("page");
    setParams(next);
  };

  const openEdit = (row) => {
    setEditing({
      id: row._id,
      type: row.type,
      batchNo: row.batch?.batchNo || "",
      quantity: String(row.quantity),
      note: row.note || "",
      caseSize: row.batch?.caseSize || "",
      mfgDate: inputDate(row.batch?.mfgDate),
      expiryDate: inputDate(row.batch?.expiryDate),
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
    const label = `${TYPE_LABEL[row.type] || row.type} ${row.quantity}`;
    if (!window.confirm(`Delete this ${label} entry? Stock will be adjusted.`)) return;
    try {
      await api.delete(`/admin/inventory/entry/${row._id}`);
      toast.success("Stock entry deleted");
      setRefresh((current) => current + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete the stock entry");
    }
  };

  const cards = [
    { label: "Manufactured", value: summary.PRODUCTION, tone: "text-indigo-700" },
    { label: "Delivered", value: summary.SALE, tone: "text-sky-700" },
    { label: "Damage", value: summary.DAMAGE, tone: "text-rose-700" },
    { label: "Expiry", value: summary.EXPIRY, tone: "text-amber-700" },
    { label: "Return", value: summary.RETURN, tone: "text-slate-900" },
    { label: "Opening", value: summary.OPENING, tone: "text-slate-900" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock history</h1>
        <p className="mt-1 text-sm text-slate-500">Every manufacture, delivery, damage, expiry, and return. Totals follow the filters. Update or delete a manual entry here.</p>
      </div>

      {product && (
        <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">{product.name}</p>
            <p className="text-xs text-slate-600">{product.productCode || product.productId}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Current <strong>{product.onHand}</strong></span>
            <span>Reserved <strong>{product.reserved}</strong></span>
            <span>Available <strong>{product.available}</strong></span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setQuery({ product: "" })}>Clear product</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">{card.label}</p>
            <p className={cn("mt-1 text-xl font-semibold", card.tone)}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6">
        <div className="relative xl:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Product name or code" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Input placeholder="Batch" value={batch} onChange={(event) => setBatch(event.target.value)} />
        <Input placeholder="Order code" value={order} onChange={(event) => setOrder(event.target.value)} />
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={params.get("type") || ""}
          onChange={(event) => setQuery({ type: event.target.value })}
        >
          {TYPES.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={params.get("from") || ""} onChange={(event) => setQuery({ from: event.target.value })} />
          <Input type="date" value={params.get("to") || ""} onChange={(event) => setQuery({ to: event.target.value })} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["When", "Product", "Batch", "Type", "Qty", "Order", "Note", "By"].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-500">Loading history...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-500">No stock movements for these filters.</td></tr>
              ) : rows.map((row) => (
                <tr key={row._id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{prettyWhen(row.at)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{row.product?.name || "Product"}</p>
                    <p className="text-xs text-slate-500">{row.product?.productCode || row.product?.productId}</p>
                    {canManage && row.editable && (
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>Edit</Button>
                        <Button type="button" size="sm" variant="outline" className="text-rose-700" onClick={() => removeEntry(row)}>Delete</Button>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.batch?.batchNo || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{TYPE_LABEL[row.type] || row.type}</td>
                  <td className={cn("whitespace-nowrap px-4 py-3 text-sm font-semibold", row.effect < 0 ? "text-rose-700" : "text-indigo-700")}>
                    {row.effect > 0 ? `+${row.effect}` : row.effect}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {row.order ? (
                      <Link className="text-indigo-700 hover:underline" to={`/dashboard/orders/${row.order._id}`}>{row.order.orderCode || "Order"}</Link>
                    ) : "—"}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-sm text-slate-600">{row.note || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.createdBy?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={page}
          pages={totalPages}
          limit={limit}
          total={total}
          onPage={(nextPage) => {
            const next = new URLSearchParams(params);
            if (nextPage <= 1) next.delete("page");
            else next.set("page", String(nextPage));
            setParams(next);
          }}
          onLimit={(size) => {
            const next = new URLSearchParams(params);
            next.set("limit", String(size));
            next.delete("page");
            setParams(next);
          }}
        />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Update entry</h2>
              <p className="mt-1 text-sm text-slate-500">{TYPE_LABEL[editing.type]} · Batch {editing.batchNo}</p>
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
