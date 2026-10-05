import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";

export function SubCategoryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditMode);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const catRes = await api.get("/public/categories/list", { params: { status: "ACTIVE", limit: 100 } });
        setCategories(catRes.data.data || []);

        if (isEditMode) {
          const res = await api.get(`/admin/subcategories/details/${id}`);
          const subcat = res.data.data;
          setName(subcat.name || "");
          setCategory(subcat.category?._id || subcat.category || "");
          if (subcat.image) {
            setPreview(subcat.image);
          }
        }
      } catch (error) {
        toast.error("Failed to fetch initial data");
      } finally {
        setIsFetching(false);
      }
    };
    fetchInitialData();
  }, [id, isEditMode]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const removeFile = () => {
    setImage(null);
    setPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    if (!category) return toast.error("Parent category is required");

    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("name", name);
      formData.append("category", category);
      if (image) {
        formData.append("image", image);
      }

      if (isEditMode) {
        await api.patch(`/admin/subcategories/update/${id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("SubCategory updated successfully");
      } else {
        await api.post("/admin/subcategories/create", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("SubCategory created successfully");
      }
      
      navigate("/dashboard/subcategories");
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return <div className="p-8 text-center text-slate-500">Loading data...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/subcategories")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isEditMode ? "Edit SubCategory" : "Create New SubCategory"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isEditMode ? "Update the subcategory's details." : "Fill in the details to add a new subcategory."}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="divide-y divide-slate-100">
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SubCategory Name *</label>
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  required 
                  disabled={isLoading} 
                  placeholder="e.g. Smartphones"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Parent Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat._id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">SubCategory Image</label>
              {preview ? (
                <div className="relative inline-block">
                  <img src={preview} alt="Preview" className="h-40 w-40 object-cover rounded-lg border border-slate-200" />
                  <button 
                    type="button"
                    onClick={removeFile}
                    className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-full hover:bg-red-200 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex justify-center rounded-lg border border-dashed border-slate-300 px-6 py-10 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => document.getElementById("file-upload").click()}>
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
                    <div className="mt-4 flex text-sm leading-6 text-slate-600 justify-center">
                      <span className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500">
                        <span>Upload a file</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-slate-500 mt-2">PNG, JPG, GIF up to 5MB</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="p-6 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard/subcategories")} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[120px]">
              {isLoading ? "Saving..." : (isEditMode ? "Update SubCategory" : "Create SubCategory")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
