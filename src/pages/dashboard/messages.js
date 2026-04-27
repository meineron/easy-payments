import { useState, useEffect, useRef, useCallback } from "react";
import { useIntl } from "react-intl";
import RecipientPicker from "@/components/RecipientPicker";
import RichTextEditor from "@/components/RichTextEditor";

import { useRouter } from "next/router";
import DashboardLayout from "@/components/DashboardLayout";
export default function MessagesPage() {
  const intl = useIntl();
  // next-intl migration: use intl.formatMessage({ id: "payments.messages.key" })
  // next-intl migration: use intl.formatMessage({ id: "payments.common.key" })

  const [view, setView] = useState("list");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [smsNotification, setSmsNotification] = useState(false);
  const [smsNotificationText, setSmsNotificationText] = useState("");
  const [recipients, setRecipients] = useState([]);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [customPhonePrefix, setCustomPhonePrefix] = useState("+1");
  const [customPhone, setCustomPhone] = useState("");
  const [toast, setToast] = useState(null);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const editorRef = useRef(null);

  const loadMessages = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?page=${p}&limit=20`);
      const d = await res.json();
      setMessages(d.messages || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
      setPage(p);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function handleSend() {
    if (channel === "email") {
      const html = editorRef.current?.getHtml() || bodyHtml;
      if (!subject.trim()) { setToast({ message: t("subjectRequired"), type: "error" }); return; }
      if (!html.trim() || html === "<br>") { setToast({ message: t("bodyRequired"), type: "error" }); return; }
      if (!recipients.length) { setToast({ message: t("recipientsRequired"), type: "error" }); return; }

      setSending(true);
      try {
        const payload = { channel: "email", subject: subject.trim(), bodyHtml: html, recipients };
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
          setToast({ message: t("sentSuccess"), type: "success" });
          resetCompose();
          setView("list");
          loadMessages();
        } else if (d.message?.status === "failed") {
          const reason = d.message.errorReason;
          const msg = reason === "auth" ? t("sendFailedAuth") : reason === "connection" ? t("sendFailedConnection") : t("sentFailed");
          setToast({ message: msg, type: "error" });
        } else {
          setToast({ message: d.error || t("sentFailed"), type: "error" });
        }
      } catch {
        setToast({ message: t("sentFailed"), type: "error" });
      }
      setSending(false);
    } else {
      if (!bodyText.trim()) { setToast({ message: t("smsBodyRequired"), type: "error" }); return; }
      if (!recipients.length) { setToast({ message: t("recipientsRequired"), type: "error" }); return; }

      setSending(true);
      try {
        const smsRecipients = recipients.map((r) => ({
          ...r,
          phonePrefix: r.phonePrefix || "",
          phone: r.phone || "",
        }));
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "sms", subject: subject.trim() || "SMS", bodyText: bodyText.trim(), recipients: smsRecipients }),
        });
        const d = await res.json();
        if (d.message?.status === "sent") {
          setToast({ message: t("smsSentSuccess"), type: "success" });
          resetCompose();
          setView("list");
          loadMessages();
        } else {
          setToast({ message: d.error || t("smsSendFailed"), type: "error" });
        }
      } catch {
        setToast({ message: t("smsSendFailed"), type: "error" });
      }
      setSending(false);
    }
  }

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [resending, setResending] = useState(false);

  function resetCompose() {
    setChannel("email");
    setSubject("");
    setRecipients([]);
    setCustomEmail("");
    setCustomPhonePrefix("+1");
    setCustomPhone("");
    setEditingMessageId(null);
    setBodyHtml("");
    editorRef.current?.setHtml("");
    setBodyText("");
    setSmsNotification(false);
    setSmsNotificationText("");
  }

  async function openDetail(id) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/messages/${id}`);
      const d = await res.json();
      setDetail(d.message || null);
    } catch {}
    setDetailLoading(false);
  }

  function editAndResend(msg) {
    setDetail(null);
    setSubject(msg.subject || "");
    setRecipients(msg.recipients || []);
    setEditingMessageId(msg._id);
    setCustomEmail("");
    setBodyHtml(msg.bodyHtml || "");
    editorRef.current?.setHtml(msg.bodyHtml || "");
    setView("compose");
  }

  function sendAgain(msg) {
    setDetail(null);
    setSubject(msg.subject || "");
    setRecipients([]);
    setEditingMessageId(null);
    setCustomEmail("");
    setBodyHtml(msg.bodyHtml || "");
    editorRef.current?.setHtml(msg.bodyHtml || "");
    setView("compose");
  }

  async function handleResend() {
    const html = editorRef.current?.getHtml() || bodyHtml;
    if (!subject.trim()) { setToast({ message: t("subjectRequired"), type: "error" }); return; }
    if (!html.trim() || html === "<br>") { setToast({ message: t("bodyRequired"), type: "error" }); return; }
    if (!recipients.length) { setToast({ message: t("recipientsRequired"), type: "error" }); return; }

    setResending(true);
    try {
      const res = await fetch(`/api/messages/${editingMessageId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), bodyHtml: html, recipients }),
      });
      const d = await res.json();
      if (d.message?.status === "sent") {
        setToast({ message: t("sentSuccess"), type: "success" });
        resetCompose();
        setView("list");
        loadMessages();
      } else if (d.message?.status === "failed") {
        const reason = d.message.errorReason;
        const msg = reason === "auth" ? t("sendFailedAuth") : reason === "connection" ? t("sendFailedConnection") : t("sentFailed");
        setToast({ message: msg, type: "error" });
      } else {
        setToast({ message: d.error || t("sentFailed"), type: "error" });
      }
    } catch {
      setToast({ message: t("sentFailed"), type: "error" });
    }
    setResending(false);
  }

  function removeRecipient(idx) {
    setRecipients((prev) => prev.filter((_, i) => i !== idx));
  }

  function addCustomEmail() {
    const email = customEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setToast({ message: t("invalidEmail"), type: "error" });
      return;
    }
    if (recipients.some((r) => r.email && r.email.toLowerCase() === email)) {
      setToast({ message: t("emailAlreadyAdded"), type: "error" });
      return;
    }
    setRecipients((prev) => [...prev, { type: "custom", id: `custom_${Date.now()}`, name: email, email, phonePrefix: "", phone: "" }]);
    setCustomEmail("");
  }

  function addCustomPhone() {
    const ph = customPhone.trim().replace(/\D/g, "");
    if (!ph) {
      setToast({ message: t("phoneRequired"), type: "error" });
      return;
    }
    const fullPhone = `${customPhonePrefix}${ph}`;
    if (recipients.some((r) => r.phone && `${r.phonePrefix}${r.phone}` === fullPhone)) {
      setToast({ message: t("phoneAlreadyAdded"), type: "error" });
      return;
    }
    setRecipients((prev) => [...prev, { type: "custom", id: `custom_${Date.now()}`, name: `${customPhonePrefix} ${ph}`, email: "", phonePrefix: customPhonePrefix, phone: ph }]);
    setCustomPhone("");
  }

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /* ============= LIST VIEW ============= */
  if (view === "list") {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
          <button onClick={() => { resetCompose(); setView("compose"); }}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
            {t("newMessage")}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <p className="text-gray-500 text-sm">{t("noMessages")}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">{t("subject")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("channelHeader")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("recipients")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("date")}</th>
                    <th className="px-4 py-3 text-left font-medium">{tc("status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {messages.map((msg) => (
                    <tr key={msg._id} onClick={() => openDetail(msg._id)}
                      className="hover:bg-gray-50 cursor-pointer transition">
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{msg.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          msg.channel === "sms" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {msg.channel === "sms" ? t("channelSMS") : t("channelEmail")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{msg.recipientCount}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(msg.sentAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          msg.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {msg.status === "sent" ? t("statusSent") : t("statusFailed")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button onClick={() => loadMessages(page - 1)} disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40">{tc("prev")}</button>
                <span className="text-sm text-gray-500">{tc("page")} {page} {tc("of")} {pages}</span>
                <button onClick={() => loadMessages(page + 1)} disabled={page >= pages}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40">{tc("next")}</button>
              </div>
            )}
          </>
        )}

        {/* Detail Slide-over */}
        {(detail || detailLoading) && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDetail(null)}>
            <div className="w-full max-w-2xl bg-white h-full shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
                <h3 className="text-lg font-bold text-gray-900">{t("messageDetail")}</h3>
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              {detailLoading ? (
                <div className="flex justify-center py-20">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : detail && (
                <div className="p-6 space-y-6">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">{t("subject")}</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{detail.subject}</p>
                  </div>
                  <div className="flex gap-3 items-center flex-wrap text-sm text-gray-500">
                    <span>{fmtDate(detail.sentAt)}</span>
                    {detail.fromEmail && <span>{t("from")}: {detail.fromEmail}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      detail.channel === "sms" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {detail.channel === "sms" ? t("channelSMS") : t("channelEmail")}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      detail.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {detail.status === "sent" ? t("statusSent") : t("statusFailed")}
                    </span>
                    {detail.channel === "email" && detail.smsNotification && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200">
                        + {t("channelSMS")}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">{t("content")}</label>
                    {detail.channel === "sms" ? (
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{detail.bodyText}</p>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-4 prose prose-sm max-w-none bg-gray-50"
                        dangerouslySetInnerHTML={{ __html: detail.bodyHtml }} />
                    )}
                    {detail.channel === "email" && detail.smsNotification && detail.smsNotificationText && (
                      <div className="mt-2 border border-amber-200 rounded-lg p-3 bg-amber-50">
                        <p className="text-xs font-medium text-amber-700 mb-1">{t("smsNotification")}</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.smsNotificationText}</p>
                      </div>
                    )}
                  </div>

                  {/* Recipients */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">
                      {t("recipients")} ({detail.recipients?.length || 0})
                    </label>
                    <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                      {(detail.recipients || []).map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2 text-sm gap-2">
                          <span className="text-gray-900 font-medium flex-shrink-0">{r.name}</span>
                          <div className="flex items-center gap-2 min-w-0">
                            {r.phone && (
                              <span className="text-gray-500 text-xs" dir="ltr">{r.phonePrefix ? `${r.phonePrefix} ` : ""}{r.phone}</span>
                            )}
                            {r.email && <span className="text-gray-500 text-xs truncate">{r.email}</span>}
                            <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${
                              r.type === "player" ? "bg-blue-50 text-blue-600" : r.type === "parent" ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-600"
                            }`}>{r.type === "player" ? t("player") : r.type === "parent" ? t("parent") : t("custom")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t space-y-3">
                    {detail.status === "failed" && (
                      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        <p className="text-sm text-red-700">{t("failedHint")}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {detail.status === "failed" && (
                        <button onClick={() => editAndResend(detail)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                          </svg>
                          {t("editAndResend")}
                        </button>
                      )}
                      <button onClick={() => sendAgain(detail)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                        {t("sendToOthers")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-[60] ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}>{toast.message}</div>
        )}
      </div>
    );
  }

  /* ============= COMPOSE VIEW ============= */
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-gray-900">{editingMessageId ? t("editAndResend") : t("newMessage")}</h2>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm max-w-3xl space-y-0">
        {/* Channel selector */}
        <div className="p-4 border-b flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">{t("chooseChannel") || "Send via"}:</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button type="button" onClick={() => setChannel("email")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "email" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              {t("channelEmail")}
            </button>
            <button type="button" onClick={() => setChannel("sms")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "sms" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              {t("channelSMS")}
            </button>
          </div>
        </div>

        {/* Recipients */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <label className="text-sm font-medium text-gray-700 flex-shrink-0">{t("to")}:</label>
            {recipients.map((r, i) => (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                r.type === "custom" ? "bg-gray-100 text-gray-700" : "bg-blue-50 text-blue-700"
              }`}>
                {r.name}
                {channel === "sms" && r.phone && <span className="text-gray-400" dir="ltr">({r.phonePrefix} {r.phone})</span>}
                {channel === "email" && r.email && <span className="text-gray-400">{r.email !== r.name ? r.email : ""}</span>}
                <button onClick={() => removeRecipient(i)} className="hover:text-red-600">&times;</button>
              </span>
            ))}
            <button onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t("addRecipients")}
            </button>
          </div>

          {channel === "sms" ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 flex-1" dir="ltr">
                <select value={customPhonePrefix} onChange={(e) => setCustomPhonePrefix(e.target.value)}
                  className="w-[76px] shrink-0 px-1.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {["+1","+44","+972","+61","+49","+33","+34","+39","+81","+86"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="tel" value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomPhone(); } }}
                  placeholder={t("customPhonePlaceholder")}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={addCustomPhone} type="button"
                className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                {t("addPhone")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="email" value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomEmail(); } }}
                placeholder={t("customEmailPlaceholder")}
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={addCustomEmail} type="button"
                className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                {t("addEmail")}
              </button>
            </div>
          )}
        </div>

        {/* Subject (email only) */}
        {channel === "email" && (
          <div className="p-4 border-b">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className="w-full text-sm focus:outline-none placeholder:text-gray-400"
            />
          </div>
        )}

        {/* SMS body (sms mode) */}
        {channel === "sms" && (
          <div className="p-4 border-b">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t("smsBody")}</label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={t("smsBodyPlaceholder")}
              rows={5}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{t("smsCharCount", { count: bodyText.length })}</p>
          </div>
        )}

        {/* WYSIWYG Editor (email only) */}
        {channel !== "email" ? null : (<>
        <div className="px-4 pt-3">
          <RichTextEditor
            ref={editorRef}
            value={bodyHtml}
            onChange={setBodyHtml}
            minHeight={300}
            maxHeight={500}
          />
        </div>

        {/* SMS notification checkbox (when email) */}
        <div className="px-4 py-3 border-t mt-3">
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
              <textarea
                value={smsNotificationText}
                onChange={(e) => setSmsNotificationText(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{t("smsVariableHint")}</p>
            </>
          )}
        </div>
        </>)}

        {/* Send */}
        <div className="p-4 border-t flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {recipients.length > 0
              ? (channel === "sms" ? t("recipientsSummarySMS", { count: recipients.length }) : t("recipientsSummary", { count: recipients.length }))
              : t("noRecipientsYet")}
          </span>
          <button onClick={editingMessageId ? handleResend : handleSend} disabled={sending || resending}
            className={`px-6 py-2.5 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition flex items-center gap-2 ${
              editingMessageId ? "bg-orange-600 hover:bg-orange-700" : "bg-blue-600 hover:bg-blue-700"
            }`}>
            {(sending || resending) ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                {t("sending")}
              </>
            ) : editingMessageId ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                {t("resend")}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                {t("send")}
              </>
            )}
          </button>
        </div>
      </div>

      <RecipientPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        channel={channel}
        onConfirm={(selected) => {
          setRecipients((prev) => {
            const existing = new Set(prev.map((r) => `${r.type}:${r.id}`));
            const merged = [...prev];
            for (const r of selected) {
              const k = `${r.type}:${r.id}`;
              if (!existing.has(k)) { merged.push(r); existing.add(k); }
            }
            return merged;
          });
        }}
        t={t}
      />

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-[60] ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>{toast.message}</div>
      )}
    </div>
  );
}

MessagesPage.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;
