import { useState, useEffect } from "react";
import { Plus, Search, Edit2, ShieldOff, Shield, Eye } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Pager } from "../../components/ui/Pager";

export function Products() {
  const { hasPermission } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  const navigate = useNavigate();

  const fetchFiltersData = async () => {
    try {
      const catRes = await api.get("/public/categories/list", { params: { limit: 100 } });
      setCategories(catRes.data.data || []);
      
      const subCatRes = await api.get("/public/subcategories/list", { params: { limit: 200 } });
      setSubCategories(subCatRes.data.data || []);
    } catch (error) {
      console.error("Error fetching filter data", error);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get("/public/products/list", {
        params: { 
          search, 
          status: statusFilter,
          stockStatus: stockFilter,
          category: categoryFilter, 
          subCategory: subCategoryFilter,
          page, 
          limit 
        }
      });
      setProducts(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
      setTotalPages(res.data.pagination?.pages || 1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiltersData();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [search, statusFilter, stockFilter, categoryFilter, subCategoryFilter, page, limit]);

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await api.patch(`/admin/products/status/${id}`, { status: newStatus });
      toast.success("Product status updated");
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    }
  };

  const filteredSubCategories = categoryFilter 
    ? subCategories.filter(sc => (sc.category?._id || sc.category) === categoryFilter)
    : subCategories;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Products</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your product inventory and catalog.</p>
        </div>
        {hasPermission("CREATE_PRODUCTS") && (
          <Button onClick={() => navigate("/dashboard/products/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search products..." 
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        
        <select 
          className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent min-w-[150px]"
          value={categoryFilter}
          onChange={(e) => { 
            setCategoryFilter(e.target.value); 
            setSubCategoryFilter(""); 
            setPage(1); 
          }}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>

        <select 
          className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent min-w-[150px]"
          value={subCategoryFilter}
          onChange={(e) => { setSubCategoryFilter(e.target.value); setPage(1); }}
        >
          <option value="">All SubCategories</option>
          {filteredSubCategories.map(sc => (
            <option key={sc._id} value={sc._id}>{sc.name}</option>
          ))}
        </select>

        <select 
          className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent min-w-[150px]"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>

        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent min-w-[150px]"
          value={stockFilter}
          onChange={(e) => { setStockFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Stock</option>
          <option value="IN_STOCK">In Stock</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Pricing</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">Loading products...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">No products found.</td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.mainImage ? (
                          <img src={product.mainImage} alt={product.name} className="h-10 w-10 rounded-md object-cover border border-slate-200" />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center border border-slate-200">
                            <span className="text-xs text-slate-400">No img</span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-slate-900">{product.name}</div>
                          <div className="text-xs text-slate-500">
                            {product.productCode || "No code"} · ID: {product.productId}
                            {product.gstPercent != null ? ` · GST ${product.gstPercent}%` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 font-medium">₹{product.sellPrice}</div>
                      <div className="text-xs text-slate-500 line-through">₹{product.mrp}</div>
                      {(product.minSalesPrice != null || product.maxSalesPrice != null) && (
                        <div className="text-xs text-slate-500">
                          Sale {product.minSalesPrice != null ? `₹${product.minSalesPrice}` : "—"} – {product.maxSalesPrice != null ? `₹${product.maxSalesPrice}` : "—"}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900">{product.category?.name || "-"}</div>
                      <div className="text-xs text-slate-500">{product.subCategory?.name || "-"}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">{product.stock ?? 0}</div>
                      {(() => {
                        const stock = product.stock ?? 0;
                        const alertAt = product.lowStockAt ?? 10;
                        const out = stock <= 0;
                        const low = !out && stock <= alertAt;
                        return (
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            out ? "bg-amber-100 text-amber-800" : low ? "bg-rose-100 text-rose-800" : "bg-indigo-100 text-indigo-800"
                          )}>
                            {out ? "Out of Stock" : low ? "Low stock" : "In Stock"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        product.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      )}>
                        {product.status || "ACTIVE"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/products/view/${product._id}`)} title="View">
                          <Eye className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                        </Button>
                        {hasPermission("EDIT_PRODUCTS") && (
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/products/edit/${product._id}`)} title="Edit">
                            <Edit2 className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                          </Button>
                        )}
                        {hasPermission("DELETE_PRODUCTS") && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleToggleStatus(product._id, product.status || "ACTIVE")}
                            title={product.status === "ACTIVE" || !product.status ? "Deactivate" : "Activate"}
                          >
                            {product.status === "ACTIVE" || !product.status ? (
                              <ShieldOff className="h-4 w-4 text-red-500 hover:text-red-700" />
                            ) : (
                              <Shield className="h-4 w-4 text-green-500 hover:text-green-700" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <Pager page={page} pages={totalPages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
      </div>
    </div>
  );
}
