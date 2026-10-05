import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";

export function CategoryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [name, setName] = useState("");
  const [picture, setPicture] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditMode);

  useEffect(() => {
    if (isEditMode) {
      const fetchCategory = async () => {
        try {
          const res = await api.get(`/admin/categories/details/${id}`);
          const cat = res.data.data;
          setName(cat.name || "");
          if (cat.picture) {
            setPreview(cat.picture);
          }
        } catch (error) {
          toast.error("Failed to fetch category details");
        } finally {
          setIsFetching(false);
        }
      };
      fetchCategory();
    }
  }, [id, isEditMode]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPicture(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const removeFile = () => {
    setPicture(null);
    setPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");

    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("name", name);
      if (picture) {
        formData.append("picture", picture);
      }

      if (isEditMode) {
        await api.patch(`/admin/categories/update/${id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("Category updated successfully");
      } else {
        await api.post("/admin/categories/create", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("Category created successfully");
      }
      
      navigate("/dashboard/categories");
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
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/categories")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isEditMode ? "Edit Category" : "Create New Category"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isEditMode ? "Update the category's details." : "Fill in the details to add a new category."}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="divide-y divide-slate-100">
          
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category Name *</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
                disabled={isLoading} 
                placeholder="e.g. Electronics"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category Image</label>
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
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard/categories")} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[120px]">
              {isLoading ? "Saving..." : (isEditMode ? "Update Category" : "Create Category")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
