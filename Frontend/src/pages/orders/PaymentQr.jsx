import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import orderService from "../../services/orderService";

export function PaymentQr() {
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    orderService.paymentQr()
      .then((res) => {
        if (!cancelled) setImage(res.data?.image || "");
      })
      .catch((error) => {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load the QR");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const upload = async (file) => {
    if (!file) return;
    const body = new FormData();
    body.append("image", file);
    setBusy(true);
    try {
      const res = await orderService.uploadPaymentQr(body);
      setImage(res.data?.image || "");
      toast.success("QR saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save the QR");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payment QR</h1>
        <p className="text-sm text-slate-500">Upload the company QR once. It shows when an order is placed online.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading QR...</p>
          ) : image ? (
            <img src={image} alt="Payment QR" className="h-64 w-64 object-contain" />
          ) : (
            <p className="text-sm text-slate-500">No QR uploaded yet.</p>
          )}
        </div>
        <label className="mt-4 inline-flex cursor-pointer rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          {busy ? "Saving..." : image ? "Change QR" : "Upload QR"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
