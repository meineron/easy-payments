"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";

export default function SendMessageModal({ recipient, onClose, onSent }) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");

  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [smsNotification, setSmsNotification] = useState(false);
  const [smsNotificationText, setSmsNotificationText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);
  const bodyRef = useRef(null);

  function execCmd(cmd, val = null) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  function insertLink() {
    const url = prompt(t("enterUrl"));
    if (url) execCmd("createLink", url);
  }

  async function handleSend() {
    if (channel === "email") {
      const html = bodyRef.current?.innerHTML || bodyHtml;
      if (!subject.trim()) { setToast({ message: t("subjectRequired"), type: "error" }); return; }
      if (!html.trim() || html === "<br>") { setToast({ message: t("bodyRequired"), type: "error" }); return; }

      setSending(true);
      try {
        const payload = {
          channel: "email",
          subject: subject.trim(),
          bodyHtml: html,
          recipients: [{ type: recipient.type, id: recipient.id, name: recipient.name, email: recipient.email }],
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
          setToast({ message: d.error || t("sentFailed"), type: "error" });
        }
      } catch {
        setToast({ message: t("sentFailed"), type: "error" });
      }
      setSending(false);
    } else {
      if (!bodyText.trim()) { setToast({ message: t("smsBodyRequired"), type: "error" }); return; }

      setSending(true);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "sms",
            subject: "SMS",
            bodyText: bodyText.trim(),
            recipients: [{ type: recipient.type, id: recipient.id, name: recipient.name, email: recipient.email, phonePrefix: recipient.phonePrefix || "", phone: recipient.phone || "" }],
          }),
        });
        const d = await res.json();
        if (d.message?.status === "sent") {
          if (onSent) onSent(t("smsSentSuccess"));
          onClose();
        } else {
          setToast({ message: d.error || t("smsSendFailed"), type: "error" });
        }
      } catch {
        setToast({ message: t("smsSendFailed"), type: "error" });
      }
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{t("sendMessage")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-4">

          {/* Recipient */}
          <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">{t("to")}:</span>
            <span className="text-sm font-medium text-gray-900">{recipient.name}</span>
            {recipient.email && <span className="text-xs text-gray-400">{recipient.email}</span>}
            {recipient.phone && <span className="text-xs text-gray-400">{recipient.phone}</span>}
          </div>

          {/* Channel */}
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

              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b flex-wrap">
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }} className="px-2 py-1 rounded text-sm font-bold hover:bg-gray-200">B</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }} className="px-2 py-1 rounded text-sm italic hover:bg-gray-200">I</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }} className="px-2 py-1 rounded text-sm underline hover:bg-gray-200">U</button>
                  <div className="w-px h-5 bg-gray-300 mx-1" />
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-blue-600">{t("link")}</button>
                </div>
                <div ref={bodyRef} contentEditable suppressContentEditableWarning
                  onBlur={() => { if (bodyRef.current) setBodyHtml(bodyRef.current.innerHTML); }}
                  className="px-3 py-2 text-sm min-h-[150px] focus:outline-none"
                  style={{ overflowY: "auto", maxHeight: "250px" }}
                />
              </div>

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
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={handleSend} disabled={sending}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {sending ? t("sending") : t("send")}
          </button>
        </div>

        {toast && (
          <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-[60] ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`} onClick={() => setToast(null)}>{toast.message}</div>
        )}
      </div>
    </div>
  );
}
