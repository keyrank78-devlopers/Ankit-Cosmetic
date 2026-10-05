import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Minus, Plus, Search, Trash2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { RichNote, RichText, plainRichText } from "../../components/ui/RichText";
import { cn } from "../../utils/cn";
import customerService from "../../services/customerService";
import orderService from "../../services/orderService";

const STEPS = ["Customer", "Products", "Scheme", "Reimbursement", "Place order"];
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const CLAIM_NAMES = { DAMAGE: "Damage", EXPIRY: "Expiry", RETURN: "Return", OTHER: "Other" };
const claimText = (line) => {
  const name = CLAIM_NAMES[line?.type] || "Expiry";
  return line?.type === "OTHER" && line.otherLabel ? `${name} (${line.otherLabel})` : name;
};
const emptyForm = {
  retailerName: "", firmName: "", contactNo1: "", contactNo2: "", gstin: "", dlNo: "",
  address: { line: "", villageCity: "", tehsil: "", postOffice: "", district: "", state: "", pincode: "", landmark: "" },
};

const errorText = (error, fallback) => error.response?.data?.message || fallback;

const formFromCustomer = (customer) => ({
  retailerName: customer.retailerName || "",
  firmName: customer.firmName || "",
  contactNo1: customer.contactNo1 || "",
  contactNo2: customer.contactNo2 || "",
  gstin: customer.gstin || "",
  dlNo: customer.dlNo || "",
  address: {
    line: customer.address?.line || "",
    villageCity: customer.address?.villageCity || "",
    tehsil: customer.address?.tehsil || "",
    postOffice: customer.address?.postOffice || "",
    district: customer.address?.district || "",
    state: customer.address?.state || "",
    pincode: customer.address?.pincode || "",
    landmark: customer.address?.landmark || "",
  },
});

