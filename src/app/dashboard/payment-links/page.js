"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const EMPTY_CUSTOM_FIELD = {
  key: "",
  label: "",
  type: "text",
  optional: false,
  defaultValue: "",
  options: [{ label: "", value: "" }],
};

export default function ClubPaymentLinksPage() {
  const t = useTranslations("paymentLinks");
  const tc = useTranslations("common");

  const [view, setView] = useState("list");
  const [links, setLinks] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [priceSource, setPriceSource] = useState("existing");
  const [priceId, setPriceId] = useState("");
  const [inlineName, setInlineName] = useState("");
  const [inlineAmount, setInlineAmount] = useState("");
  const [inlineCurrency, setInlineCurrency] = useState("usd");
  const [inlineRecurring, setInlineRecurring] = useState(false);
  const [inlineInterval, setInlineInterval] = useState("month");

  const [quantity, setQuantity] = useState(1);
  const [adjustableEnabled, setAdjustableEnabled] = useState(false);
  const [adjustableMin, setAdjustableMin] = useState(1);
  const [adjustableMax, setAdjustableMax] = useState(10);

  const [submitType, setSubmitType] = useState("pay");
  const [allowPromotionCodes, setAllowPromotionCodes] = useState(false);
  const [savePaymentDetails, setSavePaymentDetails] = useState(false);

  const [customFields, setCustomFields] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchLinks();
    fetchProducts();
  }, []);

  async function fetchLinks() {
    setLoading(true);
    try {
      const res = await fetch("/api/customer-stripe/payment-links?limit=25");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLinks(data.paymentLinks || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function fetchProducts() {
    try {
      const res = await fetch("/api/customer-stripe/products?limit=100");
      const data = await res.json();
      if (!data.error) setProducts(data.products || []);
    } catch (err) {
      console.error("Failed to load products:", err);
    }
  }

  function addCustomField() {
    setCustomFields([...customFields, { ...EMPTY_CUSTOM_FIELD, options: [{ label: "", value: "" }] }]);
  }

  function removeCustomField(index) {
    setCustomFields(customFields.filter((_, i) => i !== index));
  }

  function updateCustomField(index, updates) {
    setCustomFields(customFields.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  }

  function addDropdownOption(fieldIndex) {
    const field = customFields[fieldIndex];
    updateCustomField(fieldIndex, { options: [...field.options, { label: "", value: "" }] });
  }

  function removeDropdownOption(fieldIndex, optIndex) {
    const field = customFields[fieldIndex];
    updateCustomField(fieldIndex, { options: field.options.filter((_, i) => i !== optIndex) });
  }

  function updateDropdownOption(fieldIndex, optIndex, updates) {
    const field = customFields[fieldIndex];
    updateCustomField(fieldIndex, { options: field.options.map((o, i) => (i === optIndex ? { ...o, ...updates } : o)) });
  }

  function resetForm() {
    setPriceSource("existing");
    setPriceId("");
    setInlineName("");
    setInlineAmount("");
    setInlineCurrency("usd");
    setInlineRecurring(false);
    setInlineInterval("month");
    setQuantity(1);
    setAdjustableEnabled(false);
    setAdjustableMin(1);
    setAdjustableMax(10);
    setSubmitType("pay");
    setAllowPromotionCodes(false);
    setSavePaymentDetails(false);
    setCustomFields([]);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");

    const body = {
      quantity,
      allowPromotionCodes,
      savePaymentDetails,
      customFields: customFields.filter((f) => f.key && f.label),
    };

    if (!isRecurring && submitType) {
      body.submitType = submitType;
    }

    if (priceSource === "existing") {
      if (!priceId) { setError(t("selectProductError")); setCreating(false); return; }
      body.priceId = priceId;
    } else {
      if (!inlineName || !inlineAmount) { setError(t("nameAmountRequired")); setCreating(false); return; }
      body.inlinePrice = {
        name: inlineName,
        amount: parseFloat(inlineAmount),
        currency: inlineCurrency,
        recurring: inlineRecurring,
        recurringInterval: inlineInterval,
      };
    }

    if (adjustableEnabled) {
      body.adjustableQuantity = { enabled: true, minimum: adjustableMin, maximum: adjustableMax };
    }

    try {
      const res = await fetch("/api/customer-stripe/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess(data.paymentLink.url);
      resetForm();
      fetchLinks();
      setView("list");
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  }

  function formatDate(ts) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  const pricesFlat = products.flatMap((p) => {
    const price = typeof p.default_price === "object" ? p.default_price : null;
    if (!price) return [];
    return [{ productName: p.name, priceId: price.id, amount: price.unit_amount, currency: price.currency, recurring: price.recurring }];
  });

  const isRecurring = priceSource === "inline"
    ? inlineRecurring
    : !!pricesFlat.find((p) => p.priceId === priceId)?.recurring;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">{t("title")}</h2>
        <button
          onClick={() => { setView(view === "list" ? "create" : "list"); setError(""); setSuccess(""); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "create" ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {view === "create" ? t("backToList") : t("createPaymentLink")}
        </button>
      </div>

      {success && (
        <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200 mb-6">
          {t("linkCreated")}{" "}
          <a href={success} target="_blank" rel="noopener noreferrer" className="font-medium underline break-all">{success}</a>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200 mb-6">{error}</div>
      )}

      {view === "create" ? (
        <CreateForm
          t={t}
          tc={tc}
          priceSource={priceSource} setPriceSource={setPriceSource}
          priceId={priceId} setPriceId={setPriceId} pricesFlat={pricesFlat}
          inlineName={inlineName} setInlineName={setInlineName}
          inlineAmount={inlineAmount} setInlineAmount={setInlineAmount}
          inlineCurrency={inlineCurrency} setInlineCurrency={setInlineCurrency}
          inlineRecurring={inlineRecurring} setInlineRecurring={setInlineRecurring}
          inlineInterval={inlineInterval} setInlineInterval={setInlineInterval}
          quantity={quantity} setQuantity={setQuantity}
          adjustableEnabled={adjustableEnabled} setAdjustableEnabled={setAdjustableEnabled}
          adjustableMin={adjustableMin} setAdjustableMin={setAdjustableMin}
          adjustableMax={adjustableMax} setAdjustableMax={setAdjustableMax}
          submitType={submitType} setSubmitType={setSubmitType} isRecurring={isRecurring}
          allowPromotionCodes={allowPromotionCodes} setAllowPromotionCodes={setAllowPromotionCodes}
          savePaymentDetails={savePaymentDetails} setSavePaymentDetails={setSavePaymentDetails}
          customFields={customFields} addCustomField={addCustomField}
          removeCustomField={removeCustomField} updateCustomField={updateCustomField}
          addDropdownOption={addDropdownOption} removeDropdownOption={removeDropdownOption}
          updateDropdownOption={updateDropdownOption}
          creating={creating} handleCreate={handleCreate}
        />
      ) : (
        <LinksList links={links} loading={loading} formatDate={formatDate} t={t} tc={tc} />
      )}
    </div>
  );
}

function CreateForm({
  t,
  tc,
  priceSource, setPriceSource, priceId, setPriceId, pricesFlat,
  inlineName, setInlineName, inlineAmount, setInlineAmount,
  inlineCurrency, setInlineCurrency, inlineRecurring, setInlineRecurring,
  inlineInterval, setInlineInterval,
  quantity, setQuantity,
  adjustableEnabled, setAdjustableEnabled, adjustableMin, setAdjustableMin,
  adjustableMax, setAdjustableMax,
  submitType, setSubmitType, isRecurring,
  allowPromotionCodes, setAllowPromotionCodes,
  savePaymentDetails, setSavePaymentDetails,
  customFields, addCustomField, removeCustomField, updateCustomField,
  addDropdownOption, removeDropdownOption, updateDropdownOption,
  creating, handleCreate,
}) {
  return (
    <form onSubmit={handleCreate} className="space-y-6 max-w-2xl">
      <Section title={t("product")}>
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="existing" checked={priceSource === "existing"} onChange={() => setPriceSource("existing")} className="accent-blue-600" />
            {t("chooseExisting")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="inline" checked={priceSource === "inline"} onChange={() => setPriceSource("inline")} className="accent-blue-600" />
            {t("createNew")}
          </label>
        </div>
        {priceSource === "existing" ? (
          <select value={priceId} onChange={(e) => setPriceId(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">{t("selectProduct")}</option>
            {pricesFlat.map((p) => (
              <option key={p.priceId} value={p.priceId}>
                {p.productName} — ${(p.amount / 100).toFixed(2)} {p.currency.toUpperCase()}{p.recurring ? ` / ${p.recurring.interval}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-3">
            <input type="text" placeholder={t("productName")} value={inlineName} onChange={(e) => setInlineName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            <div className="flex gap-3">
              <input type="number" step="0.01" min="0.50" placeholder={tc("amount")} value={inlineAmount} onChange={(e) => setInlineAmount(e.target.value)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              <select value={inlineCurrency} onChange={(e) => setInlineCurrency(e.target.value)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option value="usd">USD</option>
                <option value="eur">EUR</option>
                <option value="gbp">GBP</option>
                <option value="ils">ILS</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={inlineRecurring} onChange={(e) => setInlineRecurring(e.target.checked)} className="accent-blue-600" />
              {t("recurringPayment")}
            </label>
            {inlineRecurring && (
              <select value={inlineInterval} onChange={(e) => setInlineInterval(e.target.value)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option value="day">{t("daily")}</option>
                <option value="week">{t("weekly")}</option>
                <option value="month">{t("monthly")}</option>
                <option value="year">{t("yearly")}</option>
              </select>
            )}
          </div>
        )}
      </Section>

      <Section title={t("quantity")}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">{t("default")}</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={adjustableEnabled} onChange={(e) => setAdjustableEnabled(e.target.checked)} className="accent-blue-600" />
            {t("adjustQuantity")}
          </label>
        </div>
        {adjustableEnabled && (
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">{t("min")}</label>
              <input type="number" min="1" value={adjustableMin} onChange={(e) => setAdjustableMin(parseInt(e.target.value) || 1)} className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">{t("max")}</label>
              <input type="number" min="1" value={adjustableMax} onChange={(e) => setAdjustableMax(parseInt(e.target.value) || 10)} className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
          </div>
        )}
      </Section>

      <Section title={t("options")}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1 text-start">{t("buttonText")}</label>
            {isRecurring ? (
              <p className="text-sm text-amber-600 italic text-start">{t("buttonTextRecurring")}</p>
            ) : (
              <div className="flex gap-3">
                {["pay", "book", "donate"].map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input type="radio" value={type} checked={submitType === type} onChange={() => setSubmitType(type)} className="accent-blue-600" />
                    <span className="capitalize">{t(type)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allowPromotionCodes} onChange={(e) => setAllowPromotionCodes(e.target.checked)} className="accent-blue-600" />
            {t("allowPromoCodes")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={savePaymentDetails} onChange={(e) => setSavePaymentDetails(e.target.checked)} className="accent-blue-600" />
            {t("savePaymentDetails")}
          </label>
        </div>
      </Section>

      <Section title={t("customFields")}>
        {customFields.length === 0 && <p className="text-sm text-gray-400 mb-3 text-start">{t("noCustomFields")}</p>}
        <div className="space-y-4">
          {customFields.map((field, fi) => (
            <CustomFieldEditor
              key={fi} field={field} index={fi}
              t={t} tc={tc}
              updateCustomField={updateCustomField} removeCustomField={removeCustomField}
              addDropdownOption={addDropdownOption} removeDropdownOption={removeDropdownOption}
              updateDropdownOption={updateDropdownOption}
            />
          ))}
        </div>
        <button type="button" onClick={addCustomField} className="mt-3 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition">
          {t("addCustomField")}
        </button>
      </Section>

      <button type="submit" disabled={creating} className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
        {creating ? tc("creating") : t("createPaymentLink")}
      </button>
    </form>
  );
}

function CustomFieldEditor({ field, index, t, tc, updateCustomField, removeCustomField, addDropdownOption, removeDropdownOption, updateDropdownOption }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700 text-start">{t("field")} {index + 1}</span>
        <button type="button" onClick={() => removeCustomField(index)} className="text-red-500 text-sm hover:underline">{tc("remove")}</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("key")}</label>
          <input type="text" placeholder={t("keyPlaceholder")} value={field.key} onChange={(e) => updateCustomField(index, { key: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("label")}</label>
          <input type="text" placeholder={t("labelPlaceholder")} value={field.label} onChange={(e) => updateCustomField(index, { label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("fieldType")}</label>
          <select value={field.type} onChange={(e) => updateCustomField(index, { type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="text">{t("text")}</option>
            <option value="numeric">{t("number")}</option>
            <option value="dropdown">{t("dropdown")}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("defaultValue")}</label>
          <input type={field.type === "numeric" ? "number" : "text"} placeholder={t("optionalField")} value={field.defaultValue} onChange={(e) => updateCustomField(index, { defaultValue: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={field.optional} onChange={(e) => updateCustomField(index, { optional: e.target.checked })} className="accent-blue-600" />
            {t("optionalField")}
          </label>
        </div>
      </div>
      {field.type === "dropdown" && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <label className="block text-xs text-gray-500 mb-2 text-start">{t("dropdownOptions")}</label>
          <div className="space-y-2">
            {field.options.map((opt, oi) => (
              <div key={oi} className="flex gap-2 items-center">
                <input type="text" placeholder={t("label")} value={opt.label} onChange={(e) => updateDropdownOption(index, oi, { label: e.target.value })} className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                <input type="text" placeholder={t("value")} value={opt.value} onChange={(e) => updateDropdownOption(index, oi, { value: e.target.value })} className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                {field.options.length > 1 && (
                  <button type="button" onClick={() => removeDropdownOption(index, oi)} className="text-red-400 text-sm hover:text-red-600">&times;</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addDropdownOption(index)} className="mt-2 text-xs text-blue-600 hover:underline text-start">{t("addOption")}</button>
        </div>
      )}
    </div>
  );
}

function LinksList({ links, loading, formatDate, t, tc }) {
  if (loading) return <p className="text-gray-500">{tc("loading")}</p>;

  if (links.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-500">{t("noLinks")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("url")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("status")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("date")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {links.map((link) => (
            <tr key={link.id} className="hover:bg-gray-50 transition">
              <td className="px-6 py-4 text-sm">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{link.url}</a>
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${link.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {link.active ? t("active") : t("inactive")}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">{formatDate(link.created)}</td>
              <td className="px-6 py-4 text-sm">
                <button onClick={() => navigator.clipboard.writeText(link.url)} className="text-blue-600 hover:underline text-sm">{t("copyLink")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 text-start">{title}</h3>
      {children}
    </div>
  );
}
