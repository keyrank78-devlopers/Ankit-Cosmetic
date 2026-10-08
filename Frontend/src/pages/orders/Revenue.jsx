import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import orderService from "../../services/orderService";
import { cn } from "../../utils/cn";
import { paymentAmounts, paymentLabel } from "../../utils/payment";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" });
const selectClass = "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600";

const stamp = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayStamp = () => stamp(new Date());

const emptyFilters = () => ({
  from: todayStamp(),
  to: todayStamp(),
  search: "",
  customerName: "",
  customerCode: "",
  product: "",
  schemeType: "",
  paymentMethod: "",
});

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Revenue() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ orders: 0, subtotal: 0, gstTotal: 0, total: 0, totalQty: 0 });
  const [days, setDays] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const setFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));

  const applyPreset = (name) => {
    const now = new Date();
    if (name === "today") {
      const day = stamp(now);
      setFilters((current) => ({ ...current, from: day, to: day }));
      return;
    }
    if (name === "yesterday") {
      const day = new Date(now);
      day.setDate(day.getDate() - 1);
      const value = stamp(day);
      setFilters((current) => ({ ...current, from: value, to: value }));
      return;
    }
    if (name === "month") {
      setFilters((current) => ({ ...current, from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: stamp(now) }));
      return;
    }
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    setFilters((current) => ({ ...current, from: `${startYear}-04-01`, to: stamp(now) }));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setApplied(filters);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await orderService.revenue({ ...applied, page, limit });
        if (cancelled) return;
        setSummary(res.summary || { orders: 0, subtotal: 0, gstTotal: 0, total: 0, totalQty: 0 });
        setDays(res.days || []);
        setOrders(res.data || []);
        setPages(res.pagination?.pages || 1);
        setTotal(res.pagination?.total || 0);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load revenue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [applied, page, limit]);

  const chart = days.map((day) => ({
    ...day,
    label: dayLabel.format(new Date(`${day.date}T00:00:00`)),
  }));
  const today = todayStamp();
  const yesterday = (() => {
    const day = new Date();
    day.setDate(day.getDate() - 1);
    return stamp(day);
  })();
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const fyStartYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const preset = filters.from === today && filters.to === today
    ? "today"
    : filters.from === yesterday && filters.to === yesterday
      ? "yesterday"
      : filters.from === monthStart && filters.to === today
        ? "month"
        : filters.from === `${fyStartYear}-04-01` && filters.to === today
          ? "year"
          : "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Revenue</h1>
        <p className="text-sm text-slate-500">Placed orders only. GST is separate from the bill total.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["month", "This month"],
            ["year", "This financial year"],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => applyPreset(id)} className={cn("rounded-full border px-3 py-1 text-sm", preset === id ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From"><Input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} /></Field>
          <Field label="To"><Input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} /></Field>
          <Field label="Customer name"><Input value={filters.customerName} onChange={(event) => setFilter("customerName", event.target.value)} placeholder="Retailer" /></Field>
          <Field label="Customer id"><Input value={filters.customerCode} onChange={(event) => setFilter("customerCode", event.target.value)} placeholder="cus2026/27-0001" /></Field>
          <Field label="Product"><Input value={filters.product} onChange={(event) => setFilter("product", event.target.value)} placeholder="Product name" /></Field>
          <Field label="Scheme">
            <select className={selectClass} value={filters.schemeType} onChange={(event) => setFilter("schemeType", event.target.value)}>
              <option value="">Any scheme</option>
              <option value="SLAB">Amount slab</option>
              <option value="OPEN">Open request</option>
              <option value="FIRST_ORDER">First order</option>
              <option value="NONE">No scheme</option>
            </select>
          </Field>
          <Field label="Payment">
            <select className={selectClass} value={filters.paymentMethod} onChange={(event) => setFilter("paymentMethod", event.target.value)}>
              <option value="">Any payment</option>
              <option value="CASH">Cash</option>
              <option value="ONLINE">Online</option>
              <option value="COD">COD</option>
              <option value="ADVANCE_COD">Advance + COD</option>
              <option value="COD_ONLINE">COD + Online</option>
            </select>
          </Field>
          <Field label="Search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={filters.search} onChange={(event) => setFilter("search", event.target.value)} placeholder="Order, customer, product" className="pl-9" />
            </div>
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="outline" onClick={() => setFilters(emptyFilters())}>Reset to today</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Revenue", money.format(summary.total || 0)],
          ["GST", money.format(summary.gstTotal || 0)],
          ["Subtotal", money.format(summary.subtotal || 0)],
          ["Orders", summary.orders],
          ["Quantity", summary.totalQty],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{loading ? "—" : value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-slate-900">Day wise</h2>
        {chart.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No revenue in this range.</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value, name) => [money.format(value), name === "total" ? "Revenue" : "GST"]} />
                  <Bar dataKey="total" name="Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gstTotal" name="GST" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    {["Date", "Orders", "Quantity", "Subtotal", "GST", "Revenue"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {days.map((day) => (
                    <tr key={day.date}>
                      <td className="px-3 py-2">{when.format(new Date(`${day.date}T00:00:00`))}</td>
                      <td className="px-3 py-2">{day.orders}</td>
                      <td className="px-3 py-2">{day.totalQty}</td>
                      <td className="px-3 py-2">{money.format(day.subtotal || 0)}</td>
                      <td className="px-3 py-2">{money.format(day.gstTotal || 0)}</td>
                      <td className="px-3 py-2 font-semibold">{money.format(day.total || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-medium text-slate-900">Orders in this range</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Order", "Payment", "Date", "Customer", "Qty", "Subtotal", "GST", "Revenue", ""].map((heading) => (
                  <th key={heading || "view"} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="9" className="px-4 py-10 text-center text-sm text-slate-500">Loading revenue...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="9" className="px-4 py-10 text-center text-sm text-slate-500">No orders in this range.</td></tr>
              ) : orders.map((order) => (
                <tr key={order._id}>
                  <td className="px-4 py-4 text-sm font-semibold text-slate-900">{order.orderCode || "—"}</td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-slate-700">{paymentLabel(order)}</p>
                    {order.paymentMethod === "ADVANCE_COD" ? <p className="text-xs text-slate-500">Pending {money.format(paymentAmounts(order).pending)}</p> : null}
                    {order.razorpayPaymentId ? <p className="max-w-[9rem] truncate text-xs text-slate-400" title={order.razorpayPaymentId}>{order.razorpayPaymentId}</p> : null}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">{order.placedAt ? when.format(new Date(order.placedAt)) : "—"}</td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-slate-900">{order.customerName || "—"}</p>
                    <p className="text-xs text-slate-500">{order.customerCode || "No id"}</p>
                  </td>
                  <td className="px-4 py-4 text-sm">{order.totalQty}</td>
                  <td className="px-4 py-4 text-sm">{money.format(order.subtotal || 0)}</td>
                  <td className="px-4 py-4 text-sm">{money.format(order.gstTotal || 0)}</td>
                  <td className="px-4 py-4 text-sm font-semibold">{money.format(order.total || 0)}</td>
                  <td className="px-4 py-4">
                    <Button variant="ghost" size="icon" title="View" onClick={() => navigate(`/dashboard/orders/${order._id}`)}><Eye className="h-4 w-4 text-slate-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Per page
            <select className="h-8 rounded-md border border-slate-200 px-2" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <p className="text-sm text-slate-600">Page {page} of {pages} · {total} orders</p>
          <div className="inline-flex">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-l-md px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))} className="rounded-r-md px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
