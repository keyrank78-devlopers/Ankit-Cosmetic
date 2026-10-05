import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "../../components/ui/Input";
import orderService from "../../services/orderService";
import { StatusBadge } from "./orderStatus.jsx";
import { cn } from "../../utils/cn";
import { Pager, pageSize } from "../../components/ui/Pager";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const emptySummary = {
  PENDING: { orders: 0, total: 0 },
  CONFIRM: { orders: 0, total: 0 },
  READY_TO_DELIVERY: { orders: 0, total: 0 },
  OUT_FOR_DELIVERY: { orders: 0, total: 0 },
  DELIVERED: { orders: 0, total: 0 },
};
const cards = [
  { key: "PENDING", label: "Pending" },
  { key: "CONFIRM", label: "Confirm" },
  { key: "READY_TO_DELIVERY", label: "Preparing for delivery" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { key: "DELIVERED", label: "Delivered" },
];

export function WarehouseReport() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);
  const limit = pageSize(params.get("limit"), 20);
  const [search, setSearch] = useState(params.get("search") || "");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        const trimmed = search.trim();
        if ((next.get("search") || "") === trimmed) return current;
        if (trimmed) next.set("search", trimmed);
        else next.delete("search");
        next.delete("page");
        return next;
      }, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [search, setParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await orderService.warehouse({
          search: params.get("search") || undefined,
          status: params.get("status") || undefined,
          from: params.get("from") || undefined,
          to: params.get("to") || undefined,
          page,
          limit,
        });
        if (cancelled) return;
        setRows(res.data || []);
        setSummary({ ...emptySummary, ...(res.summary || {}) });
        setTotal(res.pagination?.total || 0);
        setTotalPages(res.pagination?.pages || 1);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load delivery report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [params, page]);

  const setQuery = (updates) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    next.delete("page");
    setParams(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Delivery report</h1>
        <p className="mt-1 text-sm text-slate-500">Pending, confirmed, preparing, out for delivery, and delivered. Counts follow the date and search filters.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const bucket = summary[card.key] || { orders: 0, total: 0 };
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setQuery({ status: params.get("status") === card.key ? "" : card.key })}
              className={cn("rounded-xl border bg-white p-3 text-left shadow-sm", params.get("status") === card.key ? "border-indigo-500" : "border-slate-200")}
            >
              <p className="text-xs font-medium uppercase text-slate-500">{card.label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{bucket.orders}</p>
              <p className="text-xs text-slate-500">{money.format(bucket.total || 0)}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Order code or customer" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Input type="date" value={params.get("from") || ""} onChange={(event) => setQuery({ from: event.target.value })} />
        <Input type="date" value={params.get("to") || ""} onChange={(event) => setQuery({ to: event.target.value })} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Date", "Order", "Customer", "Status", "Amount"].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">Loading report...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No orders for these filters.</td></tr>
              ) : rows.map((row) => (
                <tr key={row._id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.placedAt ? when.format(new Date(row.placedAt)) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <Link className="font-medium text-indigo-700 hover:underline" to={`/dashboard/orders/${row._id}`}>{row.orderCode || "Order"}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm text-slate-900">{row.customerName || "Customer"}</p>
                    <p className="text-xs text-slate-500">{row.customerCode}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={row.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{money.format(row.total || 0)}</td>
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
    </div>
  );
}
