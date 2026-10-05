import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, X, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";

export function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [formData, setFormData] = useState({
    name: "",
    productCode: "",
    gstPercent: "",
    description: "",
    mrp: "",
    sellPrice: "",
    minSalesPrice: "",
    maxSalesPrice: "",
    stock: "0",
    lowStockAt: "10",
    category: "",
    subCategory: "",
    metaTitle: "",
    metaDescription: "",
    metaKeyword: "",
    variants: [],
  });

  const [mainImage, setMainImage] = useState(null);
  const [mainImagePreview, setMainImagePreview] = useState(null);
  const [otherImages, setOtherImages] = useState([]); // { file: File, preview: string }
  const [existingOtherImages, setExistingOtherImages] = useState([]); // URLs

  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [filteredSubCategories, setFilteredSubCategories] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditMode);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [catRes, subCatRes] = await Promise.all([
          api.get("/public/categories/list", { params: { status: "ACTIVE", limit: 100 } }),
          api.get("/public/subcategories/list", { params: { status: "ACTIVE", limit: 200 } })
        ]);
        
        setCategories(catRes.data.data || []);
        const allSubCats = subCatRes.data.data || [];
        setSubCategories(allSubCats);

        if (isEditMode) {
          const res = await api.get(`/public/products/details/${id}`);
          const product = res.data.data;
          
          setFormData({
            name: product.name || "",
            productCode: product.productCode || "",
            gstPercent: product.gstPercent ?? "",
            description: product.description || "",
            mrp: product.mrp || "",
            sellPrice: product.sellPrice || "",
            minSalesPrice: product.minSalesPrice ?? "",
            maxSalesPrice: product.maxSalesPrice ?? "",
            stock: product.stock ?? 0,
            lowStockAt: product.lowStockAt ?? 10,
            category: product.category?._id || product.category || "",
            subCategory: product.subCategory?._id || product.subCategory || "",
            metaTitle: product.metaTitle || "",
            metaDescription: product.metaDescription || "",
            metaKeyword: product.metaKeyword || "",
            variants: product.variants || [],
          });

          if (product.mainImage) {
            setMainImagePreview(product.mainImage);
          }
          if (product.otherImages && product.otherImages.length > 0) {
            setExistingOtherImages(product.otherImages);
          }
          
          // filter subcategories based on the fetched product category
          if (product.category) {
            const catId = product.category?._id || product.category;
            setFilteredSubCategories(allSubCats.filter(sc => (sc.category?._id || sc.category) === catId));
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

  // Handle category change to filter subcategories
  useEffect(() => {
    if (formData.category) {
      setFilteredSubCategories(subCategories.filter(sc => (sc.category?._id || sc.category) === formData.category));
    } else {
      setFilteredSubCategories([]);
    }
  }, [formData.category, subCategories]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // reset subcategory if category changes
      ...(name === "category" ? { subCategory: "" } : {})
    }));
  };

  const handleMainImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMainImage(file);
      setMainImagePreview(URL.createObjectURL(file));
    }
  };

  const handleOtherImagesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + otherImages.length + existingOtherImages.length > 5) {
      return toast.error("Maximum 5 other images allowed");
    }
    
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    
    setOtherImages(prev => [...prev, ...newImages]);
  };

  const removeOtherImage = (index) => {
    setOtherImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingOtherImage = (url) => {
    setExistingOtherImages(prev => prev.filter(img => img !== url));
  };

  // Variants handlers
  const addVariant = () => {
    setFormData(prev => ({
      ...prev,
      variants: [...prev.variants, { key: "", value: "" }]
    }));
  };

  const updateVariant = (index, field, value) => {
    const newVariants = [...formData.variants];
    newVariants[index][field] = value;
    setFormData(prev => ({ ...prev, variants: newVariants }));
  };

  const removeVariant = (index) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error("Name is required");
    if (!formData.productCode.trim()) return toast.error("Product code is required");
    const gst = Number(formData.gstPercent);
    if (formData.gstPercent === "" || !Number.isFinite(gst) || gst < 0 || gst > 100) {
      return toast.error("GST percent must be between 0 and 100");
    }
    if (!formData.category) return toast.error("Category is required");
    if (!formData.subCategory) return toast.error("SubCategory is required");
    if (!formData.mrp || !formData.sellPrice) return toast.error("Pricing is required");
    if (formData.stock === "" || Number(formData.stock) < 0 || !Number.isInteger(Number(formData.stock))) {
      return toast.error("Stock must be a whole number, 0 or more");
    }
    if (formData.lowStockAt === "" || Number(formData.lowStockAt) < 0 || !Number.isInteger(Number(formData.lowStockAt)) || Number(formData.lowStockAt) > 1000000) {
      return toast.error("Low stock alert must be a whole number, 0 or more");
    }
    const minSales = formData.minSalesPrice === "" ? null : Number(formData.minSalesPrice);
    const maxSales = formData.maxSalesPrice === "" ? null : Number(formData.maxSalesPrice);
    if ((minSales != null && minSales < 0) || (maxSales != null && maxSales < 0)) {
      return toast.error("Min and max sales price must be 0 or more");
    }
    if (minSales != null && maxSales != null && minSales > maxSales) {
      return toast.error("Min sales price cannot be greater than max sales price");
    }
    if (minSales != null && minSales > Number(formData.sellPrice)) {
      return toast.error("Min sales price cannot be greater than selling price");
    }
    if (maxSales != null && maxSales < Number(formData.sellPrice)) {
      return toast.error("Max sales price cannot be less than selling price");
    }
    
    if (!isEditMode && !mainImage) {
      return toast.error("Main image is required for new products");
    }

    try {
      setIsLoading(true);
      const submitData = new FormData();
      submitData.append("name", formData.name);
      submitData.append("productCode", formData.productCode.trim());
      submitData.append("gstPercent", formData.gstPercent);
      submitData.append("description", formData.description);
      submitData.append("mrp", formData.mrp);
      submitData.append("sellPrice", formData.sellPrice);
      submitData.append("minSalesPrice", formData.minSalesPrice);
      submitData.append("maxSalesPrice", formData.maxSalesPrice);
      submitData.append("stock", formData.stock);
      submitData.append("lowStockAt", formData.lowStockAt);
      submitData.append("category", formData.category);
      submitData.append("subCategory", formData.subCategory);
      submitData.append("metaTitle", formData.metaTitle);
      submitData.append("metaDescription", formData.metaDescription);
      submitData.append("metaKeyword", formData.metaKeyword);
      submitData.append("variants", JSON.stringify(formData.variants));

      if (mainImage) {
        submitData.append("mainImage", mainImage);
      }
      
      otherImages.forEach(img => {
        submitData.append("otherImages", img.file);
      });
      
      if (isEditMode) {
        submitData.append("existingOtherImages", JSON.stringify(existingOtherImages));
        await api.patch(`/admin/products/update/${id}`, submitData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("Product updated successfully");
      } else {
        await api.post("/admin/products/create", submitData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("Product created successfully");
      }
      
      navigate("/dashboard/products");
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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/products")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isEditMode ? "Edit Product" : "Create New Product"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isEditMode ? "Update the product details, images, and variants." : "Add a new product to your catalog."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Basic Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-medium text-slate-900">Basic Information</h3>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Product Name *</label>
              <Input name="name" value={formData.name} onChange={handleChange} required disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product Code *</label>
              <Input name="productCode" value={formData.productCode} onChange={handleChange} required disabled={isLoading} placeholder="e.g. CRM-LIP-01" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">GST % *</label>
              <Input name="gstPercent" type="number" min="0" max="100" step="0.01" value={formData.gstPercent} onChange={handleChange} required disabled={isLoading} placeholder="18" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">MRP (₹) *</label>
              <Input name="mrp" type="number" min="0" value={formData.mrp} onChange={handleChange} required disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price (₹) *</label>
              <Input name="sellPrice" type="number" min="0" value={formData.sellPrice} onChange={handleChange} required disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Sales Price (₹)</label>
              <Input name="minSalesPrice" type="number" min="0" value={formData.minSalesPrice} onChange={handleChange} disabled={isLoading} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Sales Price (₹)</label>
              <Input name="maxSalesPrice" type="number" min="0" value={formData.maxSalesPrice} onChange={handleChange} disabled={isLoading} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stock *</label>
              <Input name="stock" type="number" min="0" step="1" value={formData.stock} onChange={handleChange} required disabled={isLoading} />
              <p className="mt-1 text-xs text-slate-500">0 means out of stock. Any number above 0 means in stock.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Low stock alert *</label>
              <Input name="lowStockAt" type="number" min="0" step="1" value={formData.lowStockAt} onChange={handleChange} required disabled={isLoading} />
              <p className="mt-1 text-xs text-slate-500">Alert when stock is at or below this number. Default is 10.</p>
            </div>

            <div className="lg:col-span-4 sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Categorization */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-medium text-slate-900">Categorization</h3>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                disabled={isLoading}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">SubCategory *</label>
              <select
                name="subCategory"
                value={formData.subCategory}
                onChange={handleChange}
                required
                disabled={isLoading || !formData.category}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select SubCategory</option>
                {filteredSubCategories.map((subcat) => (
                  <option key={subcat._id} value={subcat._id}>{subcat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Media */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-medium text-slate-900">Product Media</h3>
          </div>
          <div className="p-6 space-y-6">
            
            {/* Main Image */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Main Image * (Primary Thumbnail)</label>
              <div className="flex gap-4">
                {mainImagePreview && (
                  <div className="relative inline-block shrink-0">
                    <img src={mainImagePreview} alt="Main Preview" className="h-32 w-32 object-cover rounded-lg border border-slate-200" />
                  </div>
                )}
                <div className="flex-1 flex justify-center rounded-lg border border-dashed border-slate-300 px-6 py-10 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => document.getElementById("main-image-upload").click()}>
                  <div className="text-center">
                    <Upload className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                    <div className="mt-2 flex text-sm leading-6 text-slate-600 justify-center">
                      <span className="font-semibold text-indigo-600 hover:text-indigo-500">Upload main image</span>
                      <input id="main-image-upload" type="file" className="sr-only" onChange={handleMainImageChange} accept="image/*" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Other Images */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Other Images (Up to 5)</label>
              <div className="flex flex-wrap gap-4 mb-4">
                {existingOtherImages.map((url, idx) => (
                  <div key={`exist-${idx}`} className="relative inline-block">
                    <img src={url} alt="Other" className="h-24 w-24 object-cover rounded-lg border border-slate-200 opacity-80" />
                    <button type="button" onClick={() => removeExistingOtherImage(url)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1 rounded-full">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {otherImages.map((img, idx) => (
                  <div key={`new-${idx}`} className="relative inline-block">
                    <img src={img.preview} alt="Other" className="h-24 w-24 object-cover rounded-lg border border-slate-200" />
                    <button type="button" onClick={() => removeOtherImage(idx)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1 rounded-full">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              
              {existingOtherImages.length + otherImages.length < 5 && (
                <div className="flex justify-center rounded-lg border border-dashed border-slate-300 px-6 py-6 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => document.getElementById("other-images-upload").click()}>
                  <div className="text-center">
                    <span className="font-semibold text-indigo-600 hover:text-indigo-500">Add more images</span>
                    <input id="other-images-upload" type="file" multiple className="sr-only" onChange={handleOtherImagesChange} accept="image/*" />
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Variants */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-lg font-medium text-slate-900">Product Variants</h3>
            <Button type="button" variant="outline" size="sm" onClick={addVariant}>
              <Plus className="h-4 w-4 mr-1" /> Add Variant
            </Button>
          </div>
          <div className="p-6 space-y-4">
            {formData.variants.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-4">No variants added. Click 'Add Variant' to add properties like Size, Color, etc.</div>
            ) : (
              formData.variants.map((variant, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="flex-1">
                    <Input 
                      placeholder="Key (e.g. Color)" 
                      value={variant.key} 
                      onChange={(e) => updateVariant(index, 'key', e.target.value)} 
                    />
                  </div>
                  <div className="flex-1">
                    <Input 
                      placeholder="Value (e.g. Red)" 
                      value={variant.value} 
                      onChange={(e) => updateVariant(index, 'value', e.target.value)} 
                    />
                  </div>
                  <Button type="button" variant="ghost" className="text-red-500 mt-1" onClick={() => removeVariant(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SEO Meta */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-medium text-slate-900">SEO Meta Tags</h3>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meta Title</label>
              <Input name="metaTitle" value={formData.metaTitle} onChange={handleChange} disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meta Description</label>
              <Input name="metaDescription" value={formData.metaDescription} onChange={handleChange} disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meta Keywords</label>
              <Input name="metaKeyword" placeholder="Comma separated keywords" value={formData.metaKeyword} onChange={handleChange} disabled={isLoading} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 sticky bottom-6 bg-white/80 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200">
          <Button type="button" variant="outline" onClick={() => navigate("/dashboard/products")} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} className="min-w-[120px]">
            {isLoading ? "Saving..." : (isEditMode ? "Update Product" : "Create Product")}
          </Button>
        </div>
      </form>
    </div>
  );
}
