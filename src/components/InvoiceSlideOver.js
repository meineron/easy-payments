"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import SubscriptionItemReviewModal from "@/components/SubscriptionItemReviewModal";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }

function PenButton({ onClick }) {
  return (
    <button onClick={onClick} className="ms-1.5 text-gray-400 hover:text-blue-600 inline-flex items-center" title="Edit">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
}

function InlineEdit({ value, onSave, type = "text", className = "" }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const ref = useRef(null);

  useEffect(() => { setText(value); }, [value]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  if (!editing) return null;
  return (
    <input ref={ref} type={type} value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { onSave(text); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") { onSave(text); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      className={`border rounded px-2 py-1 text-sm ${className}`} />
  );
}

function ReasonModal({ onConfirm, onCancel, t }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900 mb-2">{t("reasonForChange")}</h3>
        <p className="text-sm text-gray-500 mb-4">{t("reasonRequired")}</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPlaceholder")}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-4 h-20 resize-none" />
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={() => onConfirm(reason)} disabled={!reason.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Confirm</button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    pending: "bg-yellow-100 text-yellow-700",
    partial: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-500",
    failed: "bg-red-100 text-red-700",
    succeeded: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

function PaymentAccordion({ payment, isPR, activityId, orderId, baseUrl, onAction, t, tc }) {
  const [open, setOpen] = useState(false);

  const amountCents = isPR ? payment.totalCents : payment.amount;
  const status = isPR ? payment.status : payment.status;
  const paidDate = isPR ? payment.paidAt : payment.createdAt;
  const method = isPR ? (payment.sendMethod === "copy_only" ? "link" : "email") : "card";

  const itemsSummary = isPR
    ? (payment.items || []).map((i) => i.name).join(", ")
    : "Original payment";

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center hover:bg-gray-50">
        <button onClick={() => setOpen(!open)}
          className="flex-1 flex items-center gap-3 px-4 py-3 text-sm text-start">
          <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium w-24 flex-shrink-0">${centsToDisplay(amountCents)}</span>
          <span className="flex-1 truncate text-gray-500">{itemsSummary}</span>
          <StatusBadge status={status} />
          <span className="text-xs text-gray-400 w-24 text-end flex-shrink-0">
            {paidDate ? new Date(paidDate).toLocaleDateString() : "—"}
          </span>
        </button>
        {isPR && payment.status === "pending" && (
          <div className="flex items-center gap-1 pe-3 flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onAction("copy", payment); }}
              title={t("copyLink")}
              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
            </button>
            {payment.recipientEmail && (
              <button onClick={(e) => { e.stopPropagation(); onAction("resend", payment); }}
                title={t("resendEmail")}
                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onAction("remove", payment); }}
              title={t("removeRequest")}
              className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {open && (
        <div className="border-t px-4 py-3 bg-gray-50 space-y-3 text-sm">
          {isPR && (
            <>
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase">{t("itemsIncluded")}</span>
                <div className="mt-1 space-y-1">
                  {(payment.items || []).map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-700">{item.name}</span>
                      <span className="font-medium">${centsToDisplay(item.amountCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {payment.recipientEmail && (
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-500">{t("recipient")}:</span>
                  <span>{payment.recipientName ? `${payment.recipientName} — ` : ""}{payment.recipientEmail}</span>
                </div>
              )}
              {payment.note && (
                <div className="text-xs text-gray-500 bg-white rounded p-2">{payment.note}</div>
              )}
              {payment.sentAt && (
                <div className="text-xs text-gray-400">{t("sentDate")}: {new Date(payment.sentAt).toLocaleString()}</div>
              )}
              {(payment.stripeSessionId || payment.stripePaymentIntentId) && (
                <div className="text-xs text-gray-400 font-mono truncate">
                  {t("stripeRef")}: {payment.stripePaymentIntentId || payment.stripeSessionId}
                </div>
              )}
              {payment.status === "pending" && (
                <div className="flex gap-2 pt-2 border-t">
                  <button onClick={() => onAction("copy", payment)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">{t("copyLink")}</button>
                  {payment.recipientEmail && (
                    <button onClick={() => onAction("resend", payment)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">{t("resendEmail")}</button>
                  )}
                  <button onClick={() => onAction("remove", payment)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium">{t("removeRequest")}</button>
                </div>
              )}
            </>
          )}
          {!isPR && (
            <>
              <div className="flex gap-4 text-xs">
                <span className="text-gray-500">{t("paymentMethod")}:</span>
                <span>Card</span>
              </div>
              {payment.customerEmail && (
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-500">Email:</span>
                  <span>{payment.customerEmail}</span>
                </div>
              )}
              {(payment.invoiceUrl || payment.invoicePdf) && (
                <div className="flex gap-3 text-xs">
                  {payment.invoiceUrl && <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Invoice</a>}
                  {payment.invoicePdf && <a href={payment.invoicePdf} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">PDF</a>}
                </div>
              )}
              {(payment.stripeSessionId || payment.stripePaymentIntentId) && (
                <div className="text-xs text-gray-400 font-mono truncate">
                  {t("stripeRef")}: {payment.stripePaymentIntentId || payment.stripeSessionId}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AmountInput({ cents, onCommit, className = "" }) {
  const [text, setText] = useState(() => {
    const n = (cents || 0) / 100;
    return n === 0 ? "" : String(n);
  });
  const [focused, setFocused] = useState(false);
  const lastCents = useRef(cents);

  useEffect(() => {
    if (!focused && cents !== lastCents.current) {
      lastCents.current = cents;
      const n = (cents || 0) / 100;
      setText(n === 0 ? "" : String(n));
    }
  }, [cents, focused]);

  function handleChange(e) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
      setText(v);
      const c = Math.round(parseFloat(v || 0) * 100);
      lastCents.current = c;
      onCommit(c);
    }
  }

  return (
    <input type="text" inputMode="decimal" value={text}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const c = Math.round(parseFloat(text || 0) * 100);
        const n = (c || 0) / 100;
        setText(n === 0 ? "" : n.toFixed(2));
      }}
      placeholder="0.00"
      className={className} />
  );
}

function CreatePaymentForm({ order, activityId, outstanding, maxInstallments, onCreated, onCancel, t, tc }) {
  const [items, setItems] = useState(() => {
    const list = [];
    if (order.subscriptionPriceCents > 0) {
      list.push({ name: order.subscriptionTitle || "Subscription", amountCents: order.subscriptionPriceCents, checked: false });
    }
    (order.items || []).forEach((item) => {
      if (!item.isDiscount && item.priceCents > 0) {
        list.push({ name: item.name, amountCents: item.priceCents * (item.quantity || 1), checked: false });
      }
    });
    return list;
  });
  const [sendMethod, setSendMethod] = useState("parent1");
  const [customEmail, setCustomEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [allowedInstallments, setAllowedInstallments] = useState(() =>
    Array.from({ length: maxInstallments }, (_, i) => i + 1),
  );

  function toggleItem(idx) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item));
  }
  function updateAmount(idx, cents) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, amountCents: cents } : item));
  }

  function toggleInstallment(n) {
    setAllowedInstallments((prev) => {
      if (n === 1) return prev;
      return prev.includes(n) ? prev.filter((v) => v !== n) : [...prev, n].sort((a, b) => a - b);
    });
  }

  const selectedItems = items.filter((i) => i.checked);
  const total = selectedItems.reduce((s, i) => s + i.amountCents, 0);
  const exceedsBalance = total > outstanding;

  async function handleSubmit() {
    if (selectedItems.length === 0 || exceedsBalance) return;
    setSubmitting(true);
    try {
      const body = {
        items: selectedItems.map((i) => ({ name: i.name, amountCents: i.amountCents })),
        sendMethod,
        note,
        allowedInstallments,
      };
      if (sendMethod === "custom") {
        body.recipientEmail = customEmail;
      }
      const res = await fetch(`/api/activities/${activityId}/orders/${order._id}/payment-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        if (sendMethod === "copy_only" && data.paymentUrl) {
          await navigator.clipboard.writeText(data.paymentUrl);
        }
        onCreated(data);
      } else {
        alert(data.error || tc("somethingWentWrong"));
      }
    } catch {
      alert(tc("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  const hasParent1 = order.parent1Email;
  const hasParent2 = order.parent2Email;

  return (
    <div className="border rounded-xl p-4 bg-blue-50/50 space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">{t("selectItems")}</h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <input type="checkbox" checked={item.checked} onChange={() => toggleItem(idx)} className="rounded" />
            <span className="flex-1 text-sm text-gray-700">{item.name}</span>
            <AmountInput cents={item.amountCents} onCommit={(c) => updateAmount(idx, c)}
              className="w-24 border rounded px-2 py-1 text-sm text-end" />
          </div>
        ))}
      </div>

      <div className="flex justify-between text-sm font-bold border-t pt-3">
        <span>{t("runningTotal")}</span>
        <span className={exceedsBalance ? "text-red-600" : ""}>${centsToDisplay(total)}</span>
      </div>
      {exceedsBalance && <p className="text-xs text-red-600">{t("exceedsBalance")}</p>}

      {maxInstallments > 1 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">{t("allowedInstallments")}</label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => {
              const checked = allowedInstallments.includes(n);
              const isOne = n === 1;
              return (
                <label key={n}
                  className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                    checked ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-400"
                  } ${isOne ? "opacity-80 cursor-default" : "hover:border-blue-300"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleInstallment(n)}
                    disabled={isOne}
                    className="rounded text-blue-600 disabled:opacity-50"
                  />
                  <span>{n === 1 ? t("fullPayment") : t("xPayments", { count: n })}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1">{t("installmentsHint")}</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{t("note")}</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")}
          className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">{t("sendTo")}</label>
        <div className="space-y-1.5">
          {hasParent1 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="sendTo" checked={sendMethod === "parent1"} onChange={() => setSendMethod("parent1")} />
              <span>{t("parent1")} — {order.parent1FirstName} {order.parent1LastName} ({order.parent1Email})</span>
            </label>
          )}
          {hasParent2 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="sendTo" checked={sendMethod === "parent2"} onChange={() => setSendMethod("parent2")} />
              <span>{t("parent2")} — {order.parent2FirstName} {order.parent2LastName} ({order.parent2Email})</span>
            </label>
          )}
          {order.parent1Phone && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="sendTo" checked={sendMethod === "sms_parent1"} onChange={() => setSendMethod("sms_parent1")} />
              <span dir="ltr">{t("smsParent1")} — {order.parent1FirstName} {order.parent1LastName} ({order.parent1PhonePrefix || "+1"} {order.parent1Phone})</span>
            </label>
          )}
          {order.parent2Phone && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="sendTo" checked={sendMethod === "sms_parent2"} onChange={() => setSendMethod("sms_parent2")} />
              <span dir="ltr">{t("smsParent2")} — {order.parent2FirstName} {order.parent2LastName} ({order.parent2PhonePrefix || "+1"} {order.parent2Phone})</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="sendTo" checked={sendMethod === "custom"} onChange={() => setSendMethod("custom")} />
            <span>{t("customEmail")}</span>
          </label>
          {sendMethod === "custom" && (
            <input value={customEmail} onChange={(e) => setCustomEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="w-full border rounded-lg px-3 py-2 text-sm ms-6" />
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="sendTo" checked={sendMethod === "copy_only"} onChange={() => setSendMethod("copy_only")} />
            <span>{t("copyOnly")}</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
        <button onClick={handleSubmit}
          disabled={submitting || selectedItems.length === 0 || exceedsBalance || total <= 0}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {submitting ? "..." : t("createAndSend")}
        </button>
      </div>
    </div>
  );
}

export default function InvoiceSlideOver({
  order, editForm, activityId, activityTeams, activitySubs,
  transactions, paymentRequests, logs,
  onUpdateForm, onSave, onClose, saving, onRefresh,
}) {
  const t = useTranslations("paymentRequest");
  const td = useTranslations("activityDetail");
  const tc = useTranslations("common");

  const [activeTab, setActiveTab] = useState("invoice");
  const [reasonModal, setReasonModal] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [editInstallments, setEditInstallments] = useState(null);
  const [savingInstallments, setSavingInstallments] = useState(false);
  const [itemReviewModal, setItemReviewModal] = useState(null);

  if (!order || !editForm) return null;

  const totalCents = (() => {
    let total = editForm.subscriptionPriceCents || 0;
    (editForm.items || []).forEach((i) => {
      const amt = (i.priceCents || 0) * (i.quantity || 1);
      if (i.isDiscount) total -= amt; else total += amt;
    });
    if (editForm.discountType === "amount") total -= editForm.discountValue || 0;
    else if (editForm.discountType === "percentage") total -= Math.round(total * (editForm.discountValue || 0) / 100);
    total -= editForm.couponDiscountCents || 0;
    return Math.max(0, total);
  })();

  const paidCents = order.paidCents || 0;
  const outstanding = Math.max(0, totalCents - paidCents);
  const paidPercent = totalCents > 0 ? Math.min(100, Math.round((paidCents / totalCents) * 100)) : 0;

  const filteredSubs = editForm.teamId
    ? activitySubs.filter((s) => (s.includedTeamIds || []).map(String).includes(String(editForm.teamId)))
    : activitySubs;

  function addItem() {
    onUpdateForm("items", [...(editForm.items || []), { name: "", priceCents: 0, quantity: 1, isDiscount: false }]);
  }

  function updateItem(idx, field, value) {
    const items = [...(editForm.items || [])];
    items[idx] = { ...items[idx], [field]: value };
    onUpdateForm("items", items);
  }

  function removeItem(idx) {
    onUpdateForm("items", (editForm.items || []).filter((_, i) => i !== idx));
  }

  function handleSubChange(subId) {
    if (!subId) {
      setPendingChange({ field: "clearSubscription" });
      setReasonModal({ field: "clearSubscription" });
      return;
    }
    const sub = activitySubs.find((s) => s.id === subId);
    if (!sub) return;
    const oldSub = activitySubs.find((s) => s.id === editForm.subscriptionId) || null;
    setPendingChange({ field: "subscription", newSub: sub, oldSub, teamId: editForm.teamId });
    setReasonModal({ field: "subscription" });
  }

  function handleTeamChange(teamId) {
    const matchingSubs = teamId
      ? activitySubs.filter((s) => (s.includedTeamIds || []).map(String).includes(String(teamId)))
      : [];
    const currentSub = activitySubs.find((s) => s.id === editForm.subscriptionId);
    const currentSubMatchesNewTeam = currentSub && matchingSubs.some((s) => s.id === currentSub.id);

    if (currentSubMatchesNewTeam) {
      setPendingChange({ field: "teamId", value: teamId });
      setReasonModal({ field: "teamId" });
    } else if (matchingSubs.length === 1) {
      const newSub = matchingSubs[0];
      const oldSub = currentSub || null;
      setPendingChange({ field: "teamAndSubscription", teamId, newSub, oldSub });
      setReasonModal({ field: "teamAndSubscription" });
    } else if (matchingSubs.length === 0) {
      setPendingChange({ field: "teamClearSub", value: teamId });
      setReasonModal({ field: "teamClearSub" });
    } else {
      setPendingChange({ field: "teamPickSub", teamId, matchingSubs });
      setReasonModal({ field: "teamPickSub" });
    }
  }

  function handleSubPriceChange(cents) {
    setPendingChange({ field: "subscriptionPriceCents", value: cents });
    setReasonModal({ field: "subscriptionPriceCents" });
  }

  function handleItemPriceChange(idx, cents) {
    setPendingChange({ field: "itemPrice", idx, value: cents });
    setReasonModal({ field: "itemPrice" });
  }

  function openItemReview(newSub, oldSub, extraUpdates, reason) {
    const teamId = extraUpdates.teamId || editForm.teamId;
    const teamSubs = teamId
      ? activitySubs.filter((s) => (s.includedTeamIds || []).map(String).includes(String(teamId)))
      : [];
    setItemReviewModal({ newSub, oldSub, extraUpdates, reason, availableSubs: teamSubs });
  }

  function onItemReviewConfirm({ items, subscriptionId, subscriptionTitle, subscriptionPriceCents }) {
    const extra = itemReviewModal?.extraUpdates || {};
    if (extra.teamId !== undefined) onUpdateForm("teamId", extra.teamId);
    onUpdateForm("subscriptionId", subscriptionId);
    onUpdateForm("subscriptionTitle", subscriptionTitle);
    onUpdateForm("subscriptionPriceCents", subscriptionPriceCents);
    onUpdateForm("items", items);
    if (itemReviewModal?.reason) onUpdateForm("_reason", itemReviewModal.reason);
    setItemReviewModal(null);
  }

  function onReasonConfirmFull(reason) {
    if (!pendingChange) { setReasonModal(null); return; }
    const { field } = pendingChange;

    if (field === "subscription") {
      setReasonModal(null);
      openItemReview(pendingChange.newSub, pendingChange.oldSub, {}, reason);
      setPendingChange(null);
      return;
    }
    if (field === "teamAndSubscription") {
      setReasonModal(null);
      openItemReview(pendingChange.newSub, pendingChange.oldSub, { teamId: pendingChange.teamId }, reason);
      setPendingChange(null);
      return;
    }
    if (field === "teamPickSub") {
      setReasonModal(null);
      setPendingChange((prev) => ({ ...prev, reason }));
      setEditingField("pickSubForTeam");
      return;
    }
    if (field === "teamClearSub") {
      onUpdateForm("teamId", pendingChange.value);
      onUpdateForm("subscriptionId", "");
      onUpdateForm("subscriptionTitle", "");
      onUpdateForm("subscriptionPriceCents", 0);
      onUpdateForm("_reason", reason);
    } else if (field === "clearSubscription") {
      onUpdateForm("subscriptionId", "");
      onUpdateForm("subscriptionTitle", "");
      onUpdateForm("subscriptionPriceCents", 0);
      onUpdateForm("_reason", reason);
    } else if (field === "teamId") {
      onUpdateForm("teamId", pendingChange.value);
      onUpdateForm("_reason", reason);
    } else if (field === "itemPrice") {
      const items = [...(editForm.items || [])];
      items[pendingChange.idx] = { ...items[pendingChange.idx], priceCents: pendingChange.value };
      onUpdateForm("items", items);
      onUpdateForm("_reason", reason);
    } else {
      onUpdateForm(pendingChange.field, pendingChange.value);
      onUpdateForm("_reason", reason);
    }
    setReasonModal(null);
    setPendingChange(null);
  }

  function handlePickSubForTeam(subId) {
    setEditingField(null);
    if (!subId || !pendingChange) { setPendingChange(null); return; }
    const newSub = activitySubs.find((s) => s.id === subId);
    if (!newSub) { setPendingChange(null); return; }
    const oldSub = activitySubs.find((s) => s.id === editForm.subscriptionId) || null;
    const reason = pendingChange.reason || "";
    openItemReview(newSub, oldSub, { teamId: pendingChange.teamId }, reason);
    setPendingChange(null);
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function handlePRAction(action, pr) {
    setActionBusy(pr._id);
    try {
      if (action === "copy") {
        const url = `${baseUrl}/payment/request/${pr.paymentToken}`;
        await navigator.clipboard.writeText(url);
        setToast(t("linkCopied"));
      } else if (action === "resend") {
        await fetch(`/api/activities/${activityId}/orders/${order._id}/payment-requests/${pr._id}/resend`, { method: "POST" });
        setToast(t("emailResent"));
        if (onRefresh) onRefresh();
      } else if (action === "remove") {
        if (!confirm(t("removeConfirm"))) { setActionBusy(null); return; }
        await fetch(`/api/activities/${activityId}/orders/${order._id}/payment-requests/${pr._id}`, { method: "DELETE" });
        setToast(t("removed"));
        if (onRefresh) onRefresh();
      }
    } catch { /* ignore */ }
    finally { setActionBusy(null); }
  }

  function handleCreated(data) {
    setShowCreateForm(false);
    if (data.paymentUrl && data.paymentRequest?.sendMethod === "copy_only") {
      setToast(t("linkCopied"));
    } else {
      setToast(t("emailSent"));
    }
    if (onRefresh) onRefresh();
  }

  const allPayments = [
    ...(transactions || []).map((tx) => ({ ...tx, _type: "transaction" })),
    ...(paymentRequests || []).map((pr) => ({ ...pr, _type: "paymentRequest" })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-y-0 end-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-[slideInRight_0.2s_ease-out]">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-900 text-lg">
            {t("viewInvoice")} — {order.playerFirstName} {order.playerLastName}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="border-b flex flex-shrink-0">
          {[
            { key: "invoice", label: t("invoiceDetails") },
            { key: "payments", label: t("payments") },
            { key: "logs", label: td("logs") },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {/* ===== INVOICE TAB ===== */}
          {activeTab === "invoice" && (
            <div className="space-y-5">
              {/* Team & Subscription */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{td("teamAndSubscription")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t("team")}</label>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-900">{activityTeams.find((t) => t.teamId === (editForm.teamId || ""))?.name || td("noTeam")}</span>
                      <PenButton onClick={() => setEditingField("team")} />
                    </div>
                    {editingField === "team" && (
                      <select value={editForm.teamId} onChange={(e) => { setEditingField(null); handleTeamChange(e.target.value); }}
                        onBlur={() => setEditingField(null)} autoFocus
                        className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                        <option value="">{td("noTeam")}</option>
                        {activityTeams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t("subscription")}</label>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-900">{editForm.subscriptionTitle || td("noSubscription")}</span>
                      <PenButton onClick={() => setEditingField("subscription")} />
                    </div>
                    {editingField === "subscription" && (
                      <select value={editForm.subscriptionId} onChange={(e) => { setEditingField(null); handleSubChange(e.target.value); }}
                        onBlur={() => setEditingField(null)} autoFocus
                        className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                        <option value="">{td("noSubscription")}</option>
                        {filteredSubs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                      </select>
                    )}
                    {editingField === "pickSubForTeam" && (
                      <div className="mt-1">
                        <p className="text-xs text-amber-600 mb-1">{t("selectSubscriptionForTeam")}</p>
                        <select value="" onChange={(e) => handlePickSubForTeam(e.target.value)}
                          onBlur={() => { setEditingField(null); setPendingChange(null); }} autoFocus
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-amber-50">
                          <option value="">{td("noSubscription")}</option>
                          {(pendingChange?.matchingSubs || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subscription price */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{td("subscriptionPrice")}</label>
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-gray-900">${centsToDisplay(editForm.subscriptionPriceCents)}</span>
                    <PenButton onClick={() => setEditingField("subPrice")} />
                  </div>
                  {editingField === "subPrice" && (
                    <input type="text" inputMode="decimal" autoFocus
                      defaultValue={(editForm.subscriptionPriceCents / 100).toFixed(2)}
                      onBlur={(e) => { setEditingField(null); const cents = Math.round(parseFloat(e.target.value || 0) * 100); if (cents !== editForm.subscriptionPriceCents) handleSubPriceChange(cents); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingField(null); }}
                      className="w-32 border rounded px-2 py-1 text-sm mt-1" />
                  )}
                </div>
              </div>

              <hr />

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">{t("items")}</h4>
                  <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-800 font-medium">{t("addItem")}</button>
                </div>
                {(editForm.items || []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">{td("noItems")}</p>
                ) : (
                  <div className="space-y-2">
                    {(editForm.items || []).map((item, idx) => (
                      <div key={idx} className={`flex items-center gap-2 border rounded-lg p-2.5 ${item.isDiscount ? "bg-red-50/50" : ""}`}>
                        <input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)}
                          placeholder={t("itemName")} className="flex-1 border rounded px-2 py-1 text-sm" />
                        <div className="flex items-center">
                          <span className="text-sm font-medium w-20 text-end">${centsToDisplay(item.priceCents)}</span>
                          <PenButton onClick={() => setEditingField(`item-${idx}`)} />
                        </div>
                        {editingField === `item-${idx}` && (
                          <input type="text" inputMode="decimal" autoFocus
                            defaultValue={(item.priceCents / 100).toFixed(2)}
                            onBlur={(e) => { setEditingField(null); const cents = Math.round(parseFloat(e.target.value || 0) * 100); if (cents !== item.priceCents) handleItemPriceChange(idx, cents); }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingField(null); }}
                            className="w-24 border rounded px-2 py-1 text-sm" />
                        )}
                        <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                          <input type="checkbox" checked={item.isDiscount} onChange={(e) => updateItem(idx, "isDiscount", e.target.checked)} className="rounded" />
                          Disc.
                        </label>
                        <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr />

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-1.5">
                {order.processingFeeCents > 0 && (
                  <div className="flex justify-between text-sm text-gray-500 italic">
                    <span>{t("processingFee")}</span>
                    <span>${centsToDisplay(order.processingFeeCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold">
                  <span>{t("totalInvoice")}</span>
                  <span>${centsToDisplay(totalCents)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-700">
                  <span>{t("paidSoFar")}</span>
                  <span>${centsToDisplay(paidCents)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>{t("outstanding")}</span>
                  <span className={outstanding > 0 ? "text-red-600" : "text-green-600"}>
                    ${centsToDisplay(outstanding)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${paidPercent}%` }} />
                  </div>
                  <div className="text-xs text-gray-400 mt-1 text-end">{paidPercent}%</div>
                </div>
              </div>
            </div>
          )}

          {/* ===== PAYMENTS TAB ===== */}
          {activeTab === "payments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">{t("payments")}</h4>
                {outstanding > 0 && !showCreateForm && (
                  <button onClick={() => setShowCreateForm(true)}
                    className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700">
                    {t("createPayment")}
                  </button>
                )}
              </div>

              {/* Summary bar */}
              <div className="bg-gray-50 rounded-lg p-3 flex justify-between text-sm">
                <span>{t("totalInvoice")}: <strong>${centsToDisplay(totalCents)}</strong></span>
                <span className="text-green-700">{t("paidSoFar")}: <strong>${centsToDisplay(paidCents)}</strong></span>
                <span className={outstanding > 0 ? "text-red-600" : "text-green-600"}>
                  {t("outstanding")}: <strong>${centsToDisplay(outstanding)}</strong>
                </span>
              </div>

              {/* Installments from original order */}
              {order.installmentSchedule?.length > 1 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600 uppercase">
                      {t("installments")} ({order.chosenInstallments || order.installmentSchedule.length})
                    </span>
                    {order.installmentSchedule.some((i) => i.status === "pending") && !editInstallments && (
                      <button onClick={() => setEditInstallments(JSON.parse(JSON.stringify(order.installmentSchedule)))}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium">{t("manageInstallments")}</button>
                    )}
                    {editInstallments && (
                      <div className="flex gap-2">
                        <button onClick={() => setEditInstallments(null)}
                          className="text-xs text-gray-500 hover:text-gray-700">{tc("cancel")}</button>
                        <button onClick={async () => {
                          setSavingInstallments(true);
                          try {
                            const res = await fetch(`/api/activities/${activityId}/orders/${order._id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ installmentSchedule: editInstallments, _reason: "Installment schedule edited" }),
                            });
                            const data = await res.json();
                            if (data.order) {
                              setEditInstallments(null);
                              const sync = data.stripeSync;
                              if (sync?.error) {
                                setToast(t("savedButStripeFailed", { error: sync.error }));
                              } else if (sync?.cancelled) {
                                setToast(t("savedAndStripeCancelled"));
                              } else if (sync?.amountUpdated || sync?.dateUpdated) {
                                setToast(t("savedAndStripeUpdated"));
                              } else {
                                setToast(t("changesSaved"));
                              }
                              if (onRefresh) onRefresh();
                            }
                          } catch { /* ignore */ }
                          finally { setSavingInstallments(false); }
                        }}
                          disabled={savingInstallments || (editInstallments && editInstallments.reduce((s, i) => s + (i.amountCents || 0), 0) > totalCents)}
                          className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                          {savingInstallments ? "..." : t("saveInstallments")}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="divide-y">
                    {(editInstallments || order.installmentSchedule).map((inst, idx) => {
                      const isPending = inst.status === "pending";
                      const isEditing = editInstallments && isPending;
                      return (
                        <div key={idx} className={`flex items-center px-4 py-2 text-sm gap-2 ${isEditing ? "bg-blue-50/50" : ""}`}>
                          <span className="w-8 text-gray-400 font-mono flex-shrink-0">#{inst.number}</span>
                          {isEditing ? (
                            <input type="date"
                              value={inst.date ? new Date(inst.date).toISOString().slice(0, 10) : ""}
                              onChange={(e) => {
                                const updated = [...editInstallments];
                                updated[idx] = { ...updated[idx], date: e.target.value };
                                setEditInstallments(updated);
                              }}
                              className="flex-1 border rounded px-2 py-1 text-sm" />
                          ) : (
                            <span className="flex-1 text-gray-700">{new Date(inst.date).toLocaleDateString()}</span>
                          )}
                          {isEditing ? (
                            <AmountInput cents={inst.amountCents}
                              onCommit={(c) => {
                                const updated = [...editInstallments];
                                updated[idx] = { ...updated[idx], amountCents: c };
                                setEditInstallments(updated);
                              }}
                              className="w-24 border rounded px-2 py-1 text-sm text-end" />
                          ) : (
                            <span className="w-24 text-end font-medium">${centsToDisplay(inst.amountCents)}</span>
                          )}
                          <span className="w-20 text-end flex-shrink-0"><StatusBadge status={inst.status} /></span>
                        </div>
                      );
                    })}
                  </div>
                  {(() => {
                    const data = editInstallments || order.installmentSchedule;
                    const sum = data.reduce((s, i) => s + (i.amountCents || 0), 0);
                    const exceeded = sum > totalCents;
                    return (
                      <div className={`px-4 py-2.5 border-t flex items-center justify-between text-sm font-medium ${exceeded ? "bg-red-50" : "bg-gray-50"}`}>
                        <span className={exceeded ? "text-red-700" : "text-gray-700"}>{t("installmentsTotal")}</span>
                        <div className="flex items-center gap-3">
                          <span className={`font-semibold ${exceeded ? "text-red-600" : sum === totalCents ? "text-green-600" : "text-amber-600"}`}>
                            ${centsToDisplay(sum)}
                          </span>
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-600">${centsToDisplay(totalCents)}</span>
                        </div>
                      </div>
                    );
                  })()}
                  {editInstallments && editInstallments.reduce((s, i) => s + (i.amountCents || 0), 0) > totalCents && (
                    <div className="px-4 py-2 bg-red-50 text-xs text-red-600 font-medium">
                      {t("installmentsExceedTotal")}
                    </div>
                  )}
                </div>
              )}

              {/* Payment list */}
              {allPayments.length === 0 && !showCreateForm && (
                <p className="text-sm text-gray-400 text-center py-8">{t("noPayments")}</p>
              )}

              <div className="space-y-2">
                {allPayments.map((p) => (
                  <PaymentAccordion
                    key={p._id}
                    payment={p}
                    isPR={p._type === "paymentRequest"}
                    activityId={activityId}
                    orderId={order._id}
                    baseUrl={baseUrl}
                    onAction={handlePRAction}
                    t={t} tc={tc}
                  />
                ))}
              </div>

              {/* Create payment form */}
              {showCreateForm && (
                <CreatePaymentForm
                  order={order}
                  activityId={activityId}
                  outstanding={outstanding}
                  maxInstallments={(() => {
                    const sub = (activitySubs || []).find((s) => String(s.id) === String(order.subscriptionId));
                    return sub?.maxInstallments || 1;
                  })()}
                  onCreated={handleCreated}
                  onCancel={() => setShowCreateForm(false)}
                  t={t} tc={tc}
                />
              )}
            </div>
          )}

          {/* ===== LOGS TAB ===== */}
          {activeTab === "logs" && (
            <div>
              {(logs || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{td("noChangesRecordedYet")}</p>
              ) : (
                <div className="space-y-2">
                  {(logs || []).map((log) => (
                    <div key={log._id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900">{log.description}</span>
                        <span className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        by {log.userName} · <span className="font-mono">{log.field}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === "invoice" && (
          <div className="px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
            <button onClick={onSave} disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? tc("saving") : t("saveChanges")}
            </button>
          </div>
        )}
      </div>

      {/* Reason Modal */}
      {reasonModal && (
        <ReasonModal
          t={t}
          onConfirm={onReasonConfirmFull}
          onCancel={() => { setReasonModal(null); setPendingChange(null); }}
        />
      )}

      {/* Subscription Item Review Modal */}
      {itemReviewModal && (
        <SubscriptionItemReviewModal
          newSub={itemReviewModal.newSub}
          oldSub={itemReviewModal.oldSub}
          availableSubs={itemReviewModal.availableSubs}
          currentItems={editForm.items || []}
          onConfirm={onItemReviewConfirm}
          onCancel={() => setItemReviewModal(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 end-4 z-[100] bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium animate-[slideIn_0.2s_ease-out]"
          onClick={() => setToast(null)}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}
