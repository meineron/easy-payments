"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }

/**
 * Shared modal for reviewing subscription items when team/subscription changes.
 *
 * Props:
 *  - newSub: { id, title, priceCents, items: [{ name, priceCents, quantity, isRequired, isDiscount }] }
 *  - oldSub: same shape (or null if no previous subscription)
 *  - availableSubs: array of subs the admin can switch to (subs matching the team). If length > 1, shows a dropdown.
 *  - currentItems: order.items[] currently on the invoice
 *  - onConfirm({ items, subscriptionId, subscriptionTitle, subscriptionPriceCents })
 *  - onCancel()
 */
export default function SubscriptionItemReviewModal({ newSub: initialNewSub, oldSub, availableSubs, currentItems, onConfirm, onCancel }) {
  const t = useTranslations("paymentRequest");
  const tc = useTranslations("common");

  const [selectedSub, setSelectedSub] = useState(initialNewSub);

  const oldSubItems = oldSub?.items || [];
  const newSubItems = selectedSub?.items || [];

  const oldItemNames = new Set(oldSubItems.map((i) => i.name));
  const newItemNames = new Set(newSubItems.map((i) => i.name));

  const manualItems = (currentItems || []).filter((item) => !oldItemNames.has(item.name) && !newItemNames.has(item.name));
  const previousItems = (currentItems || []).filter((item) => oldItemNames.has(item.name) && !newItemNames.has(item.name));

  const [newChecked, setNewChecked] = useState(() => newSubItems.map(() => true));
  const [prevChecked, setPrevChecked] = useState(() => previousItems.map(() => false));

  useEffect(() => {
    const items = selectedSub?.items || [];
    setNewChecked(items.map(() => true));
    const oldNames = new Set((oldSub?.items || []).map((i) => i.name));
    const newNames = new Set(items.map((i) => i.name));
    const prev = (currentItems || []).filter((item) => oldNames.has(item.name) && !newNames.has(item.name));
    setPrevChecked(prev.map(() => false));
  }, [selectedSub]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleNew(idx) {
    setNewChecked((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  function togglePrev(idx) {
    setPrevChecked((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  function handleSubSwitch(subId) {
    const sub = (availableSubs || []).find((s) => s.id === subId);
    if (sub) setSelectedSub(sub);
  }

  function handleConfirm() {
    const items = [];

    newSubItems.forEach((item, idx) => {
      if (newChecked[idx]) {
        items.push({ name: item.name, priceCents: item.priceCents, quantity: item.quantity || 1, isDiscount: item.isDiscount || false });
      }
    });

    previousItems.forEach((item, idx) => {
      if (prevChecked[idx]) {
        items.push({ name: item.name, priceCents: item.priceCents, quantity: item.quantity || 1, isDiscount: item.isDiscount || false });
      }
    });

    manualItems.forEach((item) => {
      items.push({ name: item.name, priceCents: item.priceCents, quantity: item.quantity || 1, isDiscount: item.isDiscount || false });
    });

    onConfirm({
      items,
      subscriptionId: selectedSub.id,
      subscriptionTitle: selectedSub.title,
      subscriptionPriceCents: selectedSub.priceCents || 0,
    });
  }

  const hasNewItems = newSubItems.length > 0;
  const hasPrevItems = previousItems.length > 0;
  const hasManualItems = manualItems.length > 0;
  const canSwitchSub = (availableSubs || []).length > 1;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex-shrink-0">
          <h3 className="font-bold text-gray-900">{t("reviewSubscriptionItems")}</h3>

          {canSwitchSub ? (
            <div className="mt-2">
              <select
                value={selectedSub.id}
                onChange={(e) => handleSubSwitch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm font-medium"
              >
                {availableSubs.map((s) => (
                  <option key={s.id} value={s.id}>{s.title} — ${centsToDisplay(s.priceCents)}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-1">
              {t("subscriptionChangedTo", { title: selectedSub.title })}
            </p>
          )}

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase">{t("subscription")} {t("price")}</span>
            <span className="text-lg font-bold text-gray-900">${centsToDisplay(selectedSub.priceCents)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* New subscription items */}
          {hasNewItems && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("newSubscriptionItems")}</h4>
              <div className="space-y-1.5">
                {newSubItems.map((item, idx) => (
                  <label key={`${selectedSub.id}-${idx}`} className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                    newChecked[idx]
                      ? item.isDiscount ? "bg-red-50/50 border-red-200" : "bg-blue-50/50 border-blue-200"
                      : "bg-gray-50 border-gray-200 opacity-60"
                  }`}>
                    <input
                      type="checkbox"
                      checked={newChecked[idx] || false}
                      onChange={() => toggleNew(idx)}
                      className="rounded"
                    />
                    <span className="flex-1 text-sm text-gray-800">{item.name}</span>
                    <div className="flex items-center gap-2">
                      {item.isRequired && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{t("required")}</span>
                      )}
                      {item.isDiscount && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{t("discount")}</span>
                      )}
                      <span className={`text-sm font-medium ${item.isDiscount ? "text-red-600" : "text-gray-700"}`}>
                        {item.isDiscount ? "-" : ""}${centsToDisplay(item.priceCents * (item.quantity || 1))}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!hasNewItems && (
            <p className="text-sm text-gray-400 text-center py-2">{t("noItemsInSubscription")}</p>
          )}

          {/* Previous subscription items */}
          {hasPrevItems && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("previousSubscriptionItems")}</h4>
              <div className="space-y-1.5">
                {previousItems.map((item, idx) => (
                  <label key={idx} className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                    prevChecked[idx]
                      ? item.isDiscount ? "bg-red-50/50 border-red-200" : "bg-blue-50/50 border-blue-200"
                      : "bg-gray-50 border-gray-200"
                  }`}>
                    <input
                      type="checkbox"
                      checked={prevChecked[idx] || false}
                      onChange={() => togglePrev(idx)}
                      className="rounded"
                    />
                    <span className={`flex-1 text-sm ${prevChecked[idx] ? "text-gray-800" : "text-gray-400 line-through"}`}>
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {item.isDiscount && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{t("discount")}</span>
                      )}
                      <span className={`text-sm font-medium ${prevChecked[idx] ? (item.isDiscount ? "text-red-600" : "text-gray-700") : "text-gray-400 line-through"}`}>
                        {item.isDiscount ? "-" : ""}${centsToDisplay((item.priceCents || 0) * (item.quantity || 1))}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Manual items info */}
          {hasManualItems && (
            <p className="text-xs text-gray-400 italic">{t("manualItemsKept")}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={handleConfirm}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            {t("confirmChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
