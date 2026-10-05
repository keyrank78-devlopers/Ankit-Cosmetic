import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import giftService from "../../services/giftService";
import { useAuth } from "../../context/AuthContext";
import { Pager } from "../../components/ui/Pager";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const selectClass = "h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600";

const emptyFilters = {
  search: "",
  stockStatus: "",
  minPrice: "",
  maxPrice: "",
  minStock: "",
  maxStock: "",
  sort: "name",
};

export function Gifts() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("CREATE_GIFTS");
  const [filters, setFilters] = useState(emptyFilters);
  const [gifts, setGifts] = useState([]);
  const [stockDrafts, setStockDrafts] = useState({});
  const [savingStockId, setSavingStockId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const setFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const loadGifts = async (current) => {
    const res = await giftService.getGifts({
      search: current.search.trim(),
      stockStatus: current.stockStatus,
      minPrice: current.minPrice,
      maxPrice: current.maxPrice,
      minStock: current.minStock,
      maxStock: current.maxStock,
      sort: current.sort,
      page,
      limit,
    });
    const rows = res.data || [];
    setGifts(rows);
    setPages(res.pagination?.pages || 1);
    setTotal(res.pagination?.total || 0);
    setStockDrafts(Object.fromEntries(rows.map((gift) => [gift._id, String(gift.stock ?? 0)])));
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        await loadGifts(filters);
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Failed to load gifts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [filters, page, limit]);

  const removeGift = async (gift) => {
    if (!window.confirm(`Delete ${gift.name}? This cannot be undone.`)) return;
    try {
      setDeletingId(gift._id);
      await giftService.deleteGift(gift._id);
      toast.success("Gift deleted");
      await loadGifts(filters);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete gift");
    } finally {
      setDeletingId("");
    }
  };

  const saveStock = async (gift) => {
    const stock = String(stockDrafts[gift._id] ?? "").trim();
    if (!/^\d+$/.test(stock)) {
      toast.error("Stock must be a whole number, 0 or more");
      return;
    }
    try {
      setSavingStockId(gift._id);
      await giftService.updateStock(gift._id, Number(stock));
      toast.success(Number(stock) > 0 ? "Gift stock updated" : "Gift is out of stock");
      await loadGifts(filters);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update stock");
    } finally {
      setSavingStockId("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gifts</h1>
          <p className="mt-1 text-sm text-slate-500">Gifts saved here can be used in any scheme.</p>
        </div>
        {canManage && (
          <Button onClick={() => navigate("/dashboard/gifts/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Add gift
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={filters.search}
            onChange={(event) => setFilter("search", event.target.value)}
            placeholder="Search name or description"
            className="pl-9"
          />
        </div>
        <select className={selectClass} value={filters.stockStatus} onChange={(event) => setFilter("stockStatus", event.target.value)}>
          <option value="">All stock</option>
          <option value="IN_STOCK">In stock</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
        </select>
        <select className={selectClass} value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}>
          <option value="name">Name</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="stock_asc">Stock: low to high</option>
          <option value="stock_desc">Stock: high to low</option>
        </select>
        <Input type="number" min="0" step="0.01" value={filters.minPrice} onChange={(event) => setFilter("minPrice", event.target.value)} placeholder="Min price" />
        <Input type="number" min="0" step="0.01" value={filters.maxPrice} onChange={(event) => setFilter("maxPrice", event.target.value)} placeholder="Max price" />
        <Input type="number" min="0" step="1" value={filters.minStock} onChange={(event) => setFilter("minStock", event.target.value)} placeholder="Min stock" />
        <Input type="number" min="0" step="1" value={filters.maxStock} onChange={(event) => setFilter("maxStock", event.target.value)} placeholder="Max stock" />
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="button" variant="outline" size="sm" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Clear filters</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-500">Loading gifts...</p>
        ) : gifts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No gifts match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {gifts.map((gift) => {
              const inStock = Number(gift.stock) > 0;
              return (
                <li key={gift._id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center">
                  {gift.image ? (
                    <img src={gift.image} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">No image</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{gift.name}</p>
                      <span className="text-sm text-slate-700">{gift.price != null ? money.format(gift.price) : "—"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inStock ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                        {inStock ? "In stock" : "Out of stock"}
                      </span>
                    </div>
                    {gift.description ? <p className="mt-1 text-sm text-slate-500">{gift.description}</p> : null}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={stockDrafts[gift._id] ?? ""}
                        onChange={(event) => setStockDrafts((current) => ({ ...current, [gift._id]: event.target.value }))}
                        className="w-24"
                        aria-label={`Stock for ${gift.name}`}
                      />
                      <Button type="button" variant="outline" size="sm" disabled={savingStockId === gift._id} onClick={() => saveStock(gift)}>
                        {savingStockId === gift._id ? "Saving..." : "Update stock"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => navigate(`/dashboard/gifts/edit/${gift._id}`)}>Edit</Button>
                      <Button type="button" variant="destructive" size="sm" disabled={deletingId === gift._id} onClick={() => removeGift(gift)}>
                        {deletingId === gift._id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pager page={page} pages={pages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
      </div>
    </div>
  );
}
