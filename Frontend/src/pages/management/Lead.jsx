import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Pager } from "../../components/ui/Pager";
import customerService from "../../services/customerService";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../utils/cn";

const stageName = { NEW: "New", ASSIGNED: "Assigned", FOLLOW_UP: "Follow-up", CONVERTED: "Converted", LOST: "Lost" };
const stageTone = {
  NEW: "bg-slate-100 text-slate-700",
  ASSIGNED: "bg-indigo-100 text-indigo-800",
  FOLLOW_UP: "bg-amber-100 text-amber-800",
  CONVERTED: "bg-emerald-100 text-emerald-800",
  LOST: "bg-rose-100 text-rose-800",
};
const resultName = { NO_ANSWER: "No answer", INTERESTED: "Interested", FOLLOW_UP: "Follow-up", NOT_INTERESTED: "Not interested" };
const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const personTitle = (person) => person?.designation?.name || (person?.role ? String(person.role).replace(/[_-]+/g, " ") : "");
const personLine = (person) => [person?.name, personTitle(person), person?.employeeId].filter(Boolean).join(" · ") || "—";

const emptyCall = { purpose: "", note: "", result: "FOLLOW_UP", nextFollowUpAt: "", nextPurpose: "" };

export function Lead() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canAssign = hasPermission("ASSIGN_LEADS");
  const canFollow = hasPermission("FOLLOW_UP_LEADS");
  const canPlace = hasPermission("PLACE_ORDERS");
  const [customer, setCustomer] = useState(null);
  const [people, setPeople] = useState([]);
  const [assignee, setAssignee] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [call, setCall] = useState(emptyCall);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCustomer = async () => {
    const res = await customerService.getCustomerById(id);
    setCustomer(res.data);
    setAssignee(res.data?.assignedTo?._id || "");
  };

  const loadFollowUps = async () => {
    const res = await customerService.getFollowUps(id, { page, limit });
    setRows(res.data || []);
    setPages(res.pagination?.pages || 1);
    setTotal(res.pagination?.total || 0);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        await loadCustomer();
        if (canAssign) {
          const res = await customerService.getAssignees();
          if (!cancelled) setPeople(res.data || []);
        }
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not open this lead");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [id, canAssign]);

  useEffect(() => {
    let cancelled = false;
    loadFollowUps().catch((error) => {
      if (!cancelled) toast.error(error.response?.data?.message || "Could not load follow-ups");
    });
    return () => { cancelled = true; };
  }, [id, page, limit]);

  const assign = async (event) => {
    event.preventDefault();
    if (!assignee) return toast.error("Choose a person");
    try {
      setSaving(true);
      const res = await customerService.assignLead(id, assignee);
      setCustomer(res.data);
      toast.success("Lead assigned");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not assign this lead");
    } finally {
      setSaving(false);
    }
  };

  const saveCall = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      const res = await customerService.addFollowUp(id, {
        purpose: call.purpose,
        note: call.note,
        result: call.result,
        nextFollowUpAt: call.result === "NOT_INTERESTED" ? undefined : call.nextFollowUpAt,
        nextPurpose: call.result === "NOT_INTERESTED" ? undefined : call.nextPurpose,
      });
      setCustomer(res.data.customer);
      setCall(emptyCall);
      setPage(1);
      if (page === 1) await loadFollowUps();
      toast.success("Follow-up saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save the follow-up");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading lead...</p>;
  if (!customer) return <p className="text-sm text-slate-500">This lead is not available.</p>;

  const address = [customer.address?.line, customer.address?.villageCity, customer.address?.district, customer.address?.state, customer.address?.pincode].filter(Boolean).join(", ");
  const needsNext = call.result !== "NOT_INTERESTED";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => navigate("/dashboard/customers")} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Customers
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{customer.retailerName}</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", stageTone[customer.leadStage] || stageTone.NEW)}>{stageName[customer.leadStage] || "New"}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{customer.firmName} · {customer.contactNo1}{customer.customerCode ? ` · ${customer.customerCode}` : ""}</p>
        </div>
        {canPlace && customer.leadStage !== "LOST" && (
          <Button type="button" onClick={() => navigate(`/dashboard/orders/new?customer=${customer._id}`)}>
            <ShoppingCart className="mr-2 h-4 w-4" /> Place order
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Shop</h2>
          <p className="mt-2 text-sm text-slate-600">{address || "No address"}</p>
          <p className="mt-2 text-sm text-slate-500">Brought by {personLine(customer.createdBy)}{customer.createdAt ? ` · ${when.format(new Date(customer.createdAt))}` : ""}</p>
          {customer.lostReason && <p className="mt-2 text-sm text-rose-700">Lost: {customer.lostReason}</p>}
          {customer.convertedAt && (
            <p className="mt-2 text-sm text-emerald-700">Converted by {personLine(customer.convertedBy?.by)} · {when.format(new Date(customer.convertedBy?.at || customer.convertedAt))}</p>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Assigned to</h2>
          {canAssign ? (
            <form onSubmit={assign} className="mt-3 space-y-3">
              <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                <option value="">Select a person</option>
                {people.map((person) => (
                  <option key={person._id} value={person._id}>{personLine(person)}</option>
                ))}
              </select>
              <Button type="submit" disabled={saving}>Save assignment</Button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-slate-600">{customer.assignedTo ? personLine(customer.assignedTo) : "Not assigned yet"}</p>
          )}
          {customer.assignedBy && (
            <p className="mt-2 text-xs text-slate-500">Assigned by {personLine(customer.assignedBy)}{customer.assignedAt ? ` · ${when.format(new Date(customer.assignedAt))}` : ""}</p>
          )}
          {customer.nextFollowUpAt && (
            <p className="mt-3 text-sm text-amber-800">Next: {when.format(new Date(customer.nextFollowUpAt))}{customer.nextPurpose ? ` · ${customer.nextPurpose}` : ""}</p>
          )}
        </section>
      </div>

      {canFollow && (
        <form onSubmit={saveCall} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Log this call</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Purpose of this call *</span>
              <Input value={call.purpose} maxLength={160} onChange={(event) => setCall((prev) => ({ ...prev, purpose: event.target.value }))} placeholder="Introduction, order discussion, payment" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">What happened *</span>
              <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={call.result} onChange={(event) => setCall((prev) => ({ ...prev, result: event.target.value }))}>
                <option value="NO_ANSWER">No answer</option>
                <option value="INTERESTED">Interested</option>
                <option value="FOLLOW_UP">Follow-up</option>
                <option value="NOT_INTERESTED">Not interested</option>
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">What was said</span>
              <textarea value={call.note} maxLength={500} onChange={(event) => setCall((prev) => ({ ...prev, note: event.target.value }))} className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Short note from the call" />
            </label>
            {needsNext && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Next follow-up *</span>
                  <Input type="datetime-local" value={call.nextFollowUpAt} onChange={(event) => setCall((prev) => ({ ...prev, nextFollowUpAt: event.target.value }))} required />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Purpose of the next call *</span>
                  <Input value={call.nextPurpose} maxLength={160} onChange={(event) => setCall((prev) => ({ ...prev, nextPurpose: event.target.value }))} placeholder="Confirm the order" required />
                </label>
              </>
            )}
          </div>
          <Button type="submit" disabled={saving}>Save follow-up</Button>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Call history</h2>
          <p className="text-xs text-slate-500">Who called, what was said, and when the next call is.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.length === 0 ? <li className="px-5 py-8 text-sm text-slate-500">No calls yet.</li> : rows.map((row) => (
            <li key={row._id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{row.purpose}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{resultName[row.result] || row.result}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{personLine(row.by)}{row.at ? ` · ${when.format(new Date(row.at))}` : ""}</p>
              {row.note && <p className="mt-2 text-sm text-slate-700">{row.note}</p>}
              {row.nextFollowUpAt && <p className="mt-2 text-sm text-amber-800">Next {when.format(new Date(row.nextFollowUpAt))}{row.nextPurpose ? ` · ${row.nextPurpose}` : ""}</p>}
            </li>
          ))}
        </ul>
        <Pager page={page} pages={pages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
      </section>
      {customer.convertedOrder && (
        <p className="text-sm text-slate-500">Order from this lead: <Link className="font-medium text-indigo-700" to={`/dashboard/orders/${customer.convertedOrder}`}>open order</Link></p>
      )}
    </div>
  );
}
