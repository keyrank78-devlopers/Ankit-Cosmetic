import { useEffect, useState } from "react";
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
const BELOW_MIN_REMARK = "Entered price is less than the minimum selling amount";
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const parseOffer = (value) => {
  const text = String(value ?? "").trim().replace(/\.$/, "");
  if (!text) return { error: "Enter the offer price" };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: "Offer price can have up to 2 decimal places" };
  return { price: round2(text) };
};
const belowMin = (price, minSalesPrice) => minSalesPrice != null && minSalesPrice !== "" && Number(price) < Number(minSalesPrice);
const lineView = (line, qtyDraft, priceDraft) => {
  const qtyText = qtyDraft[line.product] ?? String(line.quantity);
  const qty = Number(qtyText);
  const safeQty = Number.isInteger(qty) && qty >= 1 ? qty : line.quantity;
  const priceText = priceDraft[line.product] ?? String(line.sellPrice ?? "");
  const offer = parseOffer(priceText);
  const unit = offer.error ? Number(line.sellPrice) || 0 : offer.price;
  const subtotal = round2(unit * safeQty);
  const gst = round2(subtotal * ((Number(line.gstPercent) || 0) / 100));
  return { qtyText, safeQty, priceText, offer, unit, subtotal, gst };
};
const CLAIM_NAMES = { DAMAGE: "Damage", EXPIRY: "Expiry", RETURN: "Return", MISSING: "Missing", OTHER: "Other" };
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
  const [allProducts, setAllProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [stockLeft, setStockLeft] = useState({});
  const [schemes, setSchemes] = useState([]);
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  const [openNote, setOpenNote] = useState("");
  const [expiryOn, setExpiryOn] = useState(false);
  const [claimType, setClaimType] = useState("DAMAGE");
  const [otherLabel, setOtherLabel] = useState("");
  const [claims, setClaims] = useState([]);
  const [qtyDraft, setQtyDraft] = useState({});
  const [priceDraft, setPriceDraft] = useState({});
  const [addQty, setAddQty] = useState({});
  const [addPrice, setAddPrice] = useState({});
  const [busy, setBusy] = useState(false);
  const [payChoice, setPayChoice] = useState("COD");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [promises, setPromises] = useState([]);
  const [paymentQr, setPaymentQr] = useState("");

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
    if (step !== 1 && step !== 3) return undefined;
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

  useEffect(() => {
    if (step !== 3) return undefined;
    let cancelled = false;
    orderService.catalog("", 2000).then((res) => {
      if (!cancelled) setAllProducts(res.data || []);
    }).catch((error) => {
      if (!cancelled) toast.error(errorText(error, "Failed to load products"));
    });
    return () => { cancelled = true; };
  }, [step]);

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
    const line = lineFor(product._id);
    const offer = parseOffer(priceDraft[product._id] ?? line?.sellPrice);
    if (offer.error) {
      toast.error(offer.error);
      return;
    }
    if (nextQty === currentQty && offer.price === round2(line?.sellPrice)) {
      clearQtyDraft(product._id);
      return;
    }
    changeQty(product, nextQty, offer.price);
  };

  const changeQty = async (product, nextQty, offerPrice) => {
    if (!order || nextQty < 1) return;
    const line = lineFor(product._id);
    const offer = parseOffer(offerPrice ?? priceDraft[product._id] ?? line?.sellPrice);
    if (offer.error) {
      toast.error(offer.error);
      return;
    }
    clearQtyDraft(product._id);
    setPriceDraft((current) => {
      if (current[product._id] === undefined) return current;
      const next = { ...current };
      delete next[product._id];
      return next;
    });
    const previous = line?.lockedQty || 0;
    setBusy(true);
    try {
      const res = await orderService.setLine(order._id, { productId: product._id, quantity: nextQty, sellPrice: offer.price });
      const saved = res.data.lines.find((line) => line.product === product._id);
      setOrder(res.data);
      setAddQty((current) => ({ ...current, [product._id]: "" }));
      setAddPrice((current) => ({ ...current, [product._id]: "" }));
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

  const claimRow = (productId, type) => claims.find((row) => row.productId === productId && row.type === type);

  const setClaimField = (productId, type, patch) => {
    const id = `${productId}-${type}`;
    setClaims((current) => {
      const existing = current.find((row) => row.id === id);
      if (!existing) return [...current, { id, productId, type, quantity: "", note: "", ...patch }];
      return current.map((row) => (row.id === id ? { ...row, ...patch } : row));
    });
  };

  const saveExpiry = async () => {
    const lines = claims
      .map((row) => ({
        productId: row.productId,
        quantity: Number(String(row.quantity).trim()),
        type: row.type,
        otherLabel,
        note: row.note,
        givenProductId: row.givenProductId || row.productId,
        givenQuantity: String(row.givenQuantity ?? "").trim() === ""
          ? Number(String(row.quantity).trim())
          : Number(String(row.givenQuantity).trim()),
      }))
      .filter((row) => row.quantity > 0);
    const overExpiry = lines.find((row) => {
      if (row.type !== "EXPIRY") return false;
      const line = (order.lines || []).find((item) => String(item.product) === String(row.productId));
      const catalogItem = allProducts.find((item) => String(item._id) === String(row.productId));
      const giveId = String(row.givenProductId || row.productId);
      const give = allProducts.find((item) => String(item._id) === giveId)
        || products.find((item) => String(item._id) === giveId)
        || (String(line?.product) === giveId ? line : null);
      const incomingMrp = Number(line?.mrp ?? catalogItem?.mrp);
      const giveMrp = Number(give?.mrp);
      if (!Number.isFinite(incomingMrp) || !Number.isFinite(giveMrp)) return false;
      return round2(row.givenQuantity * giveMrp) > round2(row.quantity * incomingMrp);
    });
    if (overExpiry) {
      const line = (order.lines || []).find((item) => String(item.product) === String(overExpiry.productId));
      const catalogItem = allProducts.find((item) => String(item._id) === String(overExpiry.productId));
      toast.error(`Give amount cannot be more than the expiry amount for ${line?.name || catalogItem?.name || "this product"}`);
      return;
    }
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

  const addProduct = (product) => {
    const typedQty = addQty[product._id];
    const nextQty = typedQty ? Number(typedQty) : 1;
    if (!Number.isInteger(nextQty) || nextQty < 1) {
      toast.error("Enter a whole quantity of at least 1");
      return;
    }
    const offer = parseOffer(addPrice[product._id]);
    if (offer.error) {
      toast.error(offer.error);
      return;
    }
    changeQty(product, nextQty, offer.price);
  };
  const orderTotal = round2(order?.total || 0);

  useEffect(() => {
    if (step !== 4) return undefined;
    let cancelled = false;
    orderService.paymentQr()
      .then((res) => {
        if (!cancelled) setPaymentQr(res.data?.image || "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [step]);

  const place = async () => {
    const rows = promises.filter((row) => String(row.amount).trim() || row.dueDate);
    if (rows.some((row) => !(round2(row.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate))) {
      toast.error("Enter the amount and date for each payment");
      return;
    }
    const onlinePay = payChoice === "COD_ONLINE" ? round2(onlineAmount) : 0;
    if (payChoice === "COD_ONLINE" && (!(onlinePay > 0) || onlinePay >= orderTotal)) {
      toast.error("Online amount must be more than 0 and less than the bill");
      return;
    }
    const stillToCollect = payChoice === "COD_ONLINE" ? round2(orderTotal - onlinePay) : orderTotal;
    const dated = round2(rows.reduce((sum, row) => sum + round2(row.amount), 0));
    if (dated - stillToCollect > 0.001) {
      toast.error("Payment dates cannot add up to more than the COD amount");
      return;
    }
    setBusy(true);
    try {
      const res = await orderService.place(order._id, {
        paymentMethod: payChoice,
        onlineAmount: onlinePay,
        promises: rows.map((row) => ({ amount: round2(row.amount), dueDate: row.dueDate })),
      });
      toast.success(res.data.orderCode ? `Order placed · ${res.data.orderCode}` : "Order placed");
      navigate("/dashboard/orders");
    } catch (error) {
      toast.error(errorText(error, "Could not place order"));
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
    setClaimType("DAMAGE");
    setOtherLabel("");
    setClaims([]);
    setQtyDraft({});
    setAddQty({});
    setPayChoice("COD");
    setOnlineAmount("");
    setPromises([]);
    setPaymentQr("");
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

  const expiryProducts = allProducts.map((product) => {
    const ordered = (order?.lines || []).find((line) => String(line.product) === String(product._id));
    return { product: product._id, name: product.name, image: product.mainImage, mrp: product.mrp, quantity: ordered?.quantity };
  });

  const datedTotal = round2(promises.reduce((sum, row) => sum + (round2(row.amount) || 0), 0));

  const placed = Boolean(order && order.status && order.status !== "DRAFT");
  const showCustomerForm = customerMode === "new" || Boolean(customerId);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Place order</h1>
          <p className="text-sm text-slate-500">Customer, products, scheme, then COD or online QR, with the dates the customer will pay.</p>
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
              <div className="max-h-44 space-y-3 overflow-y-auto overscroll-contain pr-1">
              {order.lines.map((line) => {
                const product = products.find((item) => item._id === line.product) || { _id: line.product, stock: stockLeft[line.product] ?? 0, mainImage: line.image, name: line.name, mrp: line.mrp, minSalesPrice: line.minSalesPrice };
                const view = lineView(line, qtyDraft, priceDraft);
                const { qtyText, safeQty, priceText, offer, unit } = view;
                const lineSubtotal = view.subtotal;
                const minimum = line.minSalesPrice ?? product.minSalesPrice;
                const remarks = [];
                if (!offer.error && belowMin(unit, minimum)) remarks.push(BELOW_MIN_REMARK);
                if (line.overQty > 0) remarks.push("Quantity is more than available stock. It will be manufactured.");
                const saveOffer = () => {
                  if (priceDraft[line.product] === undefined) return;
                  const next = parseOffer(priceDraft[line.product]);
                  if (next.error) {
                    setPriceDraft((current) => {
                      const copy = { ...current };
                      delete copy[line.product];
                      return copy;
                    });
                    toast.error(next.error);
                    return;
                  }
                  if (next.price === round2(line.sellPrice)) {
                    setPriceDraft((current) => {
                      const copy = { ...current };
                      delete copy[line.product];
                      return copy;
                    });
                    return;
                  }
                  changeQty(product, safeQty, next.price);
                };
                return (
                  <div key={line.product} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-start">
                    <Thumb src={line.image} alt={line.name} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <p className="font-medium text-slate-900">{line.name}</p>
                        <p className="text-sm text-slate-500">MRP {(line.mrp ?? product.mrp) != null ? money.format(line.mrp ?? product.mrp) : "—"} · GST {line.gstPercent}% · Stock {stockLeft[line.product] ?? "—"}</p>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Offer price</label>
                          <Input
                            className="w-28"
                            inputMode="decimal"
                            aria-label={`Offer price for ${line.name}`}
                            disabled={busy}
                            value={priceText}
                            onChange={(event) => setPriceDraft((current) => ({ ...current, [line.product]: event.target.value.replace(/[^\d.]/g, "") }))}
                            onBlur={saveOffer}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="icon" data-qty-step="down" disabled={busy} onClick={() => {
                            const current = Number(qtyDraft[line.product] || line.quantity);
                            if (current <= 1) removeProduct(line.product);
                            else changeQty(product, current - 1, offer.error ? line.sellPrice : offer.price);
                          }}><Minus className="h-4 w-4" /></Button>
                          <Input
                            className="w-20 text-center"
                            inputMode="numeric"
                            aria-label={`Quantity for ${line.name}`}
                            disabled={busy}
                            value={qtyText}
                            onChange={(event) => setQtyDraft((current) => ({ ...current, [line.product]: event.target.value.replace(/[^\d]/g, "") }))}
                            onBlur={(event) => {
                              if (event.relatedTarget?.getAttribute?.("data-qty-step")) return;
                              commitQty(product, event.target.value, line.quantity);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                            }}
                          />
                          <Button type="button" variant="outline" size="icon" data-qty-step="up" disabled={busy} onClick={() => changeQty(product, Number(qtyDraft[line.product] || line.quantity) + 1, offer.error ? line.sellPrice : offer.price)}><Plus className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeProduct(line.product)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{safeQty} × {money.format(unit)} = {money.format(lineSubtotal)}</p>
                      </div>
                      {remarks.map((remark) => <p key={remark} className="text-xs font-medium text-amber-700">Remark: {remark}</p>)}
                    </div>
                  </div>
                );
              })}
              </div>
              <div className="flex flex-wrap justify-end gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                {(() => {
                  const totals = order.lines.reduce((sum, line) => {
                    const view = lineView(line, qtyDraft, priceDraft);
                    return { subtotal: sum.subtotal + view.subtotal, gst: sum.gst + view.gst };
                  }, { subtotal: 0, gst: 0 });
                  return (
                    <>
                      <span>Subtotal {money.format(round2(totals.subtotal))}</span>
                      <span>GST {money.format(round2(totals.gst))}</span>
                      <span className="font-semibold text-slate-900">Total {money.format(round2(totals.subtotal + totals.gst))}</span>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products to add" className="pl-9" />
          </div>
          <div className="max-h-[min(32rem,62vh)] overflow-y-auto overscroll-contain pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {products.filter((product) => !lineFor(product._id)).map((product) => {
              const typedPrice = addPrice[product._id] ?? "";
              const offer = parseOffer(typedPrice);
              const showLow = typedPrice !== "" && !offer.error && belowMin(offer.price, product.minSalesPrice);
              return (
                <div key={product._id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-3">
                    <Thumb src={product.mainImage} alt={product.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">MRP {money.format(product.mrp || 0)} · GST {product.gstPercent || 0}% · Stock {product.stock}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Offer price</label>
                      <Input
                        inputMode="decimal"
                        aria-label={`Offer price for ${product.name}`}
                        disabled={busy}
                        value={typedPrice}
                        placeholder="Selling price"
                        onChange={(event) => setAddPrice((current) => ({ ...current, [product._id]: event.target.value.replace(/[^\d.]/g, "") }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") addProduct(product);
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Qty</label>
                      <Input
                        className="text-center"
                        inputMode="numeric"
                        aria-label={`Quantity for ${product.name}`}
                        disabled={busy}
                        value={addQty[product._id] ?? ""}
                        placeholder="1"
                        onChange={(event) => setAddQty((current) => ({ ...current, [product._id]: event.target.value.replace(/[^\d]/g, "") }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") addProduct(product);
                        }}
                      />
                    </div>
                    <Button type="button" size="sm" disabled={busy} onClick={() => addProduct(product)}>Add</Button>
                  </div>
                  {showLow && <p className="text-xs font-medium text-amber-700">Remark: {BELOW_MIN_REMARK}</p>}
                </div>
              );
            })}
          </div>
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
                    <div key={gift._id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                      <Thumb src={gift.image} alt={gift.name} className="h-8 w-8" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{gift.name}</p>
                        <p className="text-slate-500">{money.format(Number(gift.price) || 0)}</p>
                      </div>
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
            <Button type="button" onClick={() => {
              if (!claims.length && order?.expiryLines?.length) {
                setExpiryOn(Boolean(order.expiryEnabled));
                const saved = order.expiryLines.map((line) => ({
                  id: `${line.product}-${line.type}`,
                  productId: String(line.product),
                  type: line.type || "EXPIRY",
                  quantity: String(line.quantity || ""),
                  note: line.note || "",
                  givenProductId: line.givenProduct ? String(line.givenProduct) : String(line.product),
                  givenQuantity: line.givenQuantity != null ? String(line.givenQuantity) : String(line.quantity || ""),
                }));
                setClaims(saved);
                setClaimType(saved[0]?.type || "DAMAGE");
                setOtherLabel(order.expiryLines.find((line) => line.type === "OTHER")?.otherLabel || "");
              }
              setStep(3);
            }}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && order && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Reimbursement</h2>
            <p className="text-sm text-slate-500">Choose yes, then a reason. Damage, return, missing, and expiry each keep their own entries. Damage, missing, and expiry show the product MRP. This does not change the bill.</p>
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
                    <option value="MISSING">Missing</option>
                  </select>
                </Field>
              </div>
              <div className="max-h-72 space-y-3 overflow-y-scroll overscroll-contain pr-1">
                {!allProducts.length && <p className="text-sm text-slate-500">Loading products...</p>}
                {expiryProducts.map((line) => {
                  const productId = String(line.product);
                  const row = claimRow(productId, claimType) || { quantity: "", note: "", givenProductId: "", givenQuantity: "" };
                  const qty = Number(row.quantity);
                  const showPrice = claimType === "EXPIRY" || claimType === "DAMAGE" || claimType === "MISSING";
                  const priceValue = showPrice && line.mrp != null && Number.isInteger(qty) && qty > 0
                    ? round2(qty * Number(line.mrp))
                    : null;
                  const giveId = row.givenProductId || productId;
                  const giveQtyText = row.givenQuantity != null ? row.givenQuantity : row.quantity;
                  const giveQty = Number(giveQtyText);
                  const giveProduct = allProducts.find((item) => String(item._id) === giveId)
                    || products.find((item) => String(item._id) === giveId)
                    || (String(line.product) === giveId ? { _id: line.product, name: line.name, mainImage: line.image, mrp: line.mrp } : null);
                  const giveMrp = giveProduct?.mrp != null ? Number(giveProduct.mrp) : null;
                  const giveValue = giveMrp != null && Number.isInteger(giveQty) && giveQty >= 0 ? round2(giveQty * giveMrp) : null;
                  const overExpiry = claimType === "EXPIRY" && priceValue != null && giveValue != null && giveValue > priceValue;
                  const maxGiveQty = claimType === "EXPIRY" && priceValue != null && giveMrp > 0 ? Math.floor((priceValue + 0.001) / giveMrp) : null;
                  const giveOptions = [
                    ...new Map([
                      ...(order.lines || []).map((item) => [String(item.product), { id: String(item.product), name: item.name }]),
                      ...allProducts.map((item) => [String(item._id), { id: String(item._id), name: item.name }]),
                      ...products.map((item) => [String(item._id), { id: String(item._id), name: item.name }]),
                    ]).values(),
                  ];
                  return (
                    <div key={line.product} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center gap-3">
                        <Thumb src={line.image} alt={line.name} className="h-12 w-12 shrink-0 bg-white object-contain" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{line.name}</p>
                          {line.quantity != null && <p className="text-xs text-slate-500">Ordered {line.quantity}</p>}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label="Quantity coming in">
                          <Input inputMode="numeric" placeholder="Qty" value={row.quantity} onChange={(event) => setClaimField(productId, claimType, { quantity: event.target.value.replace(/[^\d]/g, "") })} />
                        </Field>
                        {showPrice ? (
                          <Field label="Price (MRP)">
                            <Input value={line.mrp != null ? String(line.mrp) : ""} readOnly />
                          </Field>
                        ) : (
                          <Field label="Note (optional)">
                            <Input maxLength={200} placeholder="Optional note" value={row.note} onChange={(event) => setClaimField(productId, claimType, { note: event.target.value })} />
                          </Field>
                        )}
                      </div>
                      {(claimType === "DAMAGE" || claimType === "MISSING") && (
                        <div className="mt-3">
                          <Field label="Note (optional)">
                            <Input maxLength={200} placeholder="Optional note" value={row.note} onChange={(event) => setClaimField(productId, claimType, { note: event.target.value })} />
                          </Field>
                        </div>
                      )}
                      {priceValue != null && <p className="mt-3 text-sm font-semibold text-slate-900">{qty} × {money.format(line.mrp)} = {money.format(priceValue)}</p>}
                      {Number(row.quantity) > 0 && (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3">
                          <p className="text-sm font-medium text-slate-900">What to give</p>
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            <Field label="Product">
                              <div className="flex items-center gap-2">
                                <Thumb src={giveProduct?.mainImage || giveProduct?.image} alt={giveProduct?.name || "Product"} className="h-10 w-10 shrink-0 bg-white object-contain" />
                                <select className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm" value={giveId} onChange={(event) => setClaimField(productId, claimType, { givenProductId: event.target.value })}>
                                  {giveOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </select>
                              </div>
                            </Field>
                            <Field label="Quantity">
                              <Input inputMode="numeric" placeholder="Qty" value={giveQtyText} onChange={(event) => setClaimField(productId, claimType, { givenProductId: giveId, givenQuantity: event.target.value.replace(/[^\d]/g, "") })} />
                            </Field>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">MRP {giveMrp != null ? money.format(giveMrp) : "—"}{maxGiveQty != null ? ` · Up to ${maxGiveQty} stays within ${money.format(priceValue)}` : ""}</p>
                          {giveValue != null && <p className={cn("mt-1 text-sm font-semibold", overExpiry ? "text-red-600" : "text-slate-900")}>Give {giveProduct?.name} · {giveQty} × {money.format(giveMrp)} = {money.format(giveValue)}</p>}
                          {overExpiry && <p className="mt-1 text-xs font-medium text-red-600">This is more than the expiry amount of {money.format(priceValue)}. Reduce the quantity or pick another product.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {claims.some((row) => Number(row.quantity) > 0) && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">Entries</p>
                  {claims.filter((row) => Number(row.quantity) > 0).map((row) => {
                    const ordered = (order.lines || []).find((item) => String(item.product) === row.productId);
                    const catalogItem = allProducts.find((item) => String(item._id) === row.productId);
                    const line = ordered || (catalogItem ? { product: catalogItem._id, name: catalogItem.name, image: catalogItem.mainImage, mrp: catalogItem.mrp } : null);
                    const qty = Number(row.quantity);
                    const giveId = row.givenProductId || row.productId;
                    const give = allProducts.find((item) => String(item._id) === giveId)
                      || products.find((item) => String(item._id) === giveId)
                      || (String(line?.product) === giveId ? { name: line.name, mainImage: line.image, mrp: line.mrp } : null);
                    const giveQty = row.givenQuantity !== undefined && row.givenQuantity !== "" ? Number(row.givenQuantity) : Number(row.quantity);
                    return (
                      <div key={row.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
                        <Thumb src={line?.image} alt={line?.name || row.productId} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">{line?.name}</p>
                          <p className="text-xs text-slate-500">
                            {CLAIM_NAMES[row.type]} · {qty}
                            {(row.type === "EXPIRY" || row.type === "DAMAGE" || row.type === "MISSING") && line?.mrp != null ? ` × MRP ${money.format(line.mrp)} = ${money.format(round2(qty * Number(line.mrp)))}` : ""}
                            {row.note ? ` · ${row.note}` : ""}
                          </p>
                          {give ? (
                            <p className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-700">
                              <Thumb src={give.mainImage} alt={give.name} className="h-6 w-6 object-contain" />
                              <span>Give {give.name} × {giveQty}{give.mrp != null ? ` · MRP ${money.format(give.mrp)}` : ""}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                <Thumb src={line.image} alt={line.name} className="h-14 w-14 shrink-0 bg-white object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{line.name}</p>
                  <p className="text-xs text-slate-500">{line.quantity} × {money.format(line.sellPrice)} = {money.format(line.amount)}{line.mrp != null ? ` · MRP ${money.format(line.mrp)}` : ""} · GST {line.gstPercent}%</p>
                  {line.remark ? <p className="text-xs font-medium text-amber-700">Remark: {line.remark}</p> : null}
                </div>
                <p className="text-sm font-semibold text-slate-900">{money.format(line.amount)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">Scheme: {order.schemeName || "None"}</p>
            {order.schemeType === "OPEN" && <RichNote html={order.schemeNote} className="mt-1" />}
            <div className="mt-3 flex flex-wrap gap-2">
              {(order.schemeGifts || []).map((gift) => (
                <div key={`${gift.name}-${gift.image}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                  <Thumb src={gift.image} alt={gift.name} className="h-8 w-8" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{gift.name}</p>
                    {gift.price != null && <p className="text-slate-500">{money.format(Number(gift.price) || 0)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {order.expiryEnabled && (
            <div className="space-y-2">
              {order.expiryLines?.map((line) => {
                const source = (order.lines || []).find((item) => String(item.product) === String(line.product));
                const unit = line.mrp != null ? Number(line.mrp) : source?.mrp != null ? Number(source.mrp) : null;
                const showPrice = (line.type === "EXPIRY" || line.type === "DAMAGE" || line.type === "MISSING") && unit != null;
                const giveValue = line.givenMrp != null ? round2(line.givenQuantity * line.givenMrp) : null;
                return (
                  <div key={`${line.product}-${line.type}`} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Reimbursement · {claimText(line)}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Thumb src={line.image || source?.image} alt={line.name} className="h-12 w-12 shrink-0 bg-white object-contain" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{line.name}</p>
                        <p className="text-xs text-slate-500">Coming in · {line.quantity}{showPrice ? ` × MRP ${money.format(unit)} = ${money.format(round2(line.quantity * unit))}` : ""}{line.note ? ` · ${line.note}` : ""}</p>
                      </div>
                    </div>
                    {line.givenName ? (
                      <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2">
                        <Thumb src={line.givenImage} alt={line.givenName} className="h-12 w-12 shrink-0 bg-white object-contain" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{line.givenName}</p>
                          <p className="text-xs text-slate-500">Give · {line.givenQuantity}{line.givenMrp != null ? ` × MRP ${money.format(line.givenMrp)} = ${money.format(giveValue)}` : ""} · not added to the bill</p>
                        </div>
                        {giveValue != null && <p className="shrink-0 text-sm font-semibold text-slate-900">{money.format(giveValue)}</p>}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money.format(order.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{money.format(order.gstTotal)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span>{money.format(order.total)}</span></div>
            {(order.expiryLines || []).some((line) => line.givenName) && (
              <div className="space-y-1 border-t border-slate-200 pt-2">
                <p className="text-xs font-medium text-slate-500">Given, not added to the bill</p>
                {order.expiryLines.filter((line) => line.givenName).map((line) => (
                  <div key={`${line.product}-${line.type}-give`} className="flex justify-between gap-3 text-xs text-slate-600">
                    <span>{line.givenName} × {line.givenQuantity}</span>
                    <span>{line.givenMrp != null ? money.format(round2(line.givenQuantity * line.givenMrp)) : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!placed && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div>
                <h3 className="text-sm font-medium text-slate-900">Payment</h3>
                <p className="text-xs text-slate-500">Nothing is collected now. Online shows the QR. Add the dates and amounts the customer will pay. This does not change the bill.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["COD", "COD", "Full amount stays pending"],
                  ["ONLINE", "Online", "Show the QR, then place the order"],
                  ["COD_ONLINE", "COD + Online", "Pay some online, the rest is COD"],
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

              {payChoice === "COD_ONLINE" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Online amount">
                    <Input inputMode="decimal" placeholder="Amount to pay online" value={onlineAmount} disabled={busy} onChange={(event) => setOnlineAmount(event.target.value.replace(/[^\d.]/g, ""))} />
                  </Field>
                  <Field label="COD amount">
                    <Input readOnly value={money.format(round2(Math.max(orderTotal - (round2(onlineAmount) || 0), 0)))} />
                  </Field>
                </div>
              )}

              {(payChoice === "ONLINE" || payChoice === "COD_ONLINE") && (
                <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4">
                  {paymentQr ? (
                    <img src={paymentQr} alt="Payment QR" className="h-52 w-52 object-contain" />
                  ) : (
                    <p className="py-10 text-sm text-slate-500">No payment QR saved yet.</p>
                  )}
                  {payChoice === "COD_ONLINE" && <p className="mt-2 text-sm font-medium text-slate-900">Pay {money.format(round2(onlineAmount) || 0)} online</p>}
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">Payment dates</p>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setPromises((rows) => [...rows, { id: `${Date.now()}-${rows.length}`, amount: "", dueDate: "" }])}>Add date</Button>
                </div>
                {promises.length === 0 && <p className="text-sm text-slate-500">No dates yet. The full amount stays pending.</p>}
                {promises.map((row, index) => (
                  <div key={row.id || index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Field label="Amount">
                      <Input inputMode="decimal" placeholder="Amount" value={row.amount} disabled={busy} onChange={(event) => setPromises((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value.replace(/[^\d.]/g, "") } : item))} />
                    </Field>
                    <Field label="Date">
                      <Input type="date" value={row.dueDate} disabled={busy} onChange={(event) => setPromises((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate: event.target.value } : item))} />
                    </Field>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setPromises((rows) => rows.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                  </div>
                ))}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Dated</span>
                  <span className="font-medium text-slate-900">{money.format(datedTotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>{payChoice === "COD_ONLINE" ? "COD still without a date" : "Still without a date"}</span>
                  <span>{money.format(round2(Math.max((payChoice === "COD_ONLINE" ? orderTotal - (round2(onlineAmount) || 0) : orderTotal) - datedTotal, 0)))}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {!placed && <Button type="button" variant="outline" onClick={() => setStep(3)}>Back</Button>}
            <div className="ml-auto flex gap-2">
              {placed ? (
                <Button type="button" disabled>Order placed</Button>
              ) : (
                <Button type="button" disabled={busy} onClick={place}>Place order</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
