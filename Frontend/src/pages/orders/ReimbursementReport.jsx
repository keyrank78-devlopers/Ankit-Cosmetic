import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "../../components/ui/Input";
import orderService from "../../services/orderService";
import { claimText, StatusBadge } from "./orderStatus.jsx";
import { cn } from "../../utils/cn";
import { Pager, pageSize } from "../../components/ui/Pager";

const emptySummary = { DAMAGE: 0, EXPIRY: 0, RETURN: 0, MISSING: 0 };
const reasons = [
  { key: "", label: "All reasons" },
  { key: "EXPIRY", label: "Expiry" },
  { key: "DAMAGE", label: "Damage" },
  { key: "RETURN", label: "Return" },
  { key: "MISSING", label: "Missing" },
];
const selectClass = "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600";
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function ReimbursementReport() {
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
        const res = await orderService.reimbursements({
          search: params.get("search") || undefined,
          type: params.get("type") || undefined,
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
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load reimbursement report");
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

  const cards = [
    { key: "EXPIRY", label: "Expiry", tone: "text-amber-700" },
    { key: "DAMAGE", label: "Damage", tone: "text-rose-700" },
    { key: "RETURN", label: "Return", tone: "text-sky-700" },
    { key: "MISSING", label: "Missing", tone: "text-slate-900" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reimbursement report</h1>
        <p className="mt-1 text-sm text-slate-500">Filter by expiry, damage, return, or missing. The cards stay as the full totals.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setQuery({ type: params.get("type") === card.key ? "" : card.key })}
            className={cn("rounded-xl border bg-white p-3 text-left shadow-sm", params.get("type") === card.key ? "border-indigo-500" : "border-slate-200")}
          >
            <p className="text-xs font-medium uppercase text-slate-500">{card.label}</p>
            <p className={cn("mt-1 text-xl font-semibold", card.tone)}>{summary[card.key]}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Order, customer, or product" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className={selectClass} value={params.get("type") || ""} onChange={(event) => setQuery({ type: event.target.value })} aria-label="Reason">
          {reasons.map((reason) => <option key={reason.key || "all"} value={reason.key}>{reason.label}</option>)}
        </select>
        <Input type="date" value={params.get("from") || ""} onChange={(event) => setQuery({ from: event.target.value })} />
        <Input type="date" value={params.get("to") || ""} onChange={(event) => setQuery({ to: event.target.value })} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Date", "Order", "Customer", "Product", "Qty", "Reason", "Note", "Status"].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-500">Loading report...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-500">No reimbursement entries for these filters.</td></tr>
              ) : rows.map((row, index) => (
                <tr key={`${row.orderId}-${row.productName}-${index}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.placedAt ? when.format(new Date(row.placedAt)) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <Link className="font-medium text-indigo-700 hover:underline" to={`/dashboard/orders/${row.orderId}`}>{row.orderCode || "Order"}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm text-slate-900">{row.customerName || "Customer"}</p>
                    <p className="text-xs text-slate-500">{row.customerCode}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{row.productName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">{row.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{claimText(row)}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-sm text-slate-600">{row.note || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={row.status} /></td>
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
