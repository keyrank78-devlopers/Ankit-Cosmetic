import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import { Pager } from "../../components/ui/Pager";

const emptyEntry = {
  batchNo: "",
  caseSize: "",
  mfgDate: "",
  expiryDate: "",
  quantity: "",
  type: "PRODUCTION",
  note: "",
};

export function StockEntry() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState(null);
  const [entry, setEntry] = useState(emptyEntry);

  useEffect(() => {
    api.get("/public/categories/list", { params: { status: "ACTIVE", limit: 100 } })
      .then((res) => setCategories(res.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!category) {
      setSubCategories([]);
      return;
    }
    api.get("/public/subcategories/list", { params: { category, status: "ACTIVE", limit: 100 } })
      .then((res) => setSubCategories(res.data.data || []))
      .catch(() => setSubCategories([]));
  }, [category]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const res = await api.get("/public/products/list", {
          params: {
            search: debouncedSearch,
            category,
            subCategory,
            status: "ACTIVE",
            page,
            limit,
          },
        });
        setProducts(res.data.data || []);
        setTotal(res.data.pagination?.total || 0);
        setTotalPages(res.data.pagination?.pages || 1);
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [debouncedSearch, category, subCategory, page, limit]);

  const chooseProduct = (product) => {
    setSelected(product);
    setEntry(emptyEntry);
  };

  const submitEntry = async (event) => {
    event.preventDefault();
    if (!selected) {
      toast.error("Pehle list se product select karo");
      return;
    }
    try {
      setSaving(true);
      await api.post("/admin/inventory/entry", {
        productId: selected._id,
        ...entry,
        quantity: Number(entry.quantity),
      });
      toast.success("Inventory updated");
      navigate("/dashboard/inventory");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save the inventory entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/inventory")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock entry</h1>
          <p className="mt-1 text-sm text-slate-500">Pick a product from the list, then add the batch quantity. Update or delete an old entry from Stock history.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Search product name or code" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            </div>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm lg:w-44"
              value={category}
              onChange={(event) => { setCategory(event.target.value); setSubCategory(""); setPage(1); }}
            >
              <option value="">All categories</option>
              {categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100 lg:w-44"
              value={subCategory}
              disabled={!category}
              onChange={(event) => { setSubCategory(event.target.value); setPage(1); }}
            >
              <option value="">All subcategories</option>
              {subCategories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Select</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">Loading products...</td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">No products found.</td></tr>
                ) : products.map((product) => (
                  <tr key={product._id} className={cn(selected?._id === product._id && "bg-indigo-50")}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.productCode || product.productId}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {product.category?.name || "—"}
                      <p className="text-xs text-slate-400">{product.subCategory?.name}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" size="sm" variant={selected?._id === product._id ? "default" : "outline"} onClick={() => chooseProduct(product)}>
                        {selected?._id === product._id ? "Selected" : "Select"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} pages={totalPages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
          </div>
        </div>

        <form onSubmit={submitEntry} className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Batch details</h2>
            <p className="mt-1 text-sm text-slate-500">{selected ? selected.name : "Select a product from the list."}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
            <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={entry.type} disabled={saving} onChange={(event) => setEntry((prev) => ({ ...prev, type: event.target.value }))}>
              <option value="PRODUCTION">Production</option>
              <option value="RETURN">Return</option>
              <option value="DAMAGE">Damage</option>
              <option value="EXPIRY">Expiry</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Batch number</label>
            <Input value={entry.batchNo} maxLength={40} required disabled={saving} onChange={(event) => setEntry((prev) => ({ ...prev, batchNo: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Quantity</label>
            <Input type="number" min="1" step="1" value={entry.quantity} required disabled={saving} onChange={(event) => setEntry((prev) => ({ ...prev, quantity: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Case size</label>
            <Input value={entry.caseSize} placeholder="240 PCS" disabled={saving} onChange={(event) => setEntry((prev) => ({ ...prev, caseSize: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">MFG date</label>
              <Input type="date" value={entry.mfgDate} required={entry.type === "PRODUCTION"} disabled={saving} onChange={(event) => setEntry((prev) => ({ ...prev, mfgDate: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Expiry date</label>
              <Input type="date" value={entry.expiryDate} required={entry.type === "PRODUCTION"} disabled={saving} onChange={(event) => setEntry((prev) => ({ ...prev, expiryDate: event.target.value }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Note</label>
            <Input value={entry.note} maxLength={200} disabled={saving} onChange={(event) => setEntry((prev) => ({ ...prev, note: event.target.value }))} />
          </div>
          <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : "Save entry"}</Button>
        </form>
      </div>
    </div>
  );
}
