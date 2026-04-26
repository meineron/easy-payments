"use client";

export default function CouponInput({
  couponCode,
  setCouponCode,
  applyCoupon,
  couponLoading,
  t,
}) {
  return (
    <div className="mb-5">
      <label className="block text-xs text-gray-500 mb-1 text-start">{t("couponCode")}</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          placeholder={t("couponPlaceholder")}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={applyCoupon}
          disabled={couponLoading || !couponCode.trim()}
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
        >
          {couponLoading ? "…" : t("apply")}
        </button>
      </div>
    </div>
  );
}
