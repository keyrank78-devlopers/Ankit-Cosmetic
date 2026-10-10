import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShoppingCart, UserPlus } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import toast from "react-hot-toast";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import orderService from "../services/orderService";
import { StatusBadge, STATUS_HEX } from "./orders/orderStatus.jsx";
import { paymentLabel } from "../utils/payment";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const moneyExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const statusFill = (item, index) => STATUS_HEX[item.key] || ["#34d399", "#38bdf8", "#fbbf24", "#a78bfa"][index % 4];

const empty = {
  customers: 0,
  products: 0,
  activeProducts: 0,
  today: { orders: 0, total: 0, gstTotal: 0 },
  month: { orders: 0, total: 0, gstTotal: 0 },
  days: [],
  statuses: [],
  payments: [],
  recent: [],
  lowStock: { total: 0, rows: [] },
  targets: null,
  claims: null,
  dispatched: { orders: 0, total: 0 },
  paymentDues: null,
};

const dayLabel = (value) => {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(year, month - 1, day));
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="mt-0.5 text-slate-600">
          {item.name}: {item.dataKey === "orders" ? item.value : moneyExact.format(item.value || 0)}
        </p>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow-sm backdrop-blur-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Dashboard() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.userType === "ADMIN";
  const designationName = user?.designation?.name || user?.role || user?.userType || "Team Member";
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await orderService.dashboard();
        if (!cancelled) {
          setData({
            ...empty,
            ...res.data,
            today: { ...empty.today, ...res.data?.today },
            month: { ...empty.month, ...res.data?.month },
          });
        }
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const currentDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const lineData = (data.days || []).map((day) => ({ ...day, label: dayLabel(day.date) }));
  const barData = lineData.slice(-14);
  const pieData = (data.statuses || []).filter((item) => item.orders > 0);
  const show = (value) => (loading ? "…" : value);

  const seeRevenue = hasPermission("VIEW_REVENUE");
  const seeOrders = hasPermission(["VIEW_ORDERS", "PLACE_ORDERS"]);
  const seeCustomers = hasPermission("VIEW_CUSTOMERS");
  const seeStock = hasPermission(["VIEW_INVENTORY", "VIEW_PRODUCTS", "EDIT_PRODUCTS", "MANAGE_INVENTORY"]);
  const seeTargets = hasPermission(["VIEW_TARGETS", "MANAGE_TARGETS"]);
  const seeClaims = hasPermission("VIEW_REIMBURSEMENTS");
  const cards = [
    seeRevenue && { label: "Today's revenue", value: show(money.format(data.today.total || 0)), hint: `GST ${moneyExact.format(data.today.gstTotal || 0)}`, href: "/dashboard/revenue", accent: "from-indigo-500 to-violet-400", chip: "bg-indigo-100 text-indigo-800" },
    seeOrders && { label: "Today's orders", value: show(data.today.orders || 0), hint: "Placed today", href: "/dashboard/orders", accent: "from-sky-500 to-cyan-400", chip: "bg-sky-100 text-sky-800" },
    seeRevenue && { label: "This month", value: show(money.format(data.month.total || 0)), hint: `${data.month.orders || 0} orders`, href: "/dashboard/revenue", accent: "from-amber-400 to-orange-400", chip: "bg-amber-100 text-amber-800" },
    seeOrders && { label: "Dispatched", value: show(money.format(data.dispatched?.total || 0)), hint: `${data.dispatched?.orders || 0} out or delivered`, href: "/dashboard/orders", accent: "from-teal-500 to-emerald-400", chip: "bg-teal-100 text-teal-800" },
    seeCustomers && { label: "Customers", value: show(data.customers || 0), hint: "Customer records", href: "/dashboard/customers", accent: "from-violet-500 to-fuchsia-400", chip: "bg-violet-100 text-violet-800" },
    seeStock && { label: "Products", value: show(data.products || 0), hint: `${data.lowStock?.total || 0} at or below alert`, href: "/dashboard/products", accent: "from-rose-400 to-orange-400", chip: "bg-rose-100 text-rose-800" },
  ].filter(Boolean);

  return (
    <div className="-mx-4 -my-8 min-h-full px-4 py-8 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-800 to-violet-600 text-white shadow-sm">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">Overview</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{greeting()}, {user?.name || "User"}</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-medium">{designationName}</span>
              </div>
              <p className="mt-1 text-sm text-indigo-100">{currentDate}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => navigate("/dashboard/customers?new=1")}>
                <UserPlus className="mr-2 h-4 w-4" /> Add customer
              </Button>
              <Button type="button" className="bg-white text-indigo-800 hover:bg-indigo-50" onClick={() => navigate("/dashboard/orders/new")}>
                <ShoppingCart className="mr-2 h-4 w-4" /> Place order
              </Button>
              {isAdmin && (
                <Button type="button" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => navigate("/dashboard/permissions")}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Permissions
                </Button>
              )}
            </div>
          </div>
        </div>

        {seeOrders && (data.paymentDues?.days || []).length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Payments due</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{money.format(data.paymentDues.todayAmount || 0)} today</p>
                {data.paymentDues.overdueAmount > 0 && (
                  <p className="text-sm font-medium text-amber-800">{money.format(data.paymentDues.overdueAmount)} is overdue</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {data.paymentDues.days.map((day) => {
                const state = day.date === data.paymentDues.today ? "today" : day.date < data.paymentDues.today ? "overdue" : "upcoming";
                return (
                  <div key={day.date} className={`min-w-36 rounded-xl border bg-white px-3 py-2 ${state === "today" ? "border-indigo-300" : state === "overdue" ? "border-amber-300" : "border-slate-200"}`}>
                    <p className="text-xs text-slate-500">{dayLabel(day.date)}{state === "today" ? " · Today" : state === "overdue" ? " · Overdue" : ""}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{money.format(day.amount || 0)}</p>
                    <p className="text-xs text-slate-500">{day.count} {day.count === 1 ? "payment" : "payments"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => navigate(card.href)}
              className="overflow-hidden rounded-2xl border border-indigo-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`block h-1.5 bg-gradient-to-r ${card.accent}`} />
              <span className="block p-5">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${card.chip}`}>{card.label}</span>
                <span className="mt-3 block text-2xl font-semibold text-slate-900">{card.value}</span>
                <span className="mt-1 block text-xs text-slate-500">{card.hint}</span>
              </span>
            </button>
          ))}
        </div>

        {(seeTargets || seeStock || seeClaims) && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {seeTargets && (
              <Panel title="Sales targets" subtitle="Confirmed sales count as soon as the order is confirmed" action={<button type="button" onClick={() => navigate("/dashboard/targets/report")} className="text-sm font-medium text-indigo-700">Report</button>}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs text-indigo-700">Confirmed</p><p className="mt-1 text-lg font-semibold text-slate-900">{money.format(data.targets?.achieved || 0)}</p></div>
                  <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Targets set</p><p className="mt-1 text-lg font-semibold text-slate-900">{data.targets?.people || 0}</p></div>
                  <div className="rounded-xl bg-rose-50 p-3"><p className="text-xs text-rose-700">Short</p><p className="mt-1 text-lg font-semibold text-slate-900">{data.targets?.short || 0}</p></div>
                  <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Over target</p><p className="mt-1 text-lg font-semibold text-slate-900">{data.targets?.over || 0}</p></div>
                </div>
                <ul className="mt-3 space-y-2">
                  {(data.targets?.behind || []).length === 0 ? <li className="text-sm text-slate-500">Nobody is short of their target.</li> : data.targets.behind.map((person) => (
                    <li key={person.name} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{person.name}</span>
                      <span className="font-medium text-slate-900">{money.format(person.pending || 0)} left</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {seeStock && (
              <Panel title="Low stock" subtitle="At or below each product's alert level" action={<button type="button" onClick={() => navigate("/dashboard/products")} className="text-sm font-medium text-indigo-700">Products</button>}>
                {(data.lowStock?.rows || []).length === 0 ? <p className="text-sm text-slate-500">No product is at the alert level.</p> : (
                  <ul className="space-y-2">
                    {data.lowStock.rows.map((product) => (
                      <li key={product._id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-slate-800">{product.name}</span>
                        <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">{product.stock ?? 0} / {product.lowStockAt ?? 10}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {seeClaims && (
              <Panel title="Returns and claims" subtitle="A return goes back into sellable stock. Damage, expiry, and missing stay out of it. What you give still comes out of main stock" action={<button type="button" onClick={() => navigate("/dashboard/inventory/expiry")} className="text-sm font-medium text-indigo-700">Expiry stock</button>}>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Return", data.claims?.RETURN, "bg-sky-50 text-sky-800"],
                    ["Damage", data.claims?.DAMAGE, "bg-rose-50 text-rose-800"],
                    ["Expiry", data.claims?.EXPIRY, "bg-amber-50 text-amber-800"],
                    ["Missing", data.claims?.MISSING, "bg-violet-50 text-violet-800"],
                  ].map(([label, quantity, tone]) => (
                    <div key={label} className={`rounded-xl p-3 ${tone}`}>
                      <p className="text-xs">{label}</p>
                      <p className="mt-1 text-lg font-semibold">{quantity || 0}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}

        {(seeRevenue || seeOrders) && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {seeRevenue && (
          <Panel title="Revenue" subtitle="Last 30 days" className={seeOrders ? "xl:col-span-2" : "xl:col-span-3"}>
            <div className="mb-2 flex gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-600" /> Revenue</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" /> GST</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineData}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="gstFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="total" name="Revenue" stroke="#4f46e5" strokeWidth={2} fill="url(#revenueFill)" />
                  <Area type="monotone" dataKey="gstTotal" name="GST" stroke="#a78bfa" strokeWidth={2} fill="url(#gstFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          )}

          {seeOrders && (
          <Panel title="Order status" subtitle="All placed orders">
            <div className="h-52">
              {pieData.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl bg-indigo-50/60 text-sm text-slate-500">No placed orders yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="orders" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={3}>
                      {pieData.map((item, index) => <Cell key={item.key} fill={statusFill(item, index)} stroke="#ffffff" />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {(data.statuses || []).map((item, index) => (
                <div key={item.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusFill(item, index) }} />
                    {item.name}
                  </span>
                  <span className="font-medium text-slate-900">{item.orders}</span>
                </div>
              ))}
            </div>
          </Panel>
          )}
        </div>
        )}

        {seeOrders && (
        <Panel title="Daily orders" subtitle="Last 14 days">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={32} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="orders" name="Orders" fill="#818cf8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        )}

        {seeOrders && (
        <Panel
          title="Recent orders"
          subtitle="Latest placed orders"
          action={<button type="button" onClick={() => navigate("/dashboard/orders")} className="text-sm font-medium text-indigo-700 hover:text-indigo-900">View all</button>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-indigo-50/80">
                <tr>
                  {["Order id", "Customer", "Status", "Payment", "Amount"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-indigo-800">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-50">
                {loading ? (
                  <tr><td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-500">Loading dashboard...</td></tr>
                ) : data.recent.length === 0 ? (
                  <tr><td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-500">No orders yet. Place the first order from the button above.</td></tr>
                ) : data.recent.map((order) => (
                  <tr key={order._id} className="cursor-pointer hover:bg-indigo-50/50" onClick={() => navigate(`/dashboard/orders/${order._id}`)}>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{order.orderCode || "—"}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-700">{order.customerName || "—"}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-700">{paymentLabel(order)}</td>
                    <td className="px-4 py-3.5 text-sm font-medium text-slate-900">{moneyExact.format(order.total || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
