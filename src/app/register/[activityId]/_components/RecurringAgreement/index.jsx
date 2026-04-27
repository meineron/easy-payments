import { centsToDisplay } from "@/shared/utils/formatting";

export default function RecurringAgreement({
  activity,
  schedule,
  chosenInstallments,
  total,
  feeCents,
  currentSub,
  agreedToTerms,
  setAgreedToTerms,
  tp,
}) {
  return (
    <div className="mb-5 border-t border-gray-100 pt-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex gap-2 items-start">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">{tp("recurringAgreement")}</p>
            <p>
              {tp("recurringDesc", {
                club: activity?.clubName || tp("clubFallback"),
                amount: `$${centsToDisplay(schedule[0]?.amountCents || 0)}`,
                count: chosenInstallments - 1,
                installmentAmount: `$${centsToDisplay(schedule[1]?.amountCents || 0)}`,
                total: `$${centsToDisplay(total + feeCents)}`,
              })}
            </p>
            {feeCents > 0 && (
              <p className="mt-1 font-medium">
                {tp("recurringFeeNote", {
                  percent: currentSub.installmentFeePercent,
                  fee: `$${centsToDisplay(feeCents)}`,
                })}
              </p>
            )}
            {currentSub?.firstInstallmentDate && (
              <p className="mt-1">
                {tp("installmentsStart", {
                  date: new Date(currentSub.firstInstallmentDate).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }),
                })}
              </p>
            )}
          </div>
        </div>
      </div>
      <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">
          {feeCents > 0
            ? tp("agreeRecurringWithFee", { percent: currentSub.installmentFeePercent, fee: `$${centsToDisplay(feeCents)}` })
            : tp("agreeRecurring")}
        </span>
      </label>
    </div>
  );
}
