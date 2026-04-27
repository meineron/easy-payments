export default function WaiversStep({
  waivers,
  waiverConsents,
  setWaiverConsents,
  savedWaiverIds,
  initialOrder,
  waiverName,
  savingDraft,
  sendingCode,
  onBack,
  onContinue,
  t,
  tc,
}) {
  const continueDisabled =
    savingDraft ||
    sendingCode ||
    waivers.filter((w) => w.isRequired).some((w) => !waiverConsents[w._id]);

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-gray-900">{t("waiversTitle")}</h3>
      <p className="text-sm text-gray-500">{t("waiversDesc")}</p>

      <div className="space-y-4">
        {waivers.map((w) => {
          const agreed = !!waiverConsents[w._id];
          const locked = savedWaiverIds.has(String(w._id));
          const savedConsent = locked
            ? (initialOrder?.waiverConsents || []).find((c) => c.waiverId === String(w._id))
            : null;
          return (
            <div key={w._id} className={`border rounded-lg overflow-hidden ${locked ? "bg-gray-50" : ""}`}>
              <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{w.title}</span>
                <div className="flex items-center gap-2">
                  {locked && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">{t("waiverSigned")}</span>
                  )}
                  {w.isRequired && !locked && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">{tc("required")}</span>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 max-h-64 overflow-y-auto border-b">
                <div className="prose prose-sm text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: w.contentHtml }} />
              </div>
              <label className={`flex items-start gap-3 px-4 py-3 ${locked ? "cursor-default" : "cursor-pointer hover:bg-gray-50"} transition`}>
                <input
                  type="checkbox"
                  checked={agreed}
                  disabled={locked}
                  onChange={locked ? undefined : (e) => setWaiverConsents((prev) => ({ ...prev, [w._id]: e.target.checked }))}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                />
                <span className={`text-sm text-start ${locked ? "text-gray-500" : "text-gray-700"}`}>
                  {t("waiverPrefix")}
                  <strong>{waiverName}</strong>
                  {t("waiverMiddle")}
                  <strong>{w.title}</strong>
                  {t("waiverSuffix")}
                  {locked && savedConsent?.agreedAt && (
                    <span className="block text-xs text-green-600 mt-1">
                      {t("waiverSignedAt", {
                        date: new Date(savedConsent.agreedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                        name: savedConsent.agreedByName || "",
                      })}
                    </span>
                  )}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
          {tc("back")}
        </button>
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition inline-flex items-center justify-center gap-2"
        >
          {(savingDraft || sendingCode) && (
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {sendingCode ? t("sending") : (savingDraft ? tc("saving") : tc("continue"))}
        </button>
      </div>
    </div>
  );
}
