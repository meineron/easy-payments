import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import Modal from "@/shared/components/Modal";
import InvitationTemplateEditor from "@/components/InvitationTemplateEditor";
import { normalizeCopyUrl } from "@/lib/copy-url";
import {
  getDefaultInvitationEmailHtml,
  getDefaultInvitationSms,
  getDefaultInvitationSubject,
} from "@/lib/registration-invitation";

export default function SendLinkRecipientModal({ type, orderId, row, activityId, activity, onClose, onDone, onError, tc, td }) {
  const { locale } = useIntl();
  const isRegistration = type === "registration";
  const savedInvitation = activity?.registrationInvitation || null;

  const [selections, setSelections] = useState({});
  const [sending, setSending] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [subject, setSubject] = useState(() =>
    isRegistration
      ? (savedInvitation?.subject || getDefaultInvitationSubject(locale))
      : ""
  );
  const [bodyHtml, setBodyHtml] = useState(() =>
    isRegistration
      ? (savedInvitation?.bodyHtml || getDefaultInvitationEmailHtml(locale))
      : ""
  );
  const [smsText, setSmsText] = useState(() =>
    isRegistration
      ? (savedInvitation?.smsText || getDefaultInvitationSms(locale))
      : ""
  );
  const [showTemplate, setShowTemplate] = useState(false);

  function resetTemplate() {
    setSubject(savedInvitation?.subject || getDefaultInvitationSubject(locale));
    setBodyHtml(savedInvitation?.bodyHtml || getDefaultInvitationEmailHtml(locale));
    setSmsText(savedInvitation?.smsText || getDefaultInvitationSms(locale));
  }

  useEffect(() => {
    let cancelled = false;
    async function loadLink() {
      setLinkLoading(true);
      try {
        const endpoint = type === "registration"
          ? `/api/activities/${activityId}/orders/${orderId}/send-registration-link`
          : `/api/activities/${activityId}/orders/${orderId}/send-payment-link`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients: [] }),
        });
        const data = await res.json();
        if (cancelled) return;
        const url = type === "registration" ? data.registrationUrl : data.paymentUrl;
        if (url) setLinkUrl(normalizeCopyUrl(url));
      } catch { /* silent */ }
      finally { if (!cancelled) setLinkLoading(false); }
    }
    loadLink();
    return () => { cancelled = true; };
  }, [type, orderId, activityId]);

  async function handleCopy() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { onError(tc("somethingWentWrong")); }
  }

  const targets = [
    {
      key: "player",
      label: td("player"),
      name: `${row.playerFirstName || ""} ${row.playerLastName || ""}`.trim(),
      email: row.playerEmail || "",
      phone: row.playerPhone || "",
      phonePrefix: row.playerPhonePrefix || "+1",
    },
    {
      key: "parent1",
      label: td("parent1Title"),
      name: `${row.parent1FirstName || ""} ${row.parent1LastName || ""}`.trim(),
      email: row.parent1Email || "",
      phone: row.parent1Phone || "",
      phonePrefix: row.parent1PhonePrefix || "+1",
    },
    {
      key: "parent2",
      label: td("parent2Title"),
      name: `${row.parent2FirstName || ""} ${row.parent2LastName || ""}`.trim(),
      email: row.parent2Email || "",
      phone: row.parent2Phone || "",
      phonePrefix: row.parent2PhonePrefix || "+1",
    },
  ].filter((t) => t.name && (t.email || t.phone));

  function toggle(targetKey, channel) {
    setSelections((prev) => {
      const k = `${targetKey}_${channel}`;
      return { ...prev, [k]: !prev[k] };
    });
  }

  const selectedCount = Object.values(selections).filter(Boolean).length;

  async function handleSend() {
    const recipients = [];
    for (const t of targets) {
      if (selections[`${t.key}_email`] && t.email) recipients.push({ target: t.key, channel: "email" });
      if (selections[`${t.key}_sms`] && t.phone) recipients.push({ target: t.key, channel: "sms" });
    }
    if (recipients.length === 0) { onError(td("selectAtLeastOneRecipient")); return; }

    setSending(true);
    try {
      const endpoint = type === "registration"
        ? `/api/activities/${activityId}/orders/${orderId}/send-registration-link`
        : `/api/activities/${activityId}/orders/${orderId}/send-payment-link`;
      const payload = isRegistration
        ? { recipients, subject, bodyHtml, smsText }
        : { recipients };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.results || {};
        let msg = td("linksSent", { count: r.sent || recipients.length });
        if (r.failed > 0) msg += ` (${td("failedCount", { count: r.failed })})`;
        onDone(msg);
      } else {
        onError(data.error || tc("somethingWentWrong"));
      }
    } catch {
      onError(tc("somethingWentWrong"));
    } finally {
      setSending(false);
    }
  }

  const title = type === "registration" ? td("sendRegistrationLink") : td("sendPaymentLink");
  const modalSize = isRegistration && showTemplate ? "3xl" : "md";

  return (
    <Modal open onClose={onClose} size={modalSize} ariaLabel={title}>
      <Modal.Header title={title} onClose={onClose} />
      <div className="p-6 overflow-y-auto">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            {type === "registration" ? td("registrationLink") : td("paymentLink")}
          </label>
          <div className="flex items-stretch gap-2 mb-5">
            <input
              readOnly
              value={linkLoading ? td("loadingLink") : linkUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-700 font-mono truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
              dir="ltr"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={!linkUrl || linkLoading}
              title={td("copyLink")}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition ${
                copied
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {td("linkCopied")}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {td("copyLink")}
                </>
              )}
            </button>
          </div>

          {targets.length > 0 && (
            <p className="text-sm text-gray-500 mb-4">{td("orSendTo")}</p>
          )}
          <div className="space-y-3">
            {targets.map((t) => (
              <div key={t.key} className="border rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900 mb-2">{t.label} — {t.name}</p>
                <div className="flex flex-wrap gap-3">
                  {t.email ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!selections[`${t.key}_email`]} onChange={() => toggle(t.key, "email")} className="rounded text-blue-600" />
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        {t.email}
                      </span>
                    </label>
                  ) : (
                    <span className="text-xs text-gray-400">{td("noEmail")}</span>
                  )}
                  {t.phone ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!selections[`${t.key}_sms`]} onChange={() => toggle(t.key, "sms")} className="rounded text-blue-600" />
                      <span className="text-sm text-gray-700 flex items-center gap-1" dir="ltr">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        {t.phonePrefix} {t.phone}
                      </span>
                    </label>
                  ) : (
                    <span className="text-xs text-gray-400">{td("noPhone")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {targets.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{td("noContactInfo")}</p>
          )}

          {isRegistration && (
            <div className="mt-6 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{td("registrationInvitation")}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{td("templatePreviewHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTemplate((v) => !v)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap ml-3"
                >
                  {showTemplate ? td("hideTemplate") : td("previewAndEditTemplate")}
                </button>
              </div>

              {showTemplate && (
                <div className="mt-4">
                  <InvitationTemplateEditor
                    subject={subject}
                    bodyHtml={bodyHtml}
                    smsText={smsText}
                    onSubjectChange={setSubject}
                    onBodyChange={setBodyHtml}
                    onSmsChange={setSmsText}
                    onReset={resetTemplate}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      <Modal.Footer>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
        <button onClick={handleSend} disabled={sending || selectedCount === 0}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {sending ? td("sending") : td("sendSelected", { count: selectedCount })}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
