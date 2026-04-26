"use client";

import { useState } from "react";
import Modal from "@/shared/components/Modal";
import PriceInput from "@/features/activities/components/PriceInput";

export default function BulkActionModal({ type, busy, selectedCount, orderCount, allOrders, onExecute, onClose, tc, td }) {
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState(0);
  const [itemQty, setItemQty] = useState(1);
  const [itemIsDiscount, setItemIsDiscount] = useState(type === "apply_discount");
  const [discType, setDiscType] = useState("amount");
  const [discValue, setDiscValue] = useState(0);
  const [removeItemName, setRemoveItemName] = useState("");

  const allItemNames = [...new Set(allOrders.flatMap((o) => (o.items || []).map((i) => i.name)).filter(Boolean))];

  function handleSubmit() {
    if (type === "add_item") {
      if (!itemName.trim()) return;
      onExecute("add_item", { item: { name: itemName.trim(), priceCents: itemPrice, quantity: itemQty, isDiscount: itemIsDiscount } });
    } else if (type === "apply_discount") {
      if (discValue <= 0) return;
      onExecute("apply_discount", { discount: { type: discType, value: discValue } });
    } else if (type === "remove_item") {
      if (!removeItemName) return;
      onExecute("remove_item", { item: { name: removeItemName } });
    }
  }

  const title = type === "add_item" ? td("addItemToSelected") : type === "apply_discount" ? td("applyDiscountToSelected") : td("removeItemFromSelected");

  return (
    <Modal open onClose={onClose} size="md" ariaLabel={title}>
      <Modal.Header title={title} onClose={onClose} />
      <Modal.Body className="space-y-4">
        <p className="text-sm text-gray-500">
          {td("bulkApplyNote", { count: orderCount })}
          {selectedCount > orderCount ? ` (${td("expectedSkipped", { count: selectedCount - orderCount })})` : ""}
        </p>

        {type === "add_item" && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{td("itemName")}</label>
              <input value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Jersey Fee, Late Fee..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{td("priceDollar")}</label>
                <PriceInput value={itemPrice} onChange={setItemPrice} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{td("quantity")}</label>
                <input type="number" min="1" value={itemQty} onChange={(e) => setItemQty(Number(e.target.value) || 1)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={itemIsDiscount} onChange={(e) => setItemIsDiscount(e.target.checked)} className="rounded" />
              {td("discountItemLabel")}
            </label>
          </>
        )}

        {type === "apply_discount" && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{td("discountType")}</label>
              <select value={discType} onChange={(e) => setDiscType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="amount">{td("discountTypeFixed")}</option>
                <option value="percentage">{td("discountTypePercent")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{discType === "percentage" ? td("discountPercent") : td("discountDollar")}</label>
              {discType === "percentage" ? (
                <input type="text" inputMode="numeric" value={discValue || ""} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*$/.test(v)) setDiscValue(Number(v || 0)); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 10" />
              ) : (
                <PriceInput value={discValue} onChange={setDiscValue} className="w-full border rounded-lg px-3 py-2 text-sm" />
              )}
            </div>
          </>
        )}

        {type === "remove_item" && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{td("itemToRemove")}</label>
            {allItemNames.length > 0 ? (
              <select value={removeItemName} onChange={(e) => setRemoveItemName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">{td("selectAnItem")}</option>
                {allItemNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <p className="text-sm text-gray-400">{td("noItemsFoundInSelected")}</p>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
        <button onClick={handleSubmit} disabled={busy}
          className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${type === "remove_item" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
          {busy ? td("applying") : td("applyToInvoices", { count: orderCount })}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
