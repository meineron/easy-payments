"use client";

import { centsToDisplay } from "@/shared/utils/formatting";
import { computeFee } from "../../_utils/installments";

export default function InstallmentPicker({
  chosenInstallments,
  setChosenInstallments,
  maxInstallments,
  total,
  currentSub,
  schedule,
  feeCents,
  tc,
  tp,
}) {
  return (
    <div className="mb-5 border-t border-gray-100 pt-5">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{tp("paymentPlan")}</h3>
      <select
        value={chosenInstallments}
        onChange={(e) => setChosenInstallments(Number(e.target.value))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => {
          const optFee = computeFee(total, n, currentSub);
          const feeTag = optFee > 0 ? ` (+${currentSub.installmentFeePercent}% ${tp("fee")})` : "";
          return (
            <option key={n} value={n}>
              {n === 1
                ? `${tp("payFullOption")} — $${centsToDisplay(total)}`
                : `${tp("paymentsOption", { count: n })} — $${centsToDisplay(currentSub?.dueDateAmountCents || total)} ${tp("nowPlus")} ${n - 1} ${tp("installments")}${feeTag}`}
            </option>
          );
        })}
      </select>

      {currentSub?.installmentFeeThreshold > 0 && currentSub?.installmentFeePercent > 0 && (
        <p className="text-xs text-amber-700 mt-2">
          {tp("installmentFeeHint", {
            threshold: currentSub.installmentFeeThreshold,
            percent: currentSub.installmentFeePercent,
          })}
        </p>
      )}

      {chosenInstallments > 1 && currentSub?.firstInstallmentDate && (
        <p className="text-xs text-gray-500 mt-2">
          {tp("installmentNote", {
            date: new Date(currentSub.firstInstallmentDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          })}
        </p>
      )}

      {schedule.length > 0 && (
        <div className="mt-4 border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-start">
                <th className="px-3 py-2 font-medium text-gray-600">#</th>
                <th className="px-3 py-2 font-medium text-gray-600">{tc("date")}</th>
                <th className="px-3 py-2 font-medium text-gray-600 text-end">{tc("amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {schedule.map((s, idx) => (
                <tr key={idx} className={idx === 0 ? "bg-blue-50" : ""}>
                  <td className="px-3 py-2 text-gray-700">{s.number}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {s.label || new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-3 py-2 text-end font-medium">${centsToDisplay(s.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {feeCents > 0 && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
          {tp("installmentFeeNotice", {
            percent: currentSub.installmentFeePercent,
            fee: `$${centsToDisplay(feeCents)}`,
            total: `$${centsToDisplay(total + feeCents)}`,
          })}
        </div>
      )}
    </div>
  );
}
