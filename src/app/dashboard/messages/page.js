"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import RecipientPicker from "@/components/RecipientPicker";

export default function MessagesPage() {
  const t = useTranslations("messages");
  const tc = useTranslations("common");

  const [view, setView] = useState("list");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [recipients, setRecipients] = useState([]);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [toast, setToast] = useState(null);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const bodyRef = useRef(null);
  const imgInputRef = useRef(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [btnModal, setBtnModal] = useState(false);
  const [btnText, setBtnText] = useState("Click Here");
  const [btnUrl, setBtnUrl] = useState("");
  const [btnColor, setBtnColor] = useState("#2563eb");
  const savedRange = useRef(null);
  const [activeFormats, setActiveFormats] = useState({});
  const bodyHtmlRef = useRef(bodyHtml);
  const [editorVersion, setEditorVersion] = useState(0);

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

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = bodyHtmlRef.current;
    }
  }, [editorVersion]);

  function setEditorHtml(html) {
    bodyHtmlRef.current = html;
    setBodyHtml(html);
    setEditorVersion((v) => v + 1);
  }

  function checkFormats() {
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  }

  useEffect(() => {
    function onSelChange() {
      const sel = window.getSelection();
      if (sel?.rangeCount && bodyRef.current?.contains(sel.anchorNode)) checkFormats();
    }
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  function execCmd(cmd, val = null) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
    checkFormats();
  }

  function insertLink() {
    const url = prompt(t("enterUrl"));
    if (url) execCmd("createLink", url);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    if (savedRange.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  function openBtnModal() {
    saveSelection();
    setBtnText("Click Here");
    setBtnUrl("");
    setBtnColor("#2563eb");
    setBtnModal(true);
  }

  function insertButton() {
    if (!btnUrl.trim()) return;
    const color = btnColor;
    const text = btnText || "Click Here";
    const url = btnUrl;

    const currentHtml = bodyRef.current?.innerHTML || bodyHtmlRef.current || "";
    const btnHtml = `<div style="text-align:center;margin:16px 0;"><a href="${url}" class="email-button" style="display:inline-block;padding:12px 28px;border-radius:8px;color:#fff;text-decoration:none;font-weight:600;font-size:16px;background:${color};">${text}</a></div><p><br></p>`;

    setBtnModal(false);
    setEditorHtml(currentHtml + btnHtml);

    setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(bodyRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 30);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const currentHtml = bodyRef.current?.innerHTML || bodyHtmlRef.current || "";
      const imgHtml = `<div style="margin:8px 0;"><img src="${reader.result}" data-init="1" style="max-width:100%;width:100%;height:auto;display:block;border-radius:8px;" /></div><p><br></p>`;

      setEditorHtml(currentHtml + imgHtml);

      setTimeout(() => {
        if (bodyRef.current) {
          bodyRef.current.focus();
          const range = document.createRange();
          range.selectNodeContents(bodyRef.current);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }, 30);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleEditorClick(e) {
    if (bodyRef.current) bodyRef.current.querySelectorAll("img.img-selected").forEach((i) => i.classList.remove("img-selected"));
    if (e.target.tagName === "IMG") {
      e.target.classList.add("img-selected");
      setSelectedImg(e.target);
    } else {
      setSelectedImg(null);
    }
  }

  function setImgSize(width) {
    if (!selectedImg) return;
    selectedImg.style.width = width;
    selectedImg.style.maxWidth = "100%";
    selectedImg.style.height = "auto";
  }

  function setImgLink(url) {
    if (!selectedImg) return;
    const parent = selectedImg.parentElement;
    if (url) {
      if (parent?.tagName === "A") {
        parent.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        selectedImg.parentNode.insertBefore(a, selectedImg);
        a.appendChild(selectedImg);
      }
    } else {
      if (parent?.tagName === "A") {
        parent.parentNode.insertBefore(selectedImg, parent);
        parent.remove();
      }
    }
  }

  function getImgLink() {
    if (!selectedImg) return "";
    const parent = selectedImg.parentElement;
    return parent?.tagName === "A" ? parent.href : "";
  }

  function setImgAlign(align) {
    if (!selectedImg) return;
    const wrapper = selectedImg.parentElement;
    if (align === "center") {
      selectedImg.style.marginLeft = "auto";
      selectedImg.style.marginRight = "auto";
      if (wrapper?.style) wrapper.style.textAlign = "center";
    } else if (align === "left") {
      selectedImg.style.marginLeft = "0";
      selectedImg.style.marginRight = "auto";
      if (wrapper?.style) wrapper.style.textAlign = "left";
    } else {
      selectedImg.style.marginLeft = "auto";
      selectedImg.style.marginRight = "0";
      if (wrapper?.style) wrapper.style.textAlign = "right";
    }
  }

  async function handleSend() {
    const html = bodyRef.current?.innerHTML || bodyHtml;
    if (!subject.trim()) { setToast({ message: t("subjectRequired"), type: "error" }); return; }
    if (!html.trim() || html === "<br>") { setToast({ message: t("bodyRequired"), type: "error" }); return; }
    if (!recipients.length) { setToast({ message: t("recipientsRequired"), type: "error" }); return; }

    setSending(true);
    try {
      const res = await fetch("/api/messages", {
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
    setSending(false);
  }

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [resending, setResending] = useState(false);

  function resetCompose() {
    setSubject("");
    setRecipients([]);
    setCustomEmail("");
    setEditingMessageId(null);
    setEditorHtml("");
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
    setEditorHtml(msg.bodyHtml || "");
    setView("compose");
  }

  function sendAgain(msg) {
    setDetail(null);
    setSubject(msg.subject || "");
    setRecipients([]);
    setEditingMessageId(null);
    setCustomEmail("");
    setEditorHtml(msg.bodyHtml || "");
    setView("compose");
  }

  async function handleResend() {
    const html = bodyRef.current?.innerHTML || bodyHtml;
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
    if (recipients.some((r) => r.email.toLowerCase() === email)) {
      setToast({ message: t("emailAlreadyAdded"), type: "error" });
      return;
    }
    setRecipients((prev) => [...prev, { type: "custom", id: `custom_${Date.now()}`, name: email, email }]);
    setCustomEmail("");
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
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>{fmtDate(detail.sentAt)}</span>
                    <span>{t("from")}: {detail.fromEmail}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      detail.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {detail.status === "sent" ? t("statusSent") : t("statusFailed")}
                    </span>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">{t("content")}</label>
                    <div className="border rounded-lg p-4 prose prose-sm max-w-none bg-gray-50"
                      dangerouslySetInnerHTML={{ __html: detail.bodyHtml }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">
                      {t("recipients")} ({detail.recipients?.length || 0})
                    </label>
                    <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                      {(detail.recipients || []).map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                          <span className="text-gray-900">{r.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">{r.email}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
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
        {/* Recipients */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <label className="text-sm font-medium text-gray-700 flex-shrink-0">{t("to")}:</label>
            {recipients.map((r, i) => (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                r.type === "custom" ? "bg-gray-100 text-gray-700" : "bg-blue-50 text-blue-700"
              }`}>
                {r.name}
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
        </div>

        {/* Subject */}
        <div className="p-4 border-b">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("subjectPlaceholder")}
            className="w-full text-sm focus:outline-none placeholder:text-gray-400"
          />
        </div>

        {/* WYSIWYG Toolbar */}
        <div className="flex items-center gap-0.5 px-4 py-2 bg-gray-50 border-b flex-wrap">
          {/* Text formatting */}
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }}
            className={`px-2 py-1 rounded text-sm font-bold transition ${activeFormats.bold ? "bg-blue-600 text-white" : "hover:bg-gray-200"}`} title={t("bold")}>B</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }}
            className={`px-2 py-1 rounded text-sm italic transition ${activeFormats.italic ? "bg-blue-600 text-white" : "hover:bg-gray-200"}`} title={t("italic")}>I</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }}
            className={`px-2 py-1 rounded text-sm underline transition ${activeFormats.underline ? "bg-blue-600 text-white" : "hover:bg-gray-200"}`} title={t("underline")}>U</button>
          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Lists */}
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }}
            className="px-2 py-1 rounded text-sm hover:bg-gray-200" title={t("bulletList")}>
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><circle cx="3" cy="5" r="1.5"/><circle cx="3" cy="10" r="1.5"/><circle cx="3" cy="15" r="1.5"/><rect x="7" y="4" width="11" height="2" rx="1"/><rect x="7" y="9" width="11" height="2" rx="1"/><rect x="7" y="14" width="11" height="2" rx="1"/></svg>
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }}
            className="px-2 py-1 rounded text-sm hover:bg-gray-200" title={t("numberedList")}>
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><text x="1" y="7" fontSize="6" fontWeight="bold">1</text><text x="1" y="12" fontSize="6" fontWeight="bold">2</text><text x="1" y="17" fontSize="6" fontWeight="bold">3</text><rect x="7" y="4" width="11" height="2" rx="1"/><rect x="7" y="9" width="11" height="2" rx="1"/><rect x="7" y="14" width="11" height="2" rx="1"/></svg>
          </button>
          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Alignment */}
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("justifyLeft"); }}
            className="px-1.5 py-1 rounded hover:bg-gray-200" title={t("alignLeft")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M3 12h12M3 18h16"/></svg>
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("justifyCenter"); }}
            className="px-1.5 py-1 rounded hover:bg-gray-200" title={t("alignCenter")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M6 12h12M4 18h16"/></svg>
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("justifyRight"); }}
            className="px-1.5 py-1 rounded hover:bg-gray-200" title={t("alignRight")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M9 12h12M5 18h16"/></svg>
          </button>
          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Link & Image & Button */}
          <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }}
            className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-blue-600" title={t("link")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); saveSelection(); imgInputRef.current?.click(); }}
            className="px-2 py-1 rounded text-sm hover:bg-gray-200" title={t("image")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"/></svg>
          </button>
          <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <button type="button" onClick={openBtnModal}
            className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-green-600 font-medium" title={t("buttonLink")}>
            <svg className="w-4 h-4 inline-block mr-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="7" width="18" height="10" rx="3"/><path d="M8 12h8"/></svg>
            {t("buttonLink")}
          </button>
          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Font size */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                execCmd("fontSize", "7");
                const sel = window.getSelection();
                if (sel.rangeCount) {
                  const span = sel.anchorNode?.parentElement;
                  if (span?.style) span.style.fontSize = e.target.value;
                }
              }
              e.target.value = "";
            }}
            className="text-xs border-0 bg-transparent py-1 pr-1 text-gray-600 cursor-pointer hover:bg-gray-200 rounded"
            defaultValue=""
          >
            <option value="" disabled>{t("size")}</option>
            <option value="12px">{t("small")}</option>
            <option value="16px">{t("normal")}</option>
            <option value="20px">{t("large")}</option>
            <option value="24px">{t("xl")}</option>
          </select>
        </div>

        {/* Image toolbar (shown when image selected) */}
        {selectedImg && (
          <div className="px-4 py-1.5 bg-blue-50 border-b text-xs space-y-1.5">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-blue-700 font-medium mr-2">{t("imageSettings")}:</span>
              <span className="text-gray-500">{t("imgSize")}:</span>
              {["25%", "50%", "75%", "100%"].map((w) => (
                <button key={w} type="button" onClick={() => setImgSize(w)}
                  className="px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100 text-blue-700">{w}</button>
              ))}
              <div className="w-px h-4 bg-blue-200 mx-1" />
              <span className="text-gray-500">{t("imgAlign")}:</span>
              <button type="button" onClick={() => setImgAlign("left")} className="px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100">
                <svg className="w-3.5 h-3.5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M3 12h12M3 18h16"/></svg>
              </button>
              <button type="button" onClick={() => setImgAlign("center")} className="px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100">
                <svg className="w-3.5 h-3.5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M6 12h12M4 18h16"/></svg>
              </button>
              <button type="button" onClick={() => setImgAlign("right")} className="px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100">
                <svg className="w-3.5 h-3.5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M9 12h12M5 18h16"/></svg>
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
              <input
                type="url"
                placeholder={t("imgLinkPlaceholder")}
                defaultValue={getImgLink()}
                key={selectedImg?.src}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setImgLink(e.target.value.trim()); } }}
                onBlur={(e) => setImgLink(e.target.value.trim())}
                className="flex-1 min-w-0 border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              {getImgLink() && (
                <button type="button" onClick={() => setImgLink("")}
                  className="px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50 text-red-500 text-xs">
                  {t("removeLink")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Editor body */}
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          onClick={handleEditorClick}
          onBlur={() => { if (bodyRef.current) { bodyHtmlRef.current = bodyRef.current.innerHTML; setBodyHtml(bodyRef.current.innerHTML); } }}
          className="px-4 py-3 text-sm min-h-[300px] focus:outline-none"
          style={{ overflowY: "auto", maxHeight: "500px" }}
        />

        {/* Button Link Modal */}
        {btnModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={() => setBtnModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-sm font-bold text-gray-900">{t("insertButton")}</h4>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("btnText")}</label>
                <input type="text" value={btnText} onChange={(e) => setBtnText(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("btnUrl")}</label>
                <input type="url" value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)}
                  placeholder="https://..." autoFocus
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("btnColor")}</label>
                <div className="flex items-center gap-2">
                  {["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0d9488", "#111827"].map((c) => (
                    <button key={c} type="button" onClick={() => setBtnColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${btnColor === c ? "border-gray-900 scale-110" : "border-transparent"}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={btnColor} onChange={(e) => setBtnColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0 p-0" title={t("customColor")} />
                </div>
              </div>
              <div className="pt-1">
                <div className="text-xs text-gray-400 mb-2">{t("preview")}:</div>
                <div className="text-center">
                  <span style={{ display: "inline-block", padding: "12px 28px", borderRadius: "8px", color: "#fff", fontWeight: 600, fontSize: "16px", background: btnColor }}>
                    {btnText || "Click Here"}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setBtnModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">{tc("cancel")}</button>
                <button onClick={insertButton} disabled={!btnUrl.trim()}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{t("insertBtn")}</button>
              </div>
            </div>
          </div>
        )}

        {/* Send */}
        <div className="p-4 border-t flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {recipients.length > 0
              ? t("recipientsSummary", { count: recipients.length })
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
