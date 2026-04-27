import { forwardRef } from "react";

function OtpVerifyPanelInner(
  {
    parent1Email,
    verifyCode,
    setVerifyCode,
    verifyError,
    setVerifyError,
    verifyInfo,
    setVerifyInfo,
    sendingCode,
    verifying,
    onEditEmail,
    onResend,
    onSubmit,
    setVerifyStage,
    t,
  },
  ref
) {
  return (
    <div ref={ref} className="space-y-5">
      <h3 className="font-semibold text-gray-900">{t("verifyWaiverEmailTitle")}</h3>
      <p className="text-sm text-gray-500">
        {t("verifyWaiverEmailDescPrefix")} <strong className="text-gray-900">{parent1Email}</strong>. {t("verifyWaiverEmailDescSuffix")}
      </p>
      <button
        type="button"
        onClick={onEditEmail}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
      >
        {t("verifyWrongEmail")}
      </button>

      <div>
        <label className="block text-xs text-gray-500 mb-1 text-start">{t("verificationCode")}</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={verifyCode}
          disabled={sendingCode}
          onChange={(e) => {
            setVerifyCode(e.target.value.replace(/\D/g, ""));
            setVerifyError("");
          }}
          className="w-full border rounded-lg px-3 py-2 text-lg tracking-[0.5em] font-semibold text-center disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="000000"
        />
        {sendingCode && !verifyError && (
          <p className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            {t("sending")}
          </p>
        )}
        {verifyError && <p className="mt-2 text-xs text-red-600">{verifyError}</p>}
        {!verifyError && !sendingCode && verifyInfo && (
          <p className="mt-2 text-xs text-green-600">{verifyInfo}</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setVerifyStage("waivers");
              setVerifyError("");
              setVerifyInfo("");
            }}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            {t("backToWaivers")}
          </button>
          <button
            type="button"
            onClick={onResend}
            disabled={sendingCode}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
          >
            {sendingCode ? t("sending") : t("resendCode")}
          </button>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={verifying || !verifyCode}
          className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {verifying ? t("verifying") : t("verifyAndContinue")}
        </button>
      </div>
    </div>
  );
}

const OtpVerifyPanel = forwardRef(OtpVerifyPanelInner);

export default OtpVerifyPanel;

export function OtpProcessingView({ t }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
      <div className="relative">
        <div className="h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
          <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <svg className="absolute -right-1.5 -bottom-1.5 h-6 w-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900">{t("verifyingFinalizing")}</h3>
      <p className="text-sm text-gray-500 max-w-sm">{t("verifyingFinalizingDesc")}</p>
    </div>
  );
}
