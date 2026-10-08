import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "../../components/ui/Input";
import orderService from "../../services/orderService";
import { claimText } from "../orders/orderStatus.jsx";
import { cn } from "../../utils/cn";
import { Pager, pageSize } from "../../components/ui/Pager";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const reasons = [
  { key: "EXPIRY", label: "Expiry" },
  { key: "DAMAGE", label: "Damage" },
  { key: "RETURN", label: "Return" },
  { key: "OTHER", label: "Other" },
  { key: "ALL", label: "All reasons" },
];
const emptyBucket = { received: 0, given: 0, short: 0, value: 0 };
const selectClass = "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600";

export function ExpiryStock() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);
  const limit = pageSize(params.get("limit"), 20);
  const type = params.get("type") || "EXPIRY";
  const [search, setSearch] = useState(params.get("search") || "");
  const [rows, setRows] = useState([]);
  const [held, setHeld] = useState({ DAMAGE: 0, EXPIRY: 0, RETURN: 0, OTHER: 0 });
  const [totals, setTotals] = useState({ DAMAGE: emptyBucket, EXPIRY: emptyBucket, RETURN: emptyBucket, OTHER: emptyBucket });
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
        const res = await orderService.expiryStock({
          search: params.get("search") || undefined,
          type,
          from: params.get("from") || undefined,
          to: params.get("to") || undefined,
          page,
          limit,
        });
        if (cancelled) return;
        setRows(res.data || []);
        setHeld({ DAMAGE: 0, EXPIRY: 0, RETURN: 0, OTHER: 0, ...(res.held || {}) });
        setTotals({
          DAMAGE: { ...emptyBucket, ...res.totals?.DAMAGE },
          EXPIRY: { ...emptyBucket, ...res.totals?.EXPIRY },
          RETURN: { ...emptyBucket, ...res.totals?.RETURN },
          OTHER: { ...emptyBucket, ...res.totals?.OTHER },
        });
        setTotal(res.pagination?.total || 0);
        setTotalPages(res.pagination?.pages || 1);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load expiry stock");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [params, page, limit, type]);

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
    { key: "EXPIRY", label: "Expiry held", tone: "text-amber-700" },
    { key: "DAMAGE", label: "Damage held", tone: "text-rose-700" },
    { key: "RETURN", label: "Return held", tone: "text-sky-700" },
    { key: "OTHER", label: "Other held", tone: "text-slate-900" },
  ];
  const active = type === "ALL"
    ? Object.values(totals).reduce((sum, bucket) => ({
      received: sum.received + bucket.received,
      given: sum.given + bucket.given,
      short: sum.short + bucket.short,
      value: sum.value + bucket.value,
    }), { ...emptyBucket })
    : (totals[type] || emptyBucket);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expiry stock</h1>
        <p className="mt-1 text-sm text-slate-500">Returned goods stay out of sellable stock. The same product given back comes out of main stock at MRP.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setQuery({ type: type === card.key ? "ALL" : card.key })}
            className={cn("rounded-xl border bg-white p-3 text-left shadow-sm", type === card.key ? "border-indigo-500" : "border-slate-200")}
          >
            <p className="text-xs font-medium uppercase text-slate-500">{card.label}</p>
            <p className={cn("mt-1 text-xl font-semibold", card.tone)}>{held[card.key] || 0}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-4">
        <div><p className="text-xs text-slate-500">Received</p><p className="font-semibold text-slate-900">{active.received}</p></div>
        <div><p className="text-xs text-slate-500">Given from main stock</p><p className="font-semibold text-slate-900">{active.given}</p></div>
        <div><p className="text-xs text-slate-500">To manufacture</p><p className="font-semibold text-slate-900">{active.short}</p></div>
        <div><p className="text-xs text-slate-500">MRP value</p><p className="font-semibold text-slate-900">{money.format(active.value || 0)}</p></div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Order, customer, or product" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className={selectClass} value={type} onChange={(event) => setQuery({ type: event.target.value })} aria-label="Reason">
          {reasons.map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}
        </select>
        <Input type="date" value={params.get("from") || ""} onChange={(event) => setQuery({ from: event.target.value })} />
        <Input type="date" value={params.get("to") || ""} onChange={(event) => setQuery({ to: event.target.value })} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Date", "Order", "Customer", "Product", "Received", "From stock", "To make", "MRP value", "Reason"].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="9" className="px-4 py-8 text-center text-slate-500">Loading expiry stock...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="9" className="px-4 py-8 text-center text-slate-500">No stock lines for these filters.</td></tr>
              ) : rows.map((row, index) => (
                <tr key={`${row.orderId}-${row.productName}-${row.type}-${index}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.placedAt ? when.format(new Date(row.placedAt)) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <Link className="font-medium text-indigo-700 hover:underline" to={`/dashboard/orders/${row.orderId}`}>{row.orderCode || "Order"}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm text-slate-900">{row.customerName || "Customer"}</p>
                    <p className="text-xs text-slate-500">{row.customerCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.image ? <img src={row.image} alt="" className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-white object-contain" /> : <span className="h-10 w-10 shrink-0 rounded border border-dashed border-slate-300" />}
                      <span className="text-sm text-slate-900">{row.productName}{row.givenName ? ` · Give ${row.givenName} × ${row.givenQuantity}` : ""}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">{row.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.stockSettled ? row.stockGiven : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.stockSettled ? row.stockShort : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.mrp != null ? money.format(row.quantity * row.mrp) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{claimText(row)}</td>
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
