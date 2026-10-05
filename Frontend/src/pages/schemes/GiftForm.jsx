import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import giftService from "../../services/giftService";

const emptyForm = { name: "", price: "", description: "", stock: "" };

const errorText = (error, fallback) =>
  error.response?.data?.errors?.[0]?.message || error.response?.data?.message || fallback;

export function GiftForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await giftService.getGiftById(id);
        if (cancelled) return;
        const gift = res.data;
        setForm({
          name: gift.name || "",
          price: gift.price != null ? String(gift.price) : "",
          description: gift.description || "",
          stock: "",
        });
        setPreview(gift.image || "");
      } catch (error) {
        toast.error(errorText(error, "Failed to load gift"));
        navigate("/dashboard/gifts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, navigate]);

  useEffect(() => () => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const onImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      toast.error("Image must be a jpg, png, webp, or avif file");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller");
      event.target.value = "";
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      toast.error("Gift name must be at least 2 characters");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim())) {
      toast.error("Price must be a number with up to 2 decimal places");
      return;
    }
    if (form.description.trim().length > 200) {
      toast.error("Description can be at most 200 characters");
      return;
    }
    if (!isEdit && !/^\d+$/.test(form.stock.trim())) {
      toast.error("Stock must be a whole number, 0 or more");
      return;
    }
    if (!isEdit && !image) {
      toast.error("Gift image is required");
      return;
    }

    const data = new FormData();
    data.append("name", form.name.trim());
    data.append("price", form.price.trim());
    data.append("description", form.description.trim());
    if (!isEdit) data.append("stock", form.stock.trim());
    if (image) data.append("image", image);

    try {
      setSaving(true);
      if (isEdit) {
        await giftService.updateGift(id, data);
        toast.success("Gift updated");
      } else {
        await giftService.createGift(data);
        toast.success("Gift created");
      }
      navigate("/dashboard/gifts");
    } catch (error) {
      toast.error(errorText(error, "Could not save gift"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading gift...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/gifts")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{isEdit ? "Update gift" : "Add gift"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isEdit ? "Change the gift details. Stock is updated from the gift list." : "Save the gift with its price, photo, and opening stock."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Gift name *</label>
            <Input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="e.g. Fan" maxLength={80} disabled={saving} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Price (₹) *</label>
            <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setField("price", event.target.value)} placeholder="1500" disabled={saving} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Short description</label>
          <textarea
            value={form.description}
            onChange={(event) => setField("description", event.target.value)}
            maxLength={200}
            rows={3}
            disabled={saving}
            placeholder="Optional. A short note about this gift."
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600"
          />
          <p className="mt-1 text-xs text-slate-400">{form.description.trim().length}/200</p>
        </div>

        {!isEdit && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Opening stock *</label>
            <Input type="number" min="0" step="1" value={form.stock} onChange={(event) => setField("stock", event.target.value)} placeholder="10" disabled={saving} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{isEdit ? "Replace image" : "Image *"}</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={onImage} disabled={saving} className="block w-full text-sm text-slate-600" />
          {preview && <img src={preview} alt="" className="mt-3 h-28 w-28 rounded-lg border border-slate-200 object-cover" />}
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : isEdit ? "Update gift" : "Add gift"}</Button>
          <Button type="button" variant="outline" onClick={() => navigate("/dashboard/gifts")} disabled={saving}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
