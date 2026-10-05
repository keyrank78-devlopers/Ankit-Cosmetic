export const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRM", label: "Confirm" },
  { value: "READY_TO_DELIVERY", label: "Ready to delivery" },
  { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { value: "DELIVERED", label: "Delivered" },
];

const NEXT = {
  PENDING: "CONFIRM",
  CONFIRM: "READY_TO_DELIVERY",
  READY_TO_DELIVERY: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

export const displayStatus = (status) => (status === "PLACED" || status === "PENDING_CONFIRM" || status === "PENDING" ? "PENDING" : status);

const CLAIM_NAMES = { DAMAGE: "Damage", EXPIRY: "Expiry", RETURN: "Return", OTHER: "Other" };

export const claimText = (line) => {
  const name = CLAIM_NAMES[line?.type] || "Expiry";
  return line?.type === "OTHER" && line.otherLabel ? `${name} (${line.otherLabel})` : name;
};

export const statusLabel = (status) => STATUS_OPTIONS.find((item) => item.value === displayStatus(status))?.label || "Pending";

const tones = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  CONFIRM: "border-indigo-200 bg-indigo-50 text-indigo-800",
  READY_TO_DELIVERY: "border-sky-200 bg-sky-50 text-sky-800",
  OUT_FOR_DELIVERY: "border-teal-200 bg-teal-50 text-teal-800",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const dots = {
  PENDING: "bg-amber-500",
  CONFIRM: "bg-indigo-500",
  READY_TO_DELIVERY: "bg-sky-500",
  OUT_FOR_DELIVERY: "bg-teal-500",
  DELIVERED: "bg-emerald-500",
};

export const STATUS_HEX = {
  PENDING: "#f59e0b",
  CONFIRM: "#6366f1",
  READY_TO_DELIVERY: "#0ea5e9",
  OUT_FOR_DELIVERY: "#14b8a6",
  DELIVERED: "#10b981",
};

export function StatusBadge({ status }) {
  const key = displayStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[key] || "border-slate-200 bg-slate-100 text-slate-600"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[key] || "bg-slate-400"}`} />
      {statusLabel(status)}
    </span>
  );
}

export function StatusSelect({ status, onChange, disabled }) {
  const current = displayStatus(status);
  const next = NEXT[current];
  return (
    <select
      className={`h-9 min-w-[11rem] rounded-full border px-3 text-sm font-medium ${tones[current] || "border-slate-200 bg-white text-slate-800"}`}
      value={current}
      disabled={disabled || !next}
      onChange={(event) => {
        if (event.target.value !== current) onChange(event.target.value);
      }}
    >
      {STATUS_OPTIONS.map((item) => (
        <option key={item.value} value={item.value} disabled={item.value !== current && item.value !== next}>{item.label}</option>
      ))}
    </select>
  );
}
