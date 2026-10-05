const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const paymentLabel = (order) => {
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
  if (order?.paymentMethod === "ADVANCE_COD") {
    const pending = order.pendingAmount == null
      ? roundMoney(Math.max(total - advance, 0))
      : roundMoney(order.pendingAmount);
    return { total, advance, pending };
  }
  if (order?.paymentMethod === "COD") {
    const stored = roundMoney(order?.pendingAmount || 0);
    return { total, advance: 0, pending: stored > 0 ? stored : total };
  }
  return { total, advance: 0, pending: 0 };
};
