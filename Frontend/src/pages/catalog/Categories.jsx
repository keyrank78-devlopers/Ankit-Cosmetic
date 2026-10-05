import { useState, useEffect } from "react";
import { Plus, Search, Edit2, ShieldOff, Shield } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Pager } from "../../components/ui/Pager";

export function Categories() {
  const { hasPermission } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get("/public/categories/list", {
        params: { search, status: statusFilter, page, limit }
      });
      setCategories(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
      setTotalPages(res.data.pagination?.pages || 1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [search, statusFilter, page, limit]);

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await api.patch(`/admin/categories/status/${id}`, { status: newStatus });
      toast.success("Category status updated");
      fetchCategories();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Categories</h1>
          <p className="text-sm text-slate-500 mt-1">Manage product categories for your catalog.</p>
        </div>
        {hasPermission("MANAGE_CATEGORIES") && (
          <Button onClick={() => navigate("/dashboard/categories/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search by name..." 
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        
        <select 
          className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent min-w-[150px]"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Image</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-slate-500">Loading categories...</td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-slate-500">No categories found.</td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr key={cat._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {cat.picture ? (
                        <img src={cat.picture} alt={cat.name} className="h-10 w-10 rounded-md object-cover border border-slate-200" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center border border-slate-200">
                          <span className="text-xs text-slate-400">No img</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">{cat.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        cat.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      )}>
                        {cat.status || "ACTIVE"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {hasPermission("MANAGE_CATEGORIES") && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/categories/edit/${cat._id}`)} title="Edit">
                              <Edit2 className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleToggleStatus(cat._id, cat.status || "ACTIVE")}
                              title={cat.status === "ACTIVE" || !cat.status ? "Deactivate" : "Activate"}
                            >
                              {cat.status === "ACTIVE" || !cat.status ? (
                                <ShieldOff className="h-4 w-4 text-red-500 hover:text-red-700" />
                              ) : (
                                <Shield className="h-4 w-4 text-green-500 hover:text-green-700" />
                              )}
                            </Button>
                          </>
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
