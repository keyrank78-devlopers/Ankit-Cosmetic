import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../../services/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Pager } from "../../components/ui/Pager";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const nowMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const roleLabel = (role) => (role ? role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—");

export function Targets() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") || nowMonth();
  const [board, setBoard] = useState({ data: [], canAssign: false, me: null });
  const [loading, setLoading] = useState(true);
  const [assignUser, setAssignUser] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const load = async (selectedMonth) => {
    const res = await api.get("/admin/targets", { params: { month: selectedMonth } });
    setBoard(res.data);
    return res.data;
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const res = await api.get("/admin/targets", { params: { month } });
        if (!cancelled) setBoard(res.data);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load targets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [month]);

  const people = board.data || [];
  const pageCount = Math.max(Math.ceil(people.length / limit), 1);
  const safePage = Math.min(page, pageCount);
  const visiblePeople = people.slice((safePage - 1) * limit, safePage * limit);
  const selfId = String(board.me?._id || "");
  const assignable = people.filter((person) => (person.status === "ACTIVE" || String(person._id) === assignUser) && String(person._id) !== selfId);
  const selected = people.find((person) => String(person._id) === assignUser);

  const choosePerson = (id) => {
    setAssignUser(id);
    const person = people.find((item) => String(item._id) === id);
    setAmount(person?.target ? String(person.target) : "");
  };

  const saveTarget = async (event) => {
    event.preventDefault();
    if (!assignUser) {
      toast.error("Choose a person");
      return;
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error("Enter the target amount");
      return;
    }
    try {
      setSaving(true);
      const res = await api.put("/admin/targets", { userId: assignUser, month, amount: Number(amount) });
      toast.success(res.data.message || "Target saved");
      await load(month);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save the target");
    } finally {
      setSaving(false);
    }
  };

  const deleteTarget = async (person) => {
    if (!window.confirm(`Delete ${person.name}'s target for this month?`)) return;
    try {
      setSaving(true);
      const res = await api.put("/admin/targets", { userId: person._id, month, amount: 0 });
      toast.success(res.data.message || "Target deleted");
      if (String(person._id) === assignUser) {
        setAssignUser("");
        setAmount("");
      }
      await load(month);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete the target");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set target</h1>
        <p className="mt-1 text-sm text-slate-500">Pick the month, choose a person from the dropdown, and set the amount. Edit or delete sits on the right of each row.</p>
      </div>

      <div className="max-w-xs">
        <label className="mb-1 block text-sm text-slate-600">Month</label>
        <Input type="month" value={month} onChange={(event) => setParams(event.target.value ? { month: event.target.value } : {})} />
      </div>

      {board.canAssign && (
        <form onSubmit={saveTarget} className="grid gap-3 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_auto] md:items-end">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Person</span>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={assignUser}
              onChange={(event) => choosePerson(event.target.value)}
            >
              <option value="">Select a person</option>
              {assignable.map((person) => (
                <option key={person._id} value={person._id}>
                  {person.name}{person.employeeId ? ` · ${person.employeeId}` : ""}{person.target ? ` · ${money.format(person.target)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Amount (₹)</span>
            <Input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100000" />
          </label>
          <Button type="submit" isLoading={saving}>{selected?.target ? "Update target" : "Save target"}</Button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Person", "Reports to", "Target", "Achieved", "Pending", "Actions"].map((heading) => (
                  <th key={heading} className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase text-slate-500 ${heading === "Actions" ? "text-right" : "text-left"}`}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">Loading targets...</td></tr>
              ) : people.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No people in this view.</td></tr>
              ) : visiblePeople.map((person) => {
                const canChange = board.canAssign && String(person._id) !== selfId;
                return (
                  <tr key={person._id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{person.name}</p>
                      <p className="text-xs text-slate-500">{roleLabel(person.role)}{person.employeeId ? ` · ${person.employeeId}` : ""}{person.status !== "ACTIVE" ? ` · ${person.status}` : ""}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{person.reportsTo || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900">{person.target ? money.format(person.target) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{money.format(person.achieved || 0)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{person.target ? money.format(person.pending || 0) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {canChange ? (
                        <div className="inline-flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => choosePerson(String(person._id))}>Edit</Button>
                          <Button type="button" size="sm" variant="outline" className="text-rose-700" disabled={saving || !person.target} onClick={() => deleteTarget(person)}>Delete</Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={safePage} pages={pageCount} limit={limit} total={people.length} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
      </div>
    </div>
  );
}
