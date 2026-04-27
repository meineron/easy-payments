import { centsToDisplay } from "@/shared/utils/formatting";

export default function InvoiceBreakdown({
  subscriptionTitle,
  subscriptionPriceCents,
  displayItems,
  couponResult,
  total,
  t,
  tc,
  tp,
}) {
  const charges = displayItems.filter((i) => !i.isDiscount);
  const discounts = displayItems.filter((i) => i.isDiscount);

  return (
    <div className="space-y-3 mb-5">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{tp("invoice")}</h3>

      {subscriptionTitle && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{subscriptionTitle}</span>
          <span className="font-medium">${centsToDisplay(subscriptionPriceCents)}</span>
        </div>
      )}
      {charges.map((item, idx) => (
        <div key={`chg-${idx}`} className="flex justify-between text-sm">
          <span className="text-gray-600">
            {item.name}
            {(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ""}
          </span>
          <span className="font-medium">${centsToDisplay((item.priceCents || 0) * (item.quantity || 1))}</span>
        </div>
      ))}
      {discounts.map((item, idx) => (
        <div key={`dsc-${idx}`} className="flex justify-between text-sm text-green-700">
          <span>
            {item.name}
            {(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ""}
          </span>
          <span>-${centsToDisplay((item.priceCents || 0) * (item.quantity || 1))}</span>
        </div>
      ))}
      {couponResult && (
        <div className="flex justify-between text-sm text-green-700">
          <span>{t("couponLabel")}: {couponResult.couponName}</span>
          <span>-${centsToDisplay(couponResult.discountCents)}</span>
        </div>
      )}
      <hr className="border-gray-200" />
      <div className="flex justify-between text-base font-bold">
        <span>{tc("total")}</span>
        <span>${centsToDisplay(total)}</span>
      </div>
    </div>
  );
}
