import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import giftService from "../../services/giftService";
import schemeService from "../../services/schemeService";

const TYPES = [
  { value: "SLAB", label: "Amount slab" },
  { value: "OPEN", label: "Open request" },
  { value: "FIRST_ORDER", label: "First order" },
];

const emptySlab = () => ({ minAmount: "", giftIds: [] });

function GiftChoices({ gifts, selected, onToggle }) {
  if (!gifts.length) {
    return (
      <p className="text-sm text-slate-500">
        No gifts yet. <Link to="/dashboard/gifts" className="font-medium text-indigo-600">Create a gift</Link> first.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {gifts.map((gift) => {
        const active = selected.includes(gift._id);
        return (
          <button
            key={gift._id}
            type="button"
            onClick={() => onToggle(gift._id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              active
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            {gift.name}{Number.isFinite(Number(gift.stock)) ? ` · ${gift.stock} in stock` : ""}
          </button>
        );
      })}
    </div>
  );
}

const giftId = (gift) => String(gift?._id || gift);

export function SchemeCreate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [name, setName] = useState("");
  const [type, setType] = useState("SLAB");
  const [giftIds, setGiftIds] = useState([]);
  const [slabs, setSlabs] = useState([emptySlab()]);
  const [gifts, setGifts] = useState([]);
  const [loadingGifts, setLoadingGifts] = useState(true);
  const [loadingScheme, setLoadingScheme] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await giftService.getGifts({ limit: 100, sort: "name" });
        setGifts(res.data || []);
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to load gifts");
      } finally {
        setLoadingGifts(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    const loadScheme = async () => {
      try {
        const res = await schemeService.getSchemeById(id);
        if (cancelled) return;
        const scheme = res.data;
        setName(scheme.name || "");
        setType(scheme.type || "SLAB");
        setGiftIds((scheme.gifts || []).map(giftId));
        setSlabs(
          scheme.slabs?.length
            ? scheme.slabs.map((slab) => ({
                minAmount: String(slab.minAmount),
                giftIds: (slab.gifts || []).map(giftId),
              }))
            : [emptySlab()]
        );
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to load scheme");
        navigate("/dashboard/schemes");
      } finally {
        if (!cancelled) setLoadingScheme(false);
      }
    };
    loadScheme();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, navigate]);

  const toggleIn = (list, id) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const updateSlab = (index, patch) => {
    setSlabs((current) => current.map((slab, slabIndex) => (slabIndex === index ? { ...slab, ...patch } : slab)));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Scheme name must be at least 2 characters");
      return;
    }

    const payload = { name: trimmed, type };

    if (type === "SLAB") {
      const parsed = slabs.map((slab) => ({
        minAmount: Number(slab.minAmount),
        gifts: slab.giftIds,
      }));
      if (parsed.some((slab) => !Number.isInteger(slab.minAmount) || slab.minAmount < 1)) {
        toast.error("Each slab amount must be a whole number greater than 0");
        return;
      }
      if (new Set(parsed.map((slab) => slab.minAmount)).size !== parsed.length) {
        toast.error("Each slab needs a different amount");
        return;
      }
      if (parsed.some((slab) => slab.gifts.length === 0)) {
        toast.error("Select at least one gift on every slab");
        return;
      }
      payload.slabs = parsed;
    }

    if (type === "FIRST_ORDER") {
      if (!giftIds.length) {
        toast.error("Select at least one gift for the first order");
        return;
      }
      payload.gifts = giftIds;
    }

    try {
      setSaving(true);
      if (isEdit) {
        await schemeService.updateScheme(id, payload);
        toast.success("Scheme updated");
      } else {
        await schemeService.createScheme(payload);
        toast.success("Scheme created");
      }
      navigate("/dashboard/schemes");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not create scheme");
    } finally {
      setSaving(false);
    }
  };

  if (loadingScheme) return <div className="p-8 text-center text-slate-500">Loading scheme...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/schemes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{isEdit ? "Edit scheme" : "Create scheme"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pick gifts that were already created. On a slab, the customer can receive any one of the selected gifts. A first order gets a gift because it is their first order.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Scheme name *</label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Shopping gifts" maxLength={80} disabled={saving} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Type *</label>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            disabled={saving}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600"
          >
            {TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        {type === "SLAB" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">The highest amount the shopping crosses is the slab that applies.</p>
            {slabs.map((slab, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Shopping amount (₹) *</label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={slab.minAmount}
                      onChange={(event) => updateSlab(index, { minAmount: event.target.value })}
                      placeholder="1000"
                      disabled={saving}
                    />
                  </div>
                  {slabs.length > 1 && (
                    <Button type="button" variant="outline" onClick={() => setSlabs((current) => current.filter((_, slabIndex) => slabIndex !== index))}>
                      Remove
                    </Button>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Customer can get any one of these *</p>
                  {loadingGifts ? (
                    <p className="text-sm text-slate-500">Loading gifts...</p>
                  ) : (
                    <GiftChoices
                      gifts={gifts}
                      selected={slab.giftIds}
                      onToggle={(id) => updateSlab(index, { giftIds: toggleIn(slab.giftIds, id) })}
                    />
                  )}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setSlabs((current) => [...current, emptySlab()])}>
              Add another amount
            </Button>
          </div>
        )}

        {type === "OPEN" && (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            This scheme stays open. The gift is chosen later, when a customer request is entered. Only one open request scheme can be created.
          </p>
        )}

        {type === "FIRST_ORDER" && (
          <div className="space-y-4">
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              This applies to a customer&apos;s first order, for any purchase amount. They can receive any one of the gifts below.
            </p>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Customer can get any one of these *</p>
              {loadingGifts ? (
                <p className="text-sm text-slate-500">Loading gifts...</p>
              ) : (
                <GiftChoices gifts={gifts} selected={giftIds} onToggle={(id) => setGiftIds((current) => toggleIn(current, id))} />
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : isEdit ? "Update scheme" : "Create scheme"}</Button>
          <Button type="button" variant="outline" onClick={() => navigate("/dashboard/schemes")} disabled={saving}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
