const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const paymentDateLabel = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
};

const receivedPromises = (order) => roundMoney((order?.paymentPromises || [])
  .filter((row) => row.status === "RECEIVED")
  .reduce((sum, row) => sum + Number(row.amount || 0), 0));

export const paymentLabel = (order) => {
  if (order?.paymentMethod === "COD_ONLINE") return "COD + Online";
  if (order?.paymentMethod === "ONLINE") return "Online";
  if (order?.paymentMethod === "CASH") return "Cash";
  if (order?.paymentMethod === "ADVANCE_COD") {
    return order.advanceMode === "ONLINE" ? "Advance (online) + COD" : "Advance (cash) + COD";
  }
  return "COD";
};

export const paymentAmounts = (order) => {
  const total = roundMoney(order?.total || 0);
  const advance = roundMoney(order?.advanceAmount || 0);
  if (order?.paymentMethod === "COD_ONLINE") {
    const received = receivedPromises(order);
    const pending = order.pendingAmount == null
      ? roundMoney(Math.max(total - advance - received, 0))
      : roundMoney(order.pendingAmount);
    return { total, advance, pending };
  }
  if (order?.paymentMethod === "ADVANCE_COD") {
    const pending = order.pendingAmount == null
      ? roundMoney(Math.max(total - advance, 0))
      : roundMoney(order.pendingAmount);
    return { total, advance, pending };
  }
  if (order?.paymentMethod === "ONLINE" && order.razorpayPaymentId && !(order.paymentPromises || []).length) {
    return { total, advance: 0, pending: 0 };
  }
  if (order?.paymentMethod === "COD" || order?.paymentMethod === "ONLINE") {
    const received = receivedPromises(order);
    if (order.paymentMethod === "COD" && !(order.paymentPromises || []).length) {
      const stored = roundMoney(order?.pendingAmount || 0);
      return { total, advance: 0, pending: stored > 0 ? stored : total };
    }
    const pending = order.pendingAmount == null
      ? roundMoney(Math.max(total - received, 0))
      : roundMoney(order.pendingAmount);
    return { total, advance: received, pending };
  }
  return { total, advance: 0, pending: 0 };
};
