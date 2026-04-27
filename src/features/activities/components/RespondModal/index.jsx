import { useRef, useState } from "react";
import { useIntl } from "react-intl";
import Modal from "@/shared/components/Modal";
import RichTextEditor from "@/shared/components/RichTextEditor/lazy";

export default function RespondModal({ request, onClose, onSent, onError, tc, td }) {
  const intl = useIntl();
  const t = (id, values) => intl.formatMessage({ id: `payments.messages.${id}` }, values);

  const recipients = [];
  if (request.parentEmail) {
    recipients.push({
      key: "parent",
      label: `${request.parentName} (${request.parentEmail})`,
      type: "parent",
      name: request.parentName,
      email: request.parentEmail,
      phone: request.parentPhone || "",
      phonePrefix: "",
    });
  }

  const [selected, setSelected] = useState(() => recipients.map((r) => r.key));
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState(`Re: ${request.subject}`);
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [smsNotification, setSmsNotification] = useState(false);
  const [smsNotificationText, setSmsNotificationText] = useState("");
  const [sending, setSending] = useState(false);
  const editorRef = useRef(null);

  function toggleRecipient(key) {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  function notifyError(msg) {
    if (onError) onError(msg);
  }

  async function handleSend() {
    const chosenRecipients = recipients.filter((r) => selected.includes(r.key));
    if (chosenRecipients.length === 0) { notifyError(td("selectAtLeastOneRecipient")); return; }

    if (channel === "email") {
      const html = editorRef.current?.getHtml() || bodyHtml;
      if (!subject.trim()) { notifyError(t("subjectRequired")); return; }
      if (!html.trim() || html === "<br>") { notifyError(t("bodyRequired")); return; }

      setSending(true);
      try {
        const payload = {
          channel: "email",
          subject: subject.trim(),
          bodyHtml: html,
          recipients: chosenRecipients.map((r) => ({ type: r.type, name: r.name, email: r.email })),
        };
        if (smsNotification) {
          payload.smsNotification = true;
          const rawText = smsNotificationText || `${t("smsNotificationPrefix")}\n${t("smsNotificationSubjectLabel")} {email_subject}`;
          payload.smsText = rawText.replace(/\{email_subject\}/g, subject.trim());
        }
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (d.message?.status === "sent") {
          if (onSent) onSent(t("sentSuccess"));
          onClose();
        } else {
          notifyError(d.error || t("sentFailed"));
        }
      } catch {
        notifyError(t("sentFailed"));
      }
      setSending(false);
    } else {
      if (!bodyText.trim()) { notifyError(t("smsBodyRequired")); return; }

      setSending(true);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "sms",
            subject: "SMS",
            bodyText: bodyText.trim(),
            recipients: chosenRecipients.map((r) => ({ type: r.type, name: r.name, email: r.email, phonePrefix: r.phonePrefix, phone: r.phone })),
          }),
        });
        const d = await res.json();
        if (d.message?.status === "sent") {
          if (onSent) onSent(t("smsSentSuccess"));
          onClose();
        } else {
          notifyError(d.error || t("smsSendFailed"));
        }
      } catch {
        notifyError(t("smsSendFailed"));
      }
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" ariaLabel={td("respondToRequest")}>
      <Modal.Header title={td("respondToRequest")} onClose={onClose} />
      <Modal.Body className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <div><span className="font-medium text-gray-500">{td("requestFrom")}:</span> <span className="text-gray-900">{request.parentName}</span></div>
          <div><span className="font-medium text-gray-500">{td("requestSubject")}:</span> <span className="text-gray-900">{request.subject}</span></div>
          <p className="text-gray-600 text-xs mt-1">{request.message}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">{td("respondDesc")}</p>
          <div className="space-y-1.5">
            {recipients.map((r) => (
              <label key={r.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={selected.includes(r.key)} onChange={() => toggleRecipient(r.key)}
                  className="rounded border-gray-300 text-blue-600" />
                {r.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button type="button" onClick={() => setChannel("email")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "email" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
              {t("channelEmail")}
            </button>
            <button type="button" onClick={() => setChannel("sms")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "sms" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
              {t("channelSMS")}
            </button>
          </div>
        </div>

        {channel === "email" && (
          <>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className="w-full border rounded-lg px-3 py-2 text-sm" />

            <RichTextEditor
              ref={editorRef}
              value={bodyHtml}
              onChange={setBodyHtml}
              minHeight={150}
              maxHeight={250}
              compact
            />

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={smsNotification} onChange={(e) => {
                setSmsNotification(e.target.checked);
                if (e.target.checked && !smsNotificationText) {
                  setSmsNotificationText(`${t("smsNotificationPrefix")}\n${t("smsNotificationSubjectLabel")} {email_subject}`);
                }
              }} className="rounded" />
              <span className="text-sm text-gray-700">{t("smsNotification")}</span>
            </label>
            {smsNotification && (
              <>
                <textarea value={smsNotificationText} onChange={(e) => setSmsNotificationText(e.target.value)}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                <p className="text-xs text-gray-400">{t("smsVariableHint")}</p>
              </>
            )}
          </>
        )}

        {channel === "sms" && (
          <>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
              placeholder={t("smsBodyPlaceholder")}
              rows={5} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            <p className="text-xs text-gray-400">{t("smsCharCount", { count: bodyText.length })}</p>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
        <button onClick={handleSend} disabled={sending || selected.length === 0}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {sending ? t("sending") : t("send")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
