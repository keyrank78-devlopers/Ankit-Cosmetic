import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import giftService from "../../services/giftService";
import schemeService from "../../services/schemeService";
import { useAuth } from "../../context/AuthContext";
import { Pager } from "../../components/ui/Pager";

const TYPE_LABELS = {
  SLAB: "Amount slab",
  OPEN: "Open request",
  FIRST_ORDER: "First order",
};

const selectClass = "h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600";

const emptyFilters = {
  search: "",
  type: "",
  gift: "",
  minAmount: "",
  maxAmount: "",
  sort: "newest",
};

const giftName = (gift) => gift?.name || "Gift";

const describe = (scheme) => {
  if (scheme.type === "OPEN") return "Gift is chosen when a customer request is entered.";
  if (scheme.type === "FIRST_ORDER") {
    const names = (scheme.gifts || []).map(giftName).join(", ");
    return `Any first order: ${names}`;
  }
  return (scheme.slabs || [])
    .map((slab) => `₹${slab.minAmount}: ${(slab.gifts || []).map(giftName).join(", ")}`)
    .join(" · ");
};

export function Schemes() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("CREATE_SCHEMES");
  const [filters, setFilters] = useState(emptyFilters);
  const [schemes, setSchemes] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const setFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  useEffect(() => {
    giftService.getGifts({ limit: 100, sort: "name" }).then((res) => setGifts(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await schemeService.getSchemes({
          search: filters.search.trim(),
          type: filters.type,
          gift: filters.gift,
          minAmount: filters.minAmount,
          maxAmount: filters.maxAmount,
          sort: filters.sort,
          page,
          limit,
        });
        if (!cancelled) {
          setSchemes(res.data || []);
          setPages(res.pagination?.pages || 1);
          setTotal(res.pagination?.total || 0);
        }
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load schemes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [filters, page, limit]);

  const removeScheme = async (scheme) => {
    if (!window.confirm(`Delete ${scheme.name}? This cannot be undone.`)) return;
    try {
      setDeletingId(scheme._id);
      await schemeService.deleteScheme(scheme._id);
      toast.success("Scheme deleted");
      setSchemes((current) => {
        const next = current.filter((item) => item._id !== scheme._id);
        if (next.length === 0 && page > 1) setPage(page - 1);
        return next;
      });
      setTotal((count) => Math.max(0, count - 1));
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete scheme");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Schemes</h1>
          <p className="mt-1 text-sm text-slate-500">Slab, open request, and first-order schemes you have created.</p>
        </div>
        {canManage && (
          <Button onClick={() => navigate("/dashboard/schemes/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Add scheme
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={filters.search}
            onChange={(event) => setFilter("search", event.target.value)}
            placeholder="Search scheme name"
            className="pl-9"
          />
        </div>
        <select className={selectClass} value={filters.type} onChange={(event) => setFilter("type", event.target.value)}>
          <option value="">All types</option>
          <option value="SLAB">Amount slab</option>
          <option value="OPEN">Open request</option>
          <option value="FIRST_ORDER">First order</option>
        </select>
        <select className={selectClass} value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
        </select>
        <select className={selectClass} value={filters.gift} onChange={(event) => setFilter("gift", event.target.value)}>
          <option value="">All gifts</option>
          {gifts.map((gift) => (
            <option key={gift._id} value={gift._id}>{gift.name}</option>
          ))}
        </select>
        <Input type="number" min="1" step="1" value={filters.minAmount} onChange={(event) => setFilter("minAmount", event.target.value)} placeholder="Min amount" />
        <Input type="number" min="1" step="1" value={filters.maxAmount} onChange={(event) => setFilter("maxAmount", event.target.value)} placeholder="Max amount" />
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Clear filters</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-500">Loading schemes...</p>
        ) : schemes.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No schemes match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {schemes.map((scheme) => (
              <li key={scheme._id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{scheme.name}</p>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {TYPE_LABELS[scheme.type] || scheme.type}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{describe(scheme)}</p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => navigate(`/dashboard/schemes/edit/${scheme._id}`)}>Edit</Button>
                    <Button type="button" variant="destructive" size="sm" disabled={deletingId === scheme._id} onClick={() => removeScheme(scheme)}>
                      {deletingId === scheme._id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} pages={pages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
      </div>
    </div>
  );
}
