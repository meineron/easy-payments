import { centsToDisplay } from "@/shared/utils/formatting";
import ContactForm from "../ContactForm";

export default function AlreadyPaidNotice({
  activityId,
  activity,
  liveOrder,
  waiversLocked,
  onBack,
  t,
  tc,
  tp,
}) {
  return (
    <div className="space-y-0">
      <div className="bg-green-50 -mx-6 -mt-6 px-6 py-4 mb-5 border-b border-green-100 rounded-t-xl text-center">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-green-800">{t("paymentAlreadyMade")}</p>
        <p className="text-xs text-green-600 mt-1">{tp("alreadyPaid")} — ${centsToDisplay(liveOrder.paidCents)}</p>
      </div>

      <p className="text-sm text-gray-500 mb-4">{t("paymentAlreadyMadeDesc")}</p>

      <ContactForm activityId={activityId} activity={activity} order={liveOrder} t={t} tc={tc} />

      {!waiversLocked && (
        <div className="flex justify-start pt-4">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
            {tc("back")}
          </button>
        </div>
      )}
    </div>
  );
}
