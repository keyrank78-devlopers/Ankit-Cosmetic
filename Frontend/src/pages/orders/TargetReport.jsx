import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../services/api";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "./orderStatus.jsx";
import { Pager, pageSize } from "../../components/ui/Pager";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const nowMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

export function TargetReport() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") || nowMonth();
  const userId = params.get("user") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);
  const limit = pageSize(params.get("limit"), 20);
  const [search, setSearch] = useState(params.get("search") || "");
  const [people, setPeople] = useState([]);
  const [me, setMe] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

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
        const res = await api.get("/admin/targets", { params: { month } });
        if (cancelled) return;
        setPeople(res.data.data || []);
        setMe(res.data.me || null);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load targets");
      }
    };
    load();
    return () => { cancelled = true; };
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get("/admin/targets/orders", {
          params: { month, userId: userId || undefined, search: params.get("search") || undefined, page, limit },
        });
        if (cancelled) return;
        setOrders(res.data.data || []);
        setTotal(res.data.pagination?.total || 0);
        setPages(res.data.pagination?.pages || 1);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [month, userId, page, params]);

  const setQuery = (updates) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    next.delete("page");
    setParams(next);
  };

  const focused = userId ? people.find((person) => String(person._id) === userId) : me;
  const confirmedSales = people.reduce((sum, person) => sum + (person.ownAchieved || 0), 0);
  const cards = focused
    ? [
        { label: "Target", value: money.format(focused.target || 0), hint: focused.name },
        { label: "Achieved", value: money.format(focused.achieved || 0), hint: "Counts from confirm, including the team" },
        { label: "Pending", value: money.format(focused.pending || 0), hint: "Still left on this target" },
        { label: "Over target", value: money.format(focused.extra || 0), hint: `Own confirmed sale ${money.format(focused.ownAchieved || 0)}` },
      ]
    : [
        { label: "Confirmed sales", value: money.format(confirmedSales), hint: "Every confirmed order this month" },
        { label: "Targets given", value: String(people.filter((person) => person.target > 0).length), hint: money.format(people.reduce((sum, person) => sum + (person.target || 0), 0)) },
        { label: "Short of target", value: String(people.filter((person) => person.target > 0 && person.pending > 0).length), hint: "People still below their target" },
        { label: "Over target", value: String(people.filter((person) => person.extra > 0).length), hint: "People who crossed their target" },
      ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Target report</h1>
        <p className="mt-1 text-sm text-slate-500">Confirmed orders count toward the target immediately. Pick a person from the dropdown to see their team.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">{card.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Month</span>
          <Input type="month" value={month} onChange={(event) => setQuery({ month: event.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Person</span>
          <select
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={userId}
            onChange={(event) => setQuery({ user: event.target.value })}
          >
            <option value="">All people</option>
            {people.map((person) => (
              <option key={person._id} value={person._id}>{person.name}{person.employeeId ? ` · ${person.employeeId}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Search</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Order, customer, or person" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Confirmed", "Order", "Customer", "Placed by", "Items", "Amount", "Status"].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Loading orders...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No confirmed orders for this month.</td></tr>
              ) : orders.map((order) => (
                <tr key={order._id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{order.at ? when.format(new Date(order.at)) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <Link className="font-medium text-indigo-700 hover:underline" to={`/dashboard/orders/${order._id}`}>{order.orderCode || "Order"}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm text-slate-900">{order.customerName || "Customer"}</p>
                    <p className="text-xs text-slate-500">{order.customerCode}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-sm text-slate-900">{order.placedBy || "—"}</p>
                    <p className="text-xs text-slate-500">{order.employeeId}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-sm text-slate-600">{order.items || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{money.format(order.total || 0)}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={page}
          pages={pages}
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
