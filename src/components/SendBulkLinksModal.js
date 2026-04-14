"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";

export default function SendBulkLinksModal({ type, activityId, activity, orders, expectedPlayers, onClose, onDone, onError }) {
  const td = useTranslations("activityDetail");
  const tm = useTranslations("messages");
  const tc = useTranslations("common");

  const activityTeams = (activity?.teams || []).map((row) => ({
    teamId: row.teamId?._id || row.teamId, name: row.teamId?.name || "Unknown",
  }));

  const [selectedTeams, setSelectedTeams] = useState(() => new Set(activityTeams.map((row) => row.teamId)));
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState(
    type === "payment"
      ? `${activity?.title || "Activity"} — Payment Link`
      : `${activity?.title || "Activity"} — Registration Link`
  );
  const [bodyHtml, setBodyHtml] = useState(
    type === "payment" ? td("defaultPaymentEmailBody") : td("defaultRegistrationEmailBody")
  );
  const [smsText, setSmsText] = useState(
    type === "payment"
      ? td("defaultPaymentSmsBody", { activity: activity?.title || "" , link: "{link}" })
      : td("defaultRegistrationSmsBody", { activity: activity?.title || "" , link: "{link}" })
  );
  const [smsNotification, setSmsNotification] = useState(false);
  const [smsNotificationText, setSmsNotificationText] = useState("");
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);
  const imgInputRef = useRef(null);

  function execCmd(cmd, val = null) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  function insertLink() {
    const url = prompt(td("enterUrl"));
    if (url) execCmd("createLink", url);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      bodyRef.current?.focus();
      document.execCommand("insertImage", false, reader.result);
      const imgs = bodyRef.current?.querySelectorAll("img");
      if (imgs) imgs.forEach((img) => { img.style.maxWidth = "100%"; img.style.width = "100%"; img.style.height = "auto"; img.style.display = "block"; img.style.borderRadius = "8px"; img.style.margin = "8px 0"; });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function toggleTeam(tid) {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid); else next.add(tid);
      return next;
    });
  }

  function toggleAll() {
    if (selectedTeams.size === activityTeams.length) setSelectedTeams(new Set());
    else setSelectedTeams(new Set(activityTeams.map((row) => row.teamId)));
  }

  const eligibleCount = [...orders, ...expectedPlayers].filter((r) => {
    const tid = String(r.teamId?._id || r.teamId || "");
    if (!selectedTeams.has(tid)) return false;
    if (type === "payment" && r.status === "paid") return false;
    if (!r.parent1Email && !r._isExpected) return false;
    return true;
  }).length;

  const orderOnlyCount = orders.filter((r) => {
    const tid = String(r.teamId?._id || r.teamId || "");
    if (!selectedTeams.has(tid)) return false;
    if (type === "payment" && r.status === "paid") return false;
    return !!r.parent1Email;
  }).length;

  async function handleSend() {
    if (channel === "email") {
      const html = bodyRef.current?.innerHTML || bodyHtml;
      if (!subject.trim()) { onError(td("subjectRequired")); return; }
      if (!html.trim() || html.trim() === "<br>") { onError(td("messageBodyRequired")); return; }
      if (selectedTeams.size === 0) { onError(td("selectAtLeastOneTeam")); return; }

      setSending(true);
      try {
        const endpoint = type === "payment"
          ? `/api/activities/${activityId}/orders/send-bulk-payment-emails`
          : `/api/activities/${activityId}/orders/send-bulk-registration-links`;

        const payload = { teamIds: [...selectedTeams], subject: subject.trim(), bodyHtml: html, channel: "email" };
        if (smsNotification) {
          payload.smsNotification = true;
          const rawText = smsNotificationText || `${tm("smsNotificationPrefix")}\n${tm("smsNotificationSubjectLabel")} {email_subject}`;
          payload.smsText = rawText.replace(/\{email_subject\}/g, subject.trim());
        }

        const res = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          let msg = type === "payment"
            ? td("sentPaymentLinks", { count: data.sentCount })
            : td("sentRegistrationLinks", { count: data.sentCount });
          if (data.errorCount > 0) msg += ` (${td("failedCount", { count: data.errorCount })})`;
          onDone(msg);
        } else {
          onError(data.error || td("failedToSendEmails"));
        }
      } catch { onError(td("failedToSendEmails")); }
      finally { setSending(false); }
    } else {
      if (!smsText.trim()) { onError(td("messageBodyRequired")); return; }
      if (selectedTeams.size === 0) { onError(td("selectAtLeastOneTeam")); return; }

      setSending(true);
      try {
        const endpoint = type === "payment"
          ? `/api/activities/${activityId}/orders/send-bulk-payment-emails`
          : `/api/activities/${activityId}/orders/send-bulk-registration-links`;

        const res = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamIds: [...selectedTeams], channel: "sms", smsText: smsText.trim() }),
        });
        const data = await res.json();
        if (data.success) {
          let msg = type === "payment"
            ? td("sentPaymentLinks", { count: data.sentCount })
            : td("sentRegistrationLinks", { count: data.sentCount });
          if (data.errorCount > 0) msg += ` (${td("failedCount", { count: data.errorCount })})`;
          onDone(msg);
        } else {
          onError(data.error || td("failedToSendEmails"));
        }
      } catch { onError(td("failedToSendEmails")); }
      finally { setSending(false); }
    }
  }

  const title = type === "payment" ? td("sendPaymentLinksTitle") : td("sendRegistrationLinksTitle");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-5">

          {/* Channel selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-700">{td("chooseChannel")}:</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button type="button" onClick={() => setChannel("email")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "email" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                {td("sendViaEmail")}
              </button>
              <button type="button" onClick={() => setChannel("sms")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "sms" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                {td("sendViaSMS")}
              </button>
            </div>
          </div>

          {/* Teams */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">{td("teams")}</label>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800">
                {selectedTeams.size === activityTeams.length ? td("deselectAll") : td("selectAll")}
              </button>
            </div>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
              {activityTeams.map((team) => (
                <label key={team.teamId} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={selectedTeams.has(team.teamId)} onChange={() => toggleTeam(team.teamId)} className="rounded" />
                  {team.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{td("teamsSelected", { count: selectedTeams.size })}</p>
          </div>

          {/* Email mode */}
          {channel === "email" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{td("emailSubject")}</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{td("emailMessage")}</label>
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b flex-wrap">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }} className="px-2 py-1 rounded text-sm font-bold hover:bg-gray-200">{td("bold")}</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }} className="px-2 py-1 rounded text-sm italic hover:bg-gray-200">{td("italic")}</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }} className="px-2 py-1 rounded text-sm underline hover:bg-gray-200">{td("underline")}</button>
                    <div className="w-px h-5 bg-gray-300 mx-1" />
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200">{td("bulletList")}</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200">{td("numberedList")}</button>
                    <div className="w-px h-5 bg-gray-300 mx-1" />
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-blue-600">{td("link")}</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200">{td("image")}</button>
                    <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </div>
                  <div ref={bodyRef} contentEditable suppressContentEditableWarning
                    onBlur={() => { if (bodyRef.current) setBodyHtml(bodyRef.current.innerHTML); }}
                    className="px-3 py-2 text-sm min-h-[150px] focus:outline-none prose prose-sm max-w-none"
                    style={{ overflowY: "auto", maxHeight: "300px" }}
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{td("emailMessageHint")}</p>
              </div>

              {/* SMS notification checkbox */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={smsNotification} onChange={(e) => {
                    setSmsNotification(e.target.checked);
                    if (e.target.checked && !smsNotificationText) {
                      setSmsNotificationText(`${tm("smsNotificationPrefix")}\n${tm("smsNotificationSubjectLabel")} {email_subject}`);
                    }
                  }} className="rounded" />
                  <span className="text-sm text-gray-700">{tm("smsNotification")}</span>
                </label>
                {smsNotification && (
                  <>
                    <textarea value={smsNotificationText} onChange={(e) => setSmsNotificationText(e.target.value)}
                      rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-2 resize-none" />
                    <p className="text-xs text-gray-400 mt-1">{tm("smsVariableHint")}</p>
                  </>
                )}
              </div>
            </>
          )}

          {/* SMS mode */}
          {channel === "sms" && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{td("sendViaSMS")}</label>
              <textarea value={smsText} onChange={(e) => setSmsText(e.target.value)}
                rows={4} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              <p className="text-xs text-gray-400 mt-1">{smsText.length} characters</p>
            </div>
          )}

          {/* Count summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              {td("unpaidParentsWillReceive", { count: orderOnlyCount })}
              {eligibleCount > orderOnlyCount && (
                <span className="text-gray-400"> ({td("expectedPlayersSkipped", { count: eligibleCount - orderOnlyCount })})</span>
              )}
            </p>
            {orderOnlyCount === 0 && <p className="text-xs text-orange-600 mt-1">{td("noEligibleParents")}</p>}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={handleSend} disabled={sending || orderOnlyCount === 0}
            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {sending ? td("sending") : td("sendToParents", { count: orderOnlyCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
