import { centsToDisplay } from "@/shared/utils/formatting";
import InvoiceBreakdown from "../InvoiceBreakdown";
import CouponInput from "../CouponInput";
import InstallmentPicker from "../InstallmentPicker";
import RecurringAgreement from "../RecurringAgreement";

export default function InvoiceStep({
  player,
  parent1,
  teamId,
  teams,
  activity,
  subscriptionTitle,
  subscriptionPriceCents,
  displayItems,
  couponResult,
  total,
  couponCode,
  setCouponCode,
  applyCoupon,
  couponLoading,
  maxInstallments,
  chosenInstallments,
  setChosenInstallments,
  currentSub,
  schedule,
  feeCents,
  agreedToTerms,
  setAgreedToTerms,
  paying,
  hasWaivers,
  waiverStepNum,
  waiversLocked,
  goToStep,
  saveAndPay,
  t,
  tc,
  tp,
}) {
  return (
    <div className="space-y-0">
      <div className="bg-blue-50 -mx-6 -mt-6 px-6 py-4 mb-5 border-b border-blue-100 rounded-t-xl">
        <p className="text-sm text-blue-700 font-medium">{tp("paymentFor")}</p>
        <p className="text-lg font-semibold text-blue-900">
          {player.firstName} {player.lastName}
        </p>
        {teamId && (
          <p className="text-xs text-blue-600 mt-0.5">
            {teams.find((tm) => String(tm.teamId) === String(teamId))?.name || ""}
          </p>
        )}
        <div className="mt-2 text-xs text-blue-600">
          {parent1.firstName} {parent1.lastName}
          {parent1.phone ? ` · ${parent1.phonePrefix || "+1"} ${parent1.phone}` : ""}
          {parent1.email ? ` · ${parent1.email}` : ""}
        </div>
      </div>

      <InvoiceBreakdown
        subscriptionTitle={subscriptionTitle}
        subscriptionPriceCents={subscriptionPriceCents}
        displayItems={displayItems}
        couponResult={couponResult}
        total={total}
        t={t}
        tc={tc}
        tp={tp}
      />

      {activity?.hasPayment && total > 0 && (
        <CouponInput
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          applyCoupon={applyCoupon}
          couponLoading={couponLoading}
          t={t}
        />
      )}

      {activity?.hasPayment && total > 0 && maxInstallments > 1 && (
        <InstallmentPicker
          chosenInstallments={chosenInstallments}
          setChosenInstallments={setChosenInstallments}
          maxInstallments={maxInstallments}
          total={total}
          currentSub={currentSub}
          schedule={schedule}
          feeCents={feeCents}
          tc={tc}
          tp={tp}
        />
      )}

      {activity?.hasPayment && total > 0 && chosenInstallments > 1 && (
        <RecurringAgreement
          activity={activity}
          schedule={schedule}
          chosenInstallments={chosenInstallments}
          total={total}
          feeCents={feeCents}
          currentSub={currentSub}
          agreedToTerms={agreedToTerms}
          setAgreedToTerms={setAgreedToTerms}
          tp={tp}
        />
      )}

      <div className="border-t border-gray-100 pt-5">
        {activity?.hasPayment && total > 0 && (
          <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>{tp("cardPayment")}</span>
          </div>
        )}

        <div className="flex justify-between">
          {waiversLocked ? (
            <span />
          ) : (
            <button
              onClick={() => goToStep(hasWaivers ? waiverStepNum : 2)}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              {tc("back")}
            </button>
          )}
          <button
            onClick={saveAndPay}
            disabled={paying || (chosenInstallments > 1 && !agreedToTerms)}
            className="py-3 px-8 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {paying
              ? tp("redirecting")
              : total > 0 && activity?.hasPayment
                ? chosenInstallments > 1
                  ? tp("payNow", { amount: `$${centsToDisplay(schedule[0]?.amountCents || total)}` })
                  : tp("payNow", { amount: `$${centsToDisplay(total)}` })
                : t("completeRegistration")}
          </button>
        </div>

        {activity?.hasPayment && total > 0 && chosenInstallments > 1 && (
          <p className="text-xs text-gray-500 text-center mt-2">
            {tp("firstPayment", {
              amount: `$${centsToDisplay(schedule[0]?.amountCents || 0)}`,
              count: chosenInstallments - 1,
            })}
          </p>
        )}

        {activity?.hasPayment && total > 0 && (
          <p className="text-xs text-gray-400 text-center mt-3">{tp("securePayment")}</p>
        )}
      </div>
    </div>
  );
}
