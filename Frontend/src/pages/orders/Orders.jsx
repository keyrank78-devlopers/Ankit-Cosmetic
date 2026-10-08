import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Search, Trash2 } from "lucide-react";
import { ExportButton } from "../../components/export/ExportButton";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import orderService from "../../services/orderService";
import { plainRichText } from "../../components/ui/RichText";
import { StatusBadge, StatusSelect, claimText } from "./orderStatus.jsx";
import { useAuth } from "../../context/AuthContext";
import { paymentAmounts, paymentDateLabel, paymentLabel } from "../../utils/payment";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const emptyFilters = {
  search: "",
  customerName: "",
  customerCode: "",
  product: "",
  from: "",
  to: "",
  minQty: "",
  maxQty: "",
  minTotal: "",
  maxTotal: "",
  schemeType: "",
  expiry: "",
  status: "",
  paymentMethod: "",
  sort: "newest",
};

const selectClass = "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Orders() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canUpdateStatus = hasPermission("UPDATE_ORDER_STATUS");
  const canDelete = hasPermission("DELETE_ORDERS");
  const canPlace = hasPermission("PLACE_ORDERS");
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState([]);
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
        const res = await orderService.list({ ...applied, page, limit });
        if (cancelled) return;
        setOrders(res.data || []);
        setPages(res.pagination?.pages || 1);
        setTotal(res.pagination?.total || 0);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [applied, page, limit]);

  const removeOrder = async (order) => {
    if (!window.confirm(`Delete ${order.orderCode || "this order"}? Locked stock will be released.`)) return;
    try {
      await orderService.remove(order._id);
      toast.success("Order deleted");
      setOrders((current) => current.filter((item) => item._id !== order._id));
      setTotal((current) => Math.max(0, current - 1));
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete order");
    }
  };

  const changeStatus = async (order, status) => {
    try {
      await orderService.updateStatus(order._id, status);
      setOrders((current) => current.map((item) => (item._id === order._id ? { ...item, status } : item)));
      toast.success("Status updated");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update status");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="text-sm text-slate-500">{total} placed order{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton type="ORDERS" filters={applied} />
          {canPlace && (
            <Link to="/dashboard/orders/new" className="inline-flex h-9 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">Place order</Link>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={filters.search} onChange={(event) => setFilter("search", event.target.value)} placeholder="Search order id, customer, or product" className="pl-9" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Customer name"><Input value={filters.customerName} onChange={(event) => setFilter("customerName", event.target.value)} placeholder="Retailer name" /></Field>
          <Field label="Customer id"><Input value={filters.customerCode} onChange={(event) => setFilter("customerCode", event.target.value)} placeholder="cus2026/27-0001" /></Field>
          <Field label="Product"><Input value={filters.product} onChange={(event) => setFilter("product", event.target.value)} placeholder="Product name" /></Field>
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
          <Field label="From date"><Input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} /></Field>
          <Field label="To date"><Input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} /></Field>
          <Field label="Min quantity"><Input inputMode="numeric" value={filters.minQty} onChange={(event) => setFilter("minQty", event.target.value.replace(/[^\d]/g, ""))} placeholder="0" /></Field>
          <Field label="Max quantity"><Input inputMode="numeric" value={filters.maxQty} onChange={(event) => setFilter("maxQty", event.target.value.replace(/[^\d]/g, ""))} placeholder="100" /></Field>
          <Field label="Min amount"><Input inputMode="decimal" value={filters.minTotal} onChange={(event) => setFilter("minTotal", event.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></Field>
          <Field label="Max amount"><Input inputMode="decimal" value={filters.maxTotal} onChange={(event) => setFilter("maxTotal", event.target.value.replace(/[^\d.]/g, ""))} placeholder="50000" /></Field>
          <Field label="Scheme">
            <select className={selectClass} value={filters.schemeType} onChange={(event) => setFilter("schemeType", event.target.value)}>
              <option value="">Any scheme</option>
              <option value="SLAB">Amount slab</option>
              <option value="OPEN">Open request</option>
              <option value="FIRST_ORDER">First order</option>
              <option value="NONE">No scheme</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={selectClass} value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
              <option value="">Any status</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRM">Confirm</option>
              <option value="READY_TO_DELIVERY">Ready to delivery</option>
              <option value="OUT_FOR_DELIVERY">Out for delivery</option>
              <option value="DELIVERED">Delivered</option>
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
                {["Order", "Status", "Date", "Customer", "Products", "Qty", "Amount", "Payment", "Scheme", ""].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="10" className="px-4 py-10 text-center text-sm text-slate-500">Loading orders...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="10" className="px-4 py-10 text-center text-sm text-slate-500">No orders match these filters.</td></tr>
              ) : orders.map((order) => (
                <tr key={order._id}>
                  <td className="px-4 py-4 align-top">
                    <p className="text-sm font-semibold text-slate-900">{order.orderCode || "—"}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    {canUpdateStatus ? (
                      <StatusSelect status={order.status} onChange={(status) => changeStatus(order, status)} />
                    ) : (
                      <StatusBadge status={order.status} />
                    )}
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-600">{order.placedAt ? when.format(new Date(order.placedAt)) : "—"}</td>
                  <td className="px-4 py-4 align-top">
                    <button type="button" onClick={() => order.customerId && navigate(`/dashboard/orders/customer/${order.customerId}`)} className="text-left">
                      <p className="text-sm font-medium text-slate-900">{order.customerName || "—"}</p>
                      <p className="text-xs text-slate-500">{order.customerCode || "No id"}{order.firmName ? ` · ${order.firmName}` : ""}</p>
                    </button>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <ul className="space-y-2">
                      {(order.lines || []).map((line, index) => (
                        <li key={`${line.name}-${index}`} className="flex items-start gap-2">
                          {line.image ? <img src={line.image} alt="" className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-white object-contain" /> : <span className="h-10 w-10 shrink-0 rounded border border-dashed border-slate-300" />}
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-900">{line.name}</span>
                            <span className="block text-xs text-slate-500">{line.quantity} × {money.format(line.sellPrice || 0)} = {money.format((line.sellPrice || 0) * (line.quantity || 0))}{line.mrp != null ? ` · MRP ${money.format(line.mrp)}` : ""}</span>
                            {line.remark ? <span className="block text-xs font-medium text-amber-700">{line.remark}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {order.expiryEnabled && order.expiryLines?.length > 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        Reimbursement: {order.expiryLines.map((item) => `${item.name} × ${item.quantity} · ${claimText(item)}${item.type === "EXPIRY" && item.mrp != null ? ` · MRP ₹${item.mrp}` : ""}${item.note ? ` (${item.note})` : ""}`).join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top text-sm font-medium text-slate-900">{order.totalQty}</td>
                  <td className="px-4 py-4 align-top">
                    <p className="text-sm font-semibold text-slate-900">{money.format(order.total || 0)}</p>
                    <p className="text-xs text-slate-500">GST {money.format(order.gstTotal || 0)}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="text-sm font-medium text-slate-900">{paymentLabel(order)}</p>
                    {order.paymentMethod === "COD_ONLINE" ? (
                      <p className="mt-1 text-xs text-slate-500">Online {money.format(paymentAmounts(order).advance)} · COD {money.format(Math.max((order.total || 0) - paymentAmounts(order).advance, 0))}</p>
                    ) : order.paymentMethod === "ADVANCE_COD" ? (
                      <p className="mt-1 text-xs text-slate-500">Advance {money.format(paymentAmounts(order).advance)} · Pending {money.format(paymentAmounts(order).pending)}</p>
                    ) : order.paymentMethod === "COD" || (order.paymentMethod === "ONLINE" && !order.razorpayPaymentId) ? (
                      <p className="mt-1 text-xs text-slate-500">Pending {money.format(paymentAmounts(order).pending)}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">Order id</p>
                    <p className="break-all text-sm font-medium text-slate-900">{order.orderCode || "—"}</p>
                    {(order.paymentPromises || []).length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {order.paymentPromises.map((row) => (
                          <li key={row._id || `${row.dueDate}-${row.amount}`} className="text-xs text-slate-600">
                            {paymentDateLabel(row.dueDate)} · {money.format(row.amount || 0)} · {row.status === "RECEIVED" ? "Received" : "Due"}
                          </li>
                        ))}
                      </ul>
                    )}
                    {(order.razorpayOrderId || order.razorpayPaymentId) ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-slate-500">Razorpay order id</p>
                        <p className="break-all text-sm font-medium text-slate-900">{order.razorpayOrderId || "—"}</p>
                        <p className="text-xs text-slate-500">Transaction id</p>
                        <p className="break-all text-sm font-medium text-slate-900">{order.razorpayPaymentId || "—"}</p>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-600">
                    {order.schemeName || "None"}
                    {order.schemeType === "OPEN" && plainRichText(order.schemeNote) ? (
                      <span className="mt-1 block max-w-xs text-xs text-slate-500">{plainRichText(order.schemeNote)}</span>
                    ) : null}
                    {order.schemeType !== "OPEN" && order.schemeGiftName ? <span className="block text-xs text-slate-500">{order.schemeGiftName}</span> : null}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="View" onClick={() => navigate(`/dashboard/orders/${order._id}`)}><Eye className="h-4 w-4 text-slate-500" /></Button>
                      {canDelete && (
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => removeOrder(order)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      )}
                    </div>
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
          <p className="text-sm text-slate-600">Page {page} of {pages}</p>
          <div className="inline-flex">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-l-md px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))} className="rounded-r-md px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
