import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Edit2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import api from "../../services/api";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";

export function ProductView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProductDetails = async () => {
      try {
        const res = await api.get(`/public/products/details/${id}`);
        setProduct(res.data.data);
      } catch (error) {
        toast.error("Failed to fetch product details");
        navigate("/dashboard/products");
      } finally {
        setLoading(false);
      }
    };
    fetchProductDetails();
  }, [id, navigate]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading product details...</div>;
  }

  if (!product) {
    return <div className="p-8 text-center text-red-500">Product not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/products")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{product.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Code: {product.productCode || "—"} · ID: {product.productId}
            </p>
          </div>
        </div>
        <Button onClick={() => navigate(`/dashboard/products/edit/${product._id}`)}>
          <Edit2 className="h-4 w-4 mr-2" />
          Edit Product
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Images */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-4">
            <h3 className="text-sm font-medium text-slate-900 mb-3">Primary Image</h3>
            {product.mainImage ? (
              <img src={product.mainImage} alt={product.name} className="w-full aspect-square object-cover rounded-lg border border-slate-100" />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                <span className="text-sm text-slate-400">No Image</span>
              </div>
            )}
          </div>
          
          {product.otherImages && product.otherImages.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-4">
              <h3 className="text-sm font-medium text-slate-900 mb-3">Other Images</h3>
              <div className="grid grid-cols-2 gap-3">
                {product.otherImages.map((img, idx) => (
                  <img key={idx} src={img} alt={`Other ${idx + 1}`} className="w-full aspect-square object-cover rounded-lg border border-slate-100" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-medium text-slate-900">Product Details</h3>
              <span className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                product.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              )}>
                {product.status || "ACTIVE"}
              </span>
            </div>
            
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <dt className="text-sm font-medium text-slate-500">GST</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{product.gstPercent ?? 0}%</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">MRP</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">₹{product.mrp}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Selling Price</dt>
                <dd className="mt-1 text-lg font-bold text-indigo-600">₹{product.sellPrice}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Min Sales Price</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{product.minSalesPrice != null ? `₹${product.minSalesPrice}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Max Sales Price</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{product.maxSalesPrice != null ? `₹${product.maxSalesPrice}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Stock</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">
                  {product.stock ?? 0}
                  {(() => {
                    const stock = product.stock ?? 0;
                    const alertAt = product.lowStockAt ?? 10;
                    const out = stock <= 0;
                    const low = !out && stock <= alertAt;
                    return (
                      <span className={cn(
                        "ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium align-middle",
                        out ? "bg-amber-100 text-amber-800" : low ? "bg-rose-100 text-rose-800" : "bg-indigo-100 text-indigo-800"
                      )}>
                        {out ? "Out of Stock" : low ? "Low stock" : "In Stock"}
                      </span>
                    );
                  })()}
                  <p className="mt-1 text-xs font-normal text-slate-500">Alert at {product.lowStockAt ?? 10} or below</p>
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-slate-500">Category</dt>
                <dd className="mt-1 text-sm text-slate-900">{product.category?.name || "-"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">SubCategory</dt>
                <dd className="mt-1 text-sm text-slate-900">{product.subCategory?.name || "-"}</dd>
              </div>
              
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Description</dt>
                <dd className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{product.description || "No description provided."}</dd>
              </div>
            </div>
          </div>

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-medium text-slate-900">Variants</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  {product.variants.map((v, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">{v.key}</span>
                      <span className="text-sm text-slate-900">{v.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SEO Meta Tags */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h3 className="text-lg font-medium text-slate-900">SEO Information</h3>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Meta Title</dt>
                <dd className="mt-1 text-sm text-slate-900">{product.metaTitle || "-"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Meta Description</dt>
                <dd className="mt-1 text-sm text-slate-900">{product.metaDescription || "-"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Meta Keywords</dt>
                <dd className="mt-1 text-sm text-slate-900">{product.metaKeyword || "-"}</dd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