const Thumb = ({ src, alt, className = "h-14 w-14" }) => (
  src ? <img src={src} alt={alt || ""} className={cn("rounded-lg border border-slate-200 object-cover", className)} />
    : <div className={cn("flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400", className)}>No image</div>
);

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function Stepper({ step, onStep }) {
  return (
    <ol className="grid grid-cols-5 gap-1 sm:flex sm:items-center sm:gap-0">
      {STEPS.map((label, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li key={label} className="flex min-w-0 items-center sm:flex-1">
            <button
              type="button"
              disabled={index > step}
              onClick={() => done && onStep(index)}
              className="flex w-full flex-col items-center gap-1 disabled:cursor-default sm:w-auto sm:flex-row sm:gap-2"
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold sm:h-9 sm:w-9",
                done && "border-indigo-600 bg-indigo-600 text-white",
                current && "border-indigo-600 bg-white text-indigo-600 shadow-sm",
                !done && !current && "border-slate-300 bg-white text-slate-400"
              )}>
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className={cn(
                "max-w-full text-center text-[11px] font-medium leading-tight sm:whitespace-nowrap sm:text-left sm:text-sm",
                current ? "text-indigo-700" : done ? "text-slate-800" : "text-slate-400"
              )}>
                {label}
              </span>
            </button>
            {index < STEPS.length - 1 && (
              <span className={cn("mx-2 hidden h-0.5 min-w-4 flex-1 rounded-full sm:mx-3 sm:block", done ? "bg-indigo-600" : "bg-slate-200")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PlaceOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [customerMode, setCustomerMode] = useState("existing");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [order, setOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [stockLeft, setStockLeft] = useState({});
  const [schemes, setSchemes] = useState([]);
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  const [openNote, setOpenNote] = useState("");
  const [expiryOn, setExpiryOn] = useState(false);
  const [claimType, setClaimType] = useState("EXPIRY");
  const [otherLabel, setOtherLabel] = useState("");
  const [expiryQty, setExpiryQty] = useState({});
  const [claimNote, setClaimNote] = useState({});
  const [expirySearch, setExpirySearch] = useState("");
  const [qtyDraft, setQtyDraft] = useState({});
  const [addQty, setAddQty] = useState({});
  const [busy, setBusy] = useState(false);
  const [payChoice, setPayChoice] = useState("COD");
  const [advanceInput, setAdvanceInput] = useState("");
  const [advanceMode, setAdvanceMode] = useState("CASH");

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const setAddress = (name, value) => setForm((prev) => ({ ...prev, address: { ...prev.address, [name]: value } }));

  useEffect(() => {
    if (customerMode !== "existing") return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await customerService.getCustomers({ search, page: 1, limit: 8 });
        setCustomers(res.data || []);
      } catch (error) {
        toast.error(errorText(error, "Failed to search customers"));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, customerMode]);

  useEffect(() => {
    if (step !== 1) return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await orderService.catalog(productSearch.trim());
        const list = res.data || [];
        setProducts(list);
        setStockLeft((current) => {
          const next = { ...current };
          list.forEach((product) => { next[product._id] = product.stock; });
          return next;
        });
      } catch (error) {
        toast.error(errorText(error, "Failed to load products"));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, step]);

  const lineFor = (productId) => order?.lines?.find((line) => line.product === productId);

  const startNewCustomer = () => {
    setCustomerMode("new");
    setCustomerId("");
    setCustomerCode("");
    setForm(emptyForm);
  };

  const saveCustomer = async () => {
    const payload = {
      retailerName: form.retailerName.trim(),
      firmName: form.firmName.trim(),
      contactNo1: form.contactNo1.trim(),
      contactNo2: form.contactNo2.trim(),
      gstin: form.gstin.trim(),
      dlNo: form.dlNo.trim(),
      address: form.address,
    };
    setBusy(true);
    try {
      const saved = customerId
        ? await customerService.updateCustomer(customerId, payload)
        : await customerService.createCustomer(payload);
      const customer = saved.data;
      setCustomerId(customer._id);
      setCustomerCode(customer.customerCode || "");
      const started = await orderService.start(customer._id);
      setOrder(started.data);
      setStep(1);
    } catch (error) {
      toast.error(errorText(error, "Could not save customer"));
    } finally {
      setBusy(false);
    }
  };

  const chooseCustomer = (customer) => {
    setCustomerMode("existing");
    setCustomerId(customer._id);
    setCustomerCode(customer.customerCode || "");
    setForm(formFromCustomer(customer));
  };

  useEffect(() => {
    const id = searchParams.get("customer");
    if (!id) return undefined;
    let cancelled = false;
    customerService.getCustomerById(id).then((res) => {
      if (!cancelled && res.data) chooseCustomer(res.data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams]);

  const refreshProducts = async () => {
    const res = await orderService.catalog(productSearch.trim());
    const list = res.data || [];
    setProducts(list);
    setStockLeft((current) => {
      const next = { ...current };
      list.forEach((product) => { next[product._id] = product.stock; });
      return next;
    });
  };

  const clearQtyDraft = (productId) => {
    setQtyDraft((current) => {
      if (current[productId] === undefined) return current;
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const commitQty = (product, raw, currentQty) => {
    const nextQty = Number(String(raw).trim());
    if (!Number.isInteger(nextQty) || nextQty < 1) {
      clearQtyDraft(product._id);
      toast.error("Enter a whole quantity of at least 1");
      return;
    }
    if (nextQty === currentQty) {
      clearQtyDraft(product._id);
      return;
    }
    changeQty(product, nextQty);
  };

  const changeQty = async (product, nextQty) => {
    if (!order || nextQty < 1) return;
    clearQtyDraft(product._id);
    const previous = lineFor(product._id)?.lockedQty || 0;
    setBusy(true);
    try {
      const res = await orderService.setLine(order._id, { productId: product._id, quantity: nextQty });
      const saved = res.data.lines.find((line) => line.product === product._id);
      setOrder(res.data);
      setStockLeft((current) => ({
        ...current,
        [product._id]: (current[product._id] ?? product.stock ?? 0) - ((saved?.lockedQty || 0) - previous),
      }));
      await refreshProducts();
    } catch (error) {
      toast.error(errorText(error, "Could not update quantity"));
    } finally {
      setBusy(false);
    }
  };

  const removeProduct = async (productId) => {
    const locked = lineFor(productId)?.lockedQty || 0;
    setBusy(true);
    try {
      const res = await orderService.removeLine(order._id, productId);
      setOrder(res.data);
      setStockLeft((current) => ({ ...current, [productId]: (current[productId] ?? 0) + locked }));
      await refreshProducts();
    } catch (error) {
      toast.error(errorText(error, "Could not remove product"));
    } finally {
      setBusy(false);
    }
  };

  const loadSchemes = async () => {
    const res = await orderService.schemes(order._id);
    setSchemes(res.data.schemes || []);
    setIsFirstOrder(res.data.isFirstOrder);
    if (order.schemeType === "OPEN") setOpenNote(order.schemeNote || "");
  };

  const saveOpenRequest = async () => {
    if (!plainRichText(openNote)) {
      toast.error("Write the open request");
      return;
    }
    setBusy(true);
    try {
      const res = await orderService.setScheme(order._id, { openRequest: true, note: openNote });
      setOrder(res.data);
      toast.success("Open request saved");
    } catch (error) {
      toast.error(errorText(error, "Could not save the open request"));
    } finally {
      setBusy(false);
    }
  };

  const applyScheme = async (scheme, extra = {}) => {
    setBusy(true);
    try {
      const res = await orderService.setScheme(order._id, { schemeId: scheme?._id || "", ...extra });
      setOrder(res.data);
    } catch (error) {
      toast.error(errorText(error, "Could not apply scheme"));
    } finally {
      setBusy(false);
    }
  };

  const saveExpiry = async () => {
    const lines = (order.lines || [])
      .map((line) => ({
        productId: line.product,
        quantity: Number(expiryQty[line.product] || 0),
        type: claimType,
        otherLabel,
        note: claimNote[line.product] || "",
      }))
      .filter((line) => line.quantity > 0);
    setBusy(true);
    try {
      const res = await orderService.setExpiry(order._id, { enabled: expiryOn, lines });
      setOrder(res.data);
      setStep(4);
    } catch (error) {
      toast.error(errorText(error, "Could not save the reimbursement"));
    } finally {
      setBusy(false);
    }
  };

  const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const orderTotal = round2(order?.total || 0);
  const advanceValue = round2(advanceInput);
  const advanceProblem = () => {
    if (!(advanceValue > 0)) return "Enter an advance amount";
    if (advanceValue >= orderTotal) return "Advance must be less than the order total";
    if (advanceMode === "ONLINE" && advanceValue < 1) return "Online advance needs at least ₹1";
    return "";
  };

  const place = async () => {
    if (payChoice === "ADVANCE") {
      const problem = advanceProblem();
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    const payload = payChoice === "CASH"
      ? { paymentMethod: "CASH" }
      : payChoice === "ADVANCE"
        ? { paymentMethod: "ADVANCE_COD", advanceMode: "CASH", advanceAmount: advanceValue }
        : { paymentMethod: "COD" };
    setBusy(true);
    try {
      const res = await orderService.place(order._id, payload);
      toast.success(res.data.orderCode ? `Order placed · ${res.data.orderCode}` : "Order placed");
      navigate("/dashboard/orders");
    } catch (error) {
      toast.error(errorText(error, "Could not place order"));
    } finally {
      setBusy(false);
    }
  };

  const loadRazorpay = () => new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const payOnline = async () => {
    setBusy(true);
    try {
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) {
        toast.error("Could not open Razorpay");
        return;
      }
      if (payChoice === "ADVANCE") {
        const problem = advanceProblem();
        if (problem) {
          toast.error(problem);
          return;
        }
      }
      const res = await orderService.createPayment(order._id, payChoice === "ADVANCE"
        ? { kind: "ADVANCE", advanceAmount: advanceValue }
        : { kind: "FULL" });
      const payment = res.data;
      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency || "INR",
        name: "Firm CRM",
        description: payChoice === "ADVANCE" ? "Advance payment" : "Order payment",
        order_id: payment.razorpayOrderId,
        prefill: {
          name: form.retailerName || "",
          contact: form.contactNo1 || "",
        },
        handler: async (response) => {
          try {
            const verified = await orderService.verifyPayment(order._id, response);
            toast.success(verified.data.orderCode ? `Order placed · ${verified.data.orderCode}` : "Payment received");
            navigate("/dashboard/orders");
          } catch (error) {
            toast.error(errorText(error, "Payment could not be verified"));
          }
        },
        modal: { ondismiss: () => toast("Payment was not completed") },
        theme: { color: "#4f46e5" },
      });
      checkout.on("payment.failed", (response) => {
        toast.error(response.error?.description || "Payment failed");
      });
      checkout.open();
    } catch (error) {
      toast.error(errorText(error, "Could not start online payment"));
    } finally {
      setBusy(false);
    }
  };

  const resetToCustomer = () => {
    setOrder(null);
    setStep(0);
    setSchemes([]);
    setOpenNote("");
    setExpiryOn(false);
    setClaimType("EXPIRY");
    setOtherLabel("");
    setExpiryQty({});
    setClaimNote({});
    setExpirySearch("");
    setQtyDraft({});
    setAddQty({});
    setPayChoice("COD");
    setAdvanceInput("");
    setAdvanceMode("CASH");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancel = async () => {
    if (!order || order.status !== "DRAFT") return;
    if (!window.confirm("Cancel this order and release locked stock?")) return;
    setBusy(true);
    try {
      await orderService.cancel(order._id);
      resetToCustomer();
      toast.success("Draft order cancelled");
    } catch (error) {
      if (error.response?.status === 404) {
        resetToCustomer();
        toast.success("Draft order cancelled");
        return;
      }
      toast.error(errorText(error, "Could not cancel order"));
    } finally {
      setBusy(false);
    }
  };

  const schemeGifts = (scheme) => {
    if (scheme.type === "FIRST_ORDER") return scheme.gifts || [];
    const map = new Map();
    (scheme.slabs || []).forEach((slab) => (slab.gifts || []).forEach((gift) => map.set(gift._id, gift)));
    return [...map.values()];
  };

  const expiryProducts = useMemo(() => {
    const query = expirySearch.trim().toLowerCase();
    return (order?.lines || []).filter((line) => !query || line.name.toLowerCase().includes(query));
  }, [order, expirySearch]);

  const collectedNow = payChoice === "COD"
    ? 0
    : payChoice === "ADVANCE"
      ? (advanceValue > 0 && advanceValue < orderTotal ? advanceValue : 0)
      : orderTotal;
  const pendingNow = round2(Math.max(orderTotal - collectedNow, 0));
  const payOnlineNow = payChoice === "ONLINE" || (payChoice === "ADVANCE" && advanceMode === "ONLINE");
  const placeLabel = payChoice === "CASH"
    ? "Place order · Cash"
    : payChoice === "ADVANCE"
      ? "Place order · Advance cash"
      : "Place order · COD";

  const placed = Boolean(order && order.status && order.status !== "DRAFT");
  const showCustomerForm = customerMode === "new" || Boolean(customerId);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Place order</h1>
          <p className="text-sm text-slate-500">Customer, products, scheme, then cash, online, COD, or an advance.</p>
        </div>
        {order && !placed && (
          <Button type="button" variant="outline" disabled={busy} onClick={cancel}>Cancel order</Button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <Stepper step={step} onStep={setStep} />
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button type="button" onClick={() => setCustomerMode("existing")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", customerMode === "existing" ? "bg-indigo-600 text-white" : "text-slate-600")}>Existing</button>
              <button type="button" onClick={startNewCustomer} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", customerMode === "new" ? "bg-indigo-600 text-white" : "text-slate-600")}>
                <UserPlus className="h-4 w-4" /> Add new customer
              </button>
            </div>
            {customerCode && <p className="text-sm font-medium text-indigo-700">{customerCode}</p>}
          </div>

          {customerMode === "existing" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search retailer, firm, phone, or customer id" className="pl-9" />
              </div>
              <ul className="mt-3 divide-y divide-slate-100">
                {customers.map((customer) => (
                  <li key={customer._id}>
                    <button type="button" onClick={() => chooseCustomer(customer)} className={cn("flex w-full flex-col gap-1 rounded-lg px-2 py-3 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-3", customerId === customer._id && "bg-indigo-50")}>
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900">{customer.retailerName}</span>
                        <span className="block truncate text-xs text-slate-500">{customer.firmName} · {customer.contactNo1}</span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-slate-500">{customer.customerCode || "No id yet"}</span>
                    </button>
                  </li>
                ))}
                {customers.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No customer found. Add a new one.</li>}
              </ul>
            </div>
          )}

          {showCustomerForm && (
            <form className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" onSubmit={(event) => { event.preventDefault(); saveCustomer(); }}>
              <div className="space-y-4 p-5">
                <h2 className="text-lg font-medium text-slate-900">{customerMode === "new" ? "New customer" : "Customer details"}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Retailer name *"><Input value={form.retailerName} onChange={(event) => setField("retailerName", event.target.value)} required /></Field>
                  <Field label="Firm name *"><Input value={form.firmName} onChange={(event) => setField("firmName", event.target.value)} required /></Field>
                  <Field label="Contact no 1 *"><Input value={form.contactNo1} onChange={(event) => setField("contactNo1", event.target.value)} required /></Field>
                  <Field label="Contact no 2"><Input value={form.contactNo2} onChange={(event) => setField("contactNo2", event.target.value)} /></Field>
                  <Field label="GSTIN"><Input value={form.gstin} maxLength={15} onChange={(event) => setField("gstin", event.target.value.toUpperCase())} /></Field>
                  <Field label="DL no"><Input value={form.dlNo} onChange={(event) => setField("dlNo", event.target.value)} /></Field>
                </div>
              </div>
              <div className="space-y-4 bg-slate-50 p-5">
                <h3 className="text-lg font-medium text-slate-900">Address</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Address *"><Input value={form.address.line} onChange={(event) => setAddress("line", event.target.value)} required /></Field>
                  <Field label="Village / city *"><Input value={form.address.villageCity} onChange={(event) => setAddress("villageCity", event.target.value)} required /></Field>
                  <Field label="Tehsil"><Input value={form.address.tehsil} onChange={(event) => setAddress("tehsil", event.target.value)} /></Field>
                  <Field label="Post office"><Input value={form.address.postOffice} onChange={(event) => setAddress("postOffice", event.target.value)} /></Field>
                  <Field label="District"><Input value={form.address.district} onChange={(event) => setAddress("district", event.target.value)} /></Field>
                  <Field label="State *"><Input value={form.address.state} onChange={(event) => setAddress("state", event.target.value)} required /></Field>
                  <Field label="Pin code *"><Input value={form.address.pincode} onChange={(event) => setAddress("pincode", event.target.value)} required /></Field>
                  <Field label="Landmark"><Input value={form.address.landmark} onChange={(event) => setAddress("landmark", event.target.value)} /></Field>
                </div>
              </div>
              <div className="flex justify-end border-t border-slate-100 p-5">
                <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save and continue"}</Button>
              </div>
            </form>
          )}
        </div>
      )}

      {step === 1 && order && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {(order.lines || []).length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-medium text-slate-900">On this order</h2>
              {order.lines.map((line) => {
                const product = products.find((item) => item._id === line.product) || { _id: line.product, stock: stockLeft[line.product] ?? 0, mainImage: line.image, name: line.name };
                return (
                  <div key={line.product} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center">
                    <Thumb src={line.image} alt={line.name} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{line.name}</p>
                      <p className="text-sm text-slate-500">{money.format(line.sellPrice)} · GST {line.gstPercent}% · Stock {stockLeft[line.product] ?? "—"}</p>
                      {line.overQty > 0 && <p className="mt-1 text-xs font-medium text-amber-700">Remark: {line.remark}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="icon" data-qty-step="down" disabled={busy} onClick={() => {
                        const current = Number(qtyDraft[line.product] || line.quantity);
                        if (current <= 1) removeProduct(line.product);
                        else changeQty(product, current - 1);
                      }}><Minus className="h-4 w-4" /></Button>
                      <Input
                        className="w-20 text-center"
                        inputMode="numeric"
                        aria-label={`Quantity for ${line.name}`}
                        disabled={busy}
                        value={qtyDraft[line.product] ?? String(line.quantity)}
                        onChange={(event) => setQtyDraft((current) => ({ ...current, [line.product]: event.target.value.replace(/[^\d]/g, "") }))}
                        onBlur={(event) => {
                          if (event.relatedTarget?.getAttribute?.("data-qty-step")) return;
                          commitQty(product, event.target.value, line.quantity);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                      <Button type="button" variant="outline" size="icon" data-qty-step="up" disabled={busy} onClick={() => changeQty(product, Number(qtyDraft[line.product] || line.quantity) + 1)}><Plus className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeProduct(line.product)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap justify-end gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span>Subtotal {money.format(order.subtotal)}</span>
                <span>GST {money.format(order.gstTotal)}</span>
                <span className="font-semibold text-slate-900">Total {money.format(order.total)}</span>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products to add" className="pl-9" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {products.filter((product) => !lineFor(product._id)).map((product) => (
              <div key={product._id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <Thumb src={product.mainImage} alt={product.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">{money.format(product.sellPrice)} · GST {product.gstPercent || 0}% · Stock {product.stock}</p>
                </div>
                <Input
                  className="w-16 text-center"
                  inputMode="numeric"
                  aria-label={`Quantity for ${product.name}`}
                  disabled={busy}
                  value={addQty[product._id] ?? ""}
                  placeholder="Qty"
                  onChange={(event) => setAddQty((current) => ({ ...current, [product._id]: event.target.value.replace(/[^\d]/g, "") }))}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const typed = addQty[product._id];
                    const nextQty = typed ? Number(typed) : 1;
                    if (!Number.isInteger(nextQty) || nextQty < 1) {
                      toast.error("Enter a whole quantity of at least 1");
                      return;
                    }
                    changeQty(product, nextQty);
                  }}
                />
                <Button type="button" size="sm" disabled={busy} onClick={() => {
                  const typed = addQty[product._id];
                  const nextQty = typed ? Number(typed) : 1;
                  if (!Number.isInteger(nextQty) || nextQty < 1) {
                    toast.error("Enter a whole quantity of at least 1");
                    return;
                  }
                  changeQty(product, nextQty);
                }}>Add</Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button type="button" disabled={!order.lines?.length || busy} onClick={() => { loadSchemes().then(() => setStep(2)).catch((error) => toast.error(errorText(error, "Could not load schemes"))); }}>Continue</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Scheme is optional. A slab or first-order scheme can be applied, or enter an open request. None of these change this order&apos;s bill.{isFirstOrder ? " This customer has no placed order yet, so a first-order scheme can be chosen." : ""}</p>
          <button type="button" onClick={() => applyScheme(null)} className={cn("w-full rounded-xl border px-4 py-3 text-left text-sm font-medium", !order?.schemeType ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-700")}>No scheme</button>
          {schemes.filter((scheme) => scheme.type !== "OPEN").map((scheme) => {
            const selected = order?.scheme === scheme._id;
            return (
              <div key={scheme._id} className={cn("rounded-xl border p-4", selected ? "border-indigo-600 bg-indigo-50" : "border-slate-200")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{scheme.name}</p>
                    <p className="text-xs text-slate-500">{scheme.type === "SLAB" ? "Amount slab" : scheme.type === "OPEN" ? "Open request" : "First order"}</p>
                  </div>
                  {scheme.type !== "OPEN" && (
                    <Button type="button" size="sm" variant={selected ? "default" : "outline"} onClick={() => applyScheme(scheme)}>{selected ? "Applied" : "Apply"}</Button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {schemeGifts(scheme).map((gift) => (
                    <div key={gift._id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                      <Thumb src={gift.image} alt={gift.name} className="h-8 w-8" />
                      {gift.name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className={cn("rounded-xl border p-4", order?.schemeType === "OPEN" ? "border-indigo-600 bg-indigo-50" : "border-slate-200")}>
            <p className="font-medium text-slate-900">Open request</p>
            <p className="mt-1 mb-3 text-sm text-slate-500">Write it in your own words. For example, the customer will buy ₹3,00,000 of goods in 3 months and wants an AC. This does not change the order total.</p>
            <RichText
              value={openNote}
              onChange={setOpenNote}
              placeholder="Customer will buy ₹3,00,000 of goods in 3 months and wants an AC as the gift."
            />
            <Button type="button" className="mt-3" disabled={busy} onClick={saveOpenRequest}>Save open request</Button>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button type="button" onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && order && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Reimbursement</h2>
            <p className="text-sm text-slate-500">Choose yes, then the reason. Enter the product quantity. A note is optional. This does not change the bill.</p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-1">
            <button type="button" onClick={() => setExpiryOn(false)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium", !expiryOn ? "bg-indigo-600 text-white" : "text-slate-600")}>No</button>
            <button type="button" onClick={() => setExpiryOn(true)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium", expiryOn ? "bg-indigo-600 text-white" : "text-slate-600")}>Yes</button>
          </div>
          {expiryOn && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Reason">
                  <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={claimType} onChange={(event) => setClaimType(event.target.value)}>
                    <option value="DAMAGE">Damage</option>
                    <option value="EXPIRY">Expiry</option>
                    <option value="RETURN">Return</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                {claimType === "OTHER" && (
                  <Field label="What is it">
                    <Input value={otherLabel} maxLength={80} placeholder="Write the reason" onChange={(event) => setOtherLabel(event.target.value)} />
                  </Field>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={expirySearch} onChange={(event) => setExpirySearch(event.target.value)} placeholder="Search products on this order" className="pl-9" />
              </div>
              <div className="space-y-3">
                {expiryProducts.map((line) => (
                  <div key={line.product} className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[auto_1fr_8rem_1fr]">
                    <Thumb src={line.image} alt={line.name} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{line.name}</p>
                      <p className="text-xs text-slate-500">Ordered {line.quantity}</p>
                    </div>
                    <Field label="Quantity">
                      <Input type="number" min="1" placeholder="Qty" value={expiryQty[line.product] || ""} onChange={(event) => setExpiryQty((current) => ({ ...current, [line.product]: event.target.value }))} />
                    </Field>
                    <Field label="Note (optional)">
                      <Input maxLength={200} placeholder="Optional note" value={claimNote[line.product] || ""} onChange={(event) => setClaimNote((current) => ({ ...current, [line.product]: event.target.value }))} />
                    </Field>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button type="button" disabled={busy} onClick={saveExpiry}>Continue</Button>
          </div>
        </div>
      )}

      {step === 4 && order && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Order summary</h2>
            {order.orderCode && <p className="text-sm font-semibold text-indigo-700">{order.orderCode}</p>}
          </div>
          <div className="space-y-3">
            {order.lines.map((line) => (
              <div key={line.product} className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <Thumb src={line.image} alt={line.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{line.name}</p>
                  <p className="text-xs text-slate-500">{line.quantity} × {money.format(line.sellPrice)} · GST {line.gstPercent}%</p>
                  {line.remark ? <p className="text-xs font-medium text-amber-700">Remark: {line.remark}</p> : null}
                </div>
                <p className="text-sm font-semibold text-slate-900">{money.format(line.lineTotal)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">Scheme: {order.schemeName || "None"}</p>
            {order.schemeType === "OPEN" && <RichNote html={order.schemeNote} className="mt-1" />}
            <div className="mt-3 flex flex-wrap gap-2">
              {(order.schemeGifts || []).map((gift) => (
                <div key={`${gift.name}-${gift.image}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                  <Thumb src={gift.image} alt={gift.name} className="h-8 w-8" />
                  {gift.name}
                </div>
              ))}
            </div>
          </div>
          {order.expiryEnabled && (
            <div className="space-y-1 text-sm text-slate-600">
              {order.expiryLines?.map((line) => (
                <p key={line.product}>Reimbursement: {line.name} × {line.quantity} · {claimText(line)}{line.note ? ` · ${line.note}` : ""}</p>
              ))}
            </div>
          )}
          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money.format(order.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{money.format(order.gstTotal)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span>{money.format(order.total)}</span></div>
          </div>

          {!placed && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div>
                <h3 className="text-sm font-medium text-slate-900">Payment</h3>
                <p className="text-xs text-slate-500">Cash and online collect money now. COD leaves it for delivery.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["CASH", "Cash", "Full amount in cash now"],
                  ["ONLINE", "Online", "Full amount by UPI or card"],
                  ["COD", "COD", "Full amount on delivery"],
                  ["ADVANCE", "Advance + COD", "Some now, rest on delivery"],
                ].map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => setPayChoice(id)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left",
                      payChoice === id ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>

              {payChoice === "ADVANCE" && (
                <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <Field label="Advance amount">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="Amount collected now"
                      value={advanceInput}
                      onChange={(event) => setAdvanceInput(event.target.value)}
                      disabled={busy}
                    />
                  </Field>
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-700">Advance paid by</p>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                      <button type="button" disabled={busy} onClick={() => setAdvanceMode("CASH")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", advanceMode === "CASH" ? "bg-indigo-600 text-white" : "text-slate-600")}>Cash</button>
                      <button type="button" disabled={busy} onClick={() => setAdvanceMode("ONLINE")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", advanceMode === "ONLINE" ? "bg-indigo-600 text-white" : "text-slate-600")}>Online</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="ml-auto w-full max-w-xs space-y-1 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Collected now</span><span>{money.format(collectedNow)}</span></div>
                <div className="flex justify-between font-semibold text-slate-900"><span>Pending</span><span>{money.format(pendingNow)}</span></div>
                {payChoice === "ADVANCE" && collectedNow > 0 && (
                  <p className="pt-1 text-xs text-slate-500">Advance {money.format(collectedNow)} by {advanceMode === "ONLINE" ? "online" : "cash"}. {money.format(pendingNow)} stays pending on delivery.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {!placed && <Button type="button" variant="outline" onClick={() => setStep(3)}>Back</Button>}
            <div className="ml-auto flex gap-2">
              {placed ? (
                <Button type="button" disabled>Order placed</Button>
              ) : payOnlineNow ? (
                <Button type="button" disabled={busy} onClick={payOnline}>{payChoice === "ADVANCE" ? "Pay advance online" : "Pay online"}</Button>
              ) : (
                <Button type="button" disabled={busy} onClick={place}>{placeLabel}</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
