import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Search } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { plainRichText } from "../../components/ui/RichText";
import orderService from "../../services/orderService";
import { StatusBadge } from "./orderStatus.jsx";
import { paymentAmounts, paymentLabel } from "../../utils/payment";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const emptyFilters = { search: "", product: "", from: "", to: "", minQty: "", maxQty: "", minTotal: "", maxTotal: "", schemeType: "", expiry: "", sort: "newest" };
const selectClass = "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function CustomerHistory() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [summary, setSummary] = useState({ orders: 0, totalAmount: 0, gstTotal: 0, totalQty: 0 });
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const setFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));

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
        const res = await orderService.history(customerId, { ...applied, page, limit });
        if (cancelled) return;
        setCustomer(res.customer);
        setSummary(res.summary || { orders: 0, totalAmount: 0, gstTotal: 0, totalQty: 0 });
        setOrders(res.data || []);
        setPages(res.pagination?.pages || 1);
        setTotal(res.pagination?.total || 0);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [customerId, applied, page, limit]);

  return (
    <div className="space-y-5">
      <div>
        <Link to="/dashboard/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Orders</Link>
        <h1 className="text-2xl font-bold text-slate-900">{customer?.retailerName || "Customer history"}</h1>
        <p className="text-sm text-slate-500">{customer?.customerCode || "No id"}{customer?.firmName ? ` · ${customer.firmName}` : ""}{customer?.contactNo1 ? ` · ${customer.contactNo1}` : ""}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Orders", summary.orders],
          ["Quantity", summary.totalQty],
          ["Amount", money.format(summary.totalAmount || 0)],
          ["GST", money.format(summary.gstTotal || 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={filters.search} onChange={(event) => setFilter("search", event.target.value)} placeholder="Search order id or product" className="pl-9" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Product"><Input value={filters.product} onChange={(event) => setFilter("product", event.target.value)} placeholder="Product name" /></Field>
          <Field label="From date"><Input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} /></Field>
          <Field label="To date"><Input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} /></Field>
          <Field label="Sort">
            <select className={selectClass} value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="total_desc">Amount high to low</option>
              <option value="total_asc">Amount low to high</option>
              <option value="qty_desc">Quantity high to low</option>
              <option value="qty_asc">Quantity low to high</option>
            </select>
          </Field>
          <Field label="Min quantity"><Input inputMode="numeric" value={filters.minQty} onChange={(event) => setFilter("minQty", event.target.value.replace(/[^\d]/g, ""))} /></Field>
          <Field label="Max quantity"><Input inputMode="numeric" value={filters.maxQty} onChange={(event) => setFilter("maxQty", event.target.value.replace(/[^\d]/g, ""))} /></Field>
          <Field label="Min amount"><Input inputMode="decimal" value={filters.minTotal} onChange={(event) => setFilter("minTotal", event.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Max amount"><Input inputMode="decimal" value={filters.maxTotal} onChange={(event) => setFilter("maxTotal", event.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Scheme">
            <select className={selectClass} value={filters.schemeType} onChange={(event) => setFilter("schemeType", event.target.value)}>
              <option value="">Any scheme</option>
              <option value="SLAB">Amount slab</option>
              <option value="OPEN">Open request</option>
              <option value="FIRST_ORDER">First order</option>
              <option value="NONE">No scheme</option>
            </select>
          </Field>
          <Field label="Reimbursement">
            <select className={selectClass} value={filters.expiry} onChange={(event) => setFilter("expiry", event.target.value)}>
              <option value="">Any</option>
              <option value="yes">Has reimbursement</option>
              <option value="no">No reimbursement</option>
            </select>
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="outline" onClick={() => setFilters(emptyFilters)}>Clear filters</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Order", "Status", "Date", "Products", "Qty", "Amount", "Scheme", ""].map((heading) => (
                  <th key={heading || "actions"} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="8" className="px-4 py-10 text-center text-sm text-slate-500">Loading history...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-10 text-center text-sm text-slate-500">No orders for this customer.</td></tr>
              ) : orders.map((order) => (
                <tr key={order._id}>
                  <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                    <p>{order.orderCode || "—"}</p>
                    <p className="text-xs font-normal text-slate-500">{paymentLabel(order)}{order.paymentMethod === "ADVANCE_COD" ? ` · Pending ${money.format(paymentAmounts(order).pending)}` : ""}</p>
                  </td>
                  <td className="px-4 py-4"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-4 text-sm text-slate-600">{order.placedAt ? when.format(new Date(order.placedAt)) : "—"}</td>
                  <td className="px-4 py-4">
                    <ul className="space-y-2">
                      {(order.lines || []).map((line, index) => (
                        <li key={`${line.name}-${index}`} className="flex items-center gap-2 text-sm text-slate-700">
                          {line.image ? <img src={line.image} alt="" className="h-8 w-8 rounded border border-slate-200 object-cover" /> : <span className="h-8 w-8 rounded border border-dashed border-slate-300" />}
                          {line.name} <span className="text-slate-400">× {line.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-slate-900">{order.totalQty}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-slate-900">{money.format(order.total || 0)}</td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {order.schemeName || "None"}
                    {order.schemeType === "OPEN" && plainRichText(order.schemeNote) ? <span className="mt-1 block max-w-xs text-xs text-slate-500">{plainRichText(order.schemeNote)}</span> : null}
                  </td>
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
