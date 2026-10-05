import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { RichNote } from "../../components/ui/RichText";
import orderService from "../../services/orderService";
import { StatusBadge, StatusSelect, claimText } from "./orderStatus.jsx";
import { useAuth } from "../../context/AuthContext";
import { paymentAmounts, paymentLabel } from "../../utils/payment";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const lineMoney = (line) => {
  const amount = Math.round((line.sellPrice * line.quantity + Number.EPSILON) * 100) / 100;
  const gst = Math.round((amount * (line.gstPercent / 100) + Number.EPSILON) * 100) / 100;
  return { amount, gst, total: Math.round((amount + gst + Number.EPSILON) * 100) / 100 };
};

export function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canUpdateStatus = hasPermission("UPDATE_ORDER_STATUS");
  const canDelete = hasPermission("DELETE_ORDERS");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await orderService.get(id);
        if (!cancelled) setOrder(res.data);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  const changeStatus = async (status) => {
    try {
      await orderService.updateStatus(order._id, status);
      setOrder((current) => ({ ...current, status }));
      toast.success("Status updated");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update status");
    }
  };

  const removeOrder = async () => {
    if (!window.confirm(`Delete ${order.orderCode || "this order"}? Locked stock will be released.`)) return;
    try {
      await orderService.remove(order._id);
      toast.success("Order deleted");
      navigate("/dashboard/orders");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete order");
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading order...</p>;
  if (!order) return <p className="text-sm text-slate-500">Order not found.</p>;

  const address = [order.address?.line, order.address?.villageCity, order.address?.district, order.address?.state, order.address?.pincode].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Orders</Link>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Order id</p>
          <h1 className="break-all text-2xl font-bold text-slate-900">{order.orderCode || "—"}</h1>
          <p className="text-sm text-slate-500">{order.placedAt ? when.format(new Date(order.placedAt)) : "—"} · {paymentLabel(order)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canUpdateStatus ? <StatusSelect status={order.status} onChange={changeStatus} /> : <StatusBadge status={order.status} />}
          {canDelete && (
            <Button type="button" variant="outline" onClick={removeOrder}><Trash2 className="mr-2 h-4 w-4 text-red-500" /> Delete</Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Payment</p>
        <p className="mt-1 text-sm font-medium text-slate-900">{paymentLabel(order)}{order.paymentMethod === "ONLINE" ? " · Razorpay" : ""}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Order total</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{money.format(order.total || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Collected now</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{money.format(order.paymentMethod === "ADVANCE_COD" ? paymentAmounts(order).advance : order.paymentMethod === "COD" ? 0 : order.total || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pending</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{money.format(paymentAmounts(order).pending)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Order id</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-900">{order.orderCode || "—"}</p>
          </div>
          {(order.paymentMethod === "ONLINE" || order.advanceMode === "ONLINE") ? (
            <>
              <div>
                <p className="text-xs text-slate-500">Razorpay order id</p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900">{order.razorpayOrderId || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Transaction id</p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900">{order.razorpayPaymentId || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Paid</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{order.paidAt ? when.format(new Date(order.paidAt)) : "—"}</p>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{order.customerName || "—"}</p>
            <p className="text-sm text-slate-500">{order.customerCode || "No id"}{order.firmName ? ` · ${order.firmName}` : ""}</p>
            <p className="text-sm text-slate-500">{order.contactNo1}{order.gstin ? ` · ${order.gstin}` : ""}</p>
            {address && <p className="mt-1 text-sm text-slate-600">{address}</p>}
          </div>
          {order.customerId && (
            <Link to={`/dashboard/orders/customer/${order.customerId}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">View history</Link>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-slate-900">Products</h2>
        <div className="space-y-4">
          {(order.lines || []).map((line, index) => {
            const priced = lineMoney(line);
            return (
              <div key={`${line.product || line.name}-${index}`} className="flex items-center gap-3 border-b border-slate-100 pb-4">
                {line.image ? <img src={line.image} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" /> : <span className="h-14 w-14 rounded-lg border border-dashed border-slate-300" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{line.name}</p>
                  <p className="text-xs text-slate-500">{line.quantity} × {money.format(line.sellPrice || 0)} · GST {line.gstPercent || 0}% · GST {money.format(priced.gst)}</p>
                  {line.remark ? <p className="text-xs font-medium text-amber-700">Remark: {line.remark}</p> : null}
                </div>
                <p className="text-sm font-semibold text-slate-900">{money.format(priced.total)}</p>
              </div>
            );
          })}
        </div>
        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money.format(order.subtotal || 0)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{money.format(order.gstTotal || 0)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span>{money.format(order.total || 0)}</span></div>
          <p className="pt-1 text-xs text-slate-400">Quantity {order.totalQty || 0}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Scheme</h2>
        <p className="mt-1 text-sm text-slate-700">{order.schemeName || "None"}{order.schemeGiftName ? ` · ${order.schemeGiftName}` : ""}</p>
        {order.schemeType === "OPEN" && <RichNote html={order.schemeNote} className="mt-2" />}
        {(order.schemeGifts || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {order.schemeGifts.map((gift) => (
              <div key={`${gift.name}-${gift.image}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                {gift.image ? <img src={gift.image} alt="" className="h-8 w-8 rounded object-cover" /> : null}
                {gift.name}
              </div>
            ))}
          </div>
        )}
        {order.expiryEnabled && (order.expiryLines || []).length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            {order.expiryLines.map((item, index) => (
              <p key={`${item.product || item.name}-${index}`}>Reimbursement: {item.name} × {item.quantity} · {claimText(item)}{item.note ? ` · ${item.note}` : ""}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
