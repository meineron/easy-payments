import { useState, useRef } from "react";
import { useIntl } from "react-intl";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import {
  getDefaultInvitationEmailHtml,
  getDefaultInvitationSms,
  getDefaultInvitationSubject,
} from "@/lib/registration-invitation";

const INVITATION_VARIABLE_TOKENS = [
  { key: "player_name", labelKey: "insertPlayerName" },
  { key: "activity_name", labelKey: "insertActivityName" },
  { key: "team_name", labelKey: "insertTeamName" },
  { key: "club_name", labelKey: "insertClubName" },
];

export default function SendBulkLinksModal({ type, activityId, activity, orders, expectedPlayers, onClose, onDone, onError }) {
  const intl = useIntl();
  const td = (id, values) => intl.formatMessage({ id: `payments.activityDetail.${id}` }, values);
  const tm = (id, values) => intl.formatMessage({ id: `payments.messages.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  const te = (id, values) => intl.formatMessage({ id: `payments.email.${id}` }, values);
  const { locale } = useIntl();

  const activityTeams = (activity?.teams || []).map((row, slotIndex) => ({
    slotIndex,
    teamId: row.teamId?._id || row.teamId || null,
    name: row.teamId?.name || "Unknown",
  }));
  const linkTeams = activityTeams.filter((t) => t.teamId);

  const savedInvitation = type === "registration" ? (activity?.registrationInvitation || null) : null;
  const hasSavedInvitation = !!(
    savedInvitation && (savedInvitation.subject || savedInvitation.bodyHtml || savedInvitation.smsText)
  );

  const [selectedTeams, setSelectedTeams] = useState(() => new Set(linkTeams.map((row) => String(row.teamId))));
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState(() => {
    if (type === "registration") {
      return savedInvitation?.subject || getDefaultInvitationSubject(locale);
    }
    return `${activity?.title || "Activity"} — Payment Link`;
  });
  const [bodyHtml, setBodyHtml] = useState(() => {
    if (type === "registration") {
      // Prefer the activity's saved Registration Invitation Template;
      // otherwise fall back to the locale-default invitation template
      // (which is the same one shown in the per-row Send Link modal).
      return savedInvitation?.bodyHtml || getDefaultInvitationEmailHtml(locale);
    }
    // `.raw` — the default body contains literal `<p>` HTML; next-intl would
    // otherwise interpret them as rich-text tag placeholders and throw.
    return td.raw("defaultPaymentEmailBody");
  });
  const [smsText, setSmsText] = useState(() => {
    if (type === "registration") {
      return savedInvitation?.smsText || getDefaultInvitationSms(locale);
    }
    return td("defaultPaymentSmsBody", { activity: activity?.title || "" , link: "{link}" });
  });
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

  const personalLinkToken = type === "payment" ? "{personal_payment_link}" : "{personal_registration_link}";

  function insertPersonalLink() {
    const label = type === "payment" ? te("payNowButton") : te("regLinkButton");
    const color = type === "payment" ? "#16a34a" : "#2563eb";
    const html =
      `<div style="text-align:center;margin:16px 0;">` +
      `<a href="${personalLinkToken}" style="display:inline-block;background:${color};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${label}</a>` +
      `</div><p><br/></p>`;
    bodyRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    if (bodyRef.current) setBodyHtml(bodyRef.current.innerHTML);
  }

  function insertVariableToken(token) {
    bodyRef.current?.focus();
    document.execCommand("insertText", false, token);
    if (bodyRef.current) setBodyHtml(bodyRef.current.innerHTML);
  }

  function insertSmsToken(token) {
    setSmsText((prev) => (prev || "") + token);
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
    const id = String(tid);
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const ids = linkTeams.map((row) => String(row.teamId));
    const allOn = ids.length > 0 && ids.every((id) => selectedTeams.has(id));
    if (allOn) setSelectedTeams(new Set());
    else setSelectedTeams(new Set(ids));
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
                {linkTeams.length > 0 && selectedTeams.size === linkTeams.length ? td("deselectAll") : td("selectAll")}
              </button>
            </div>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
              {linkTeams.map((team) => (
                <label key={activityTeamSlotKey(team, team.slotIndex)} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={selectedTeams.has(String(team.teamId))} onChange={() => toggleTeam(team.teamId)} className="rounded" />
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

                <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  <p className="font-semibold mb-1">
                    {td(type === "payment" ? "personalLinkBoxTitlePayment" : "personalLinkBoxTitleRegistration")}
                  </p>
                  <p className="mb-1">
                    {td(type === "payment" ? "personalLinkBoxLine1Payment" : "personalLinkBoxLine1Registration")}
                    {" "}
                    <code className="inline-block bg-white border border-blue-200 rounded px-1.5 py-0.5 font-mono text-[11px] text-blue-700 select-all">{personalLinkToken}</code>
                  </p>
                  <p>{td("personalLinkBoxLine2")}</p>
                  {type === "registration" && (
                    <p className="mt-1 pt-1 border-t border-blue-100">
                      {td.raw("templateVariablesHint")}
                    </p>
                  )}
                </div>

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
                    <div className="w-px h-5 bg-gray-300 mx-1" />
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); insertPersonalLink(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-purple-600 font-medium" title={personalLinkToken}>
                      {td("insertPersonalLink")}
                    </button>
                    {type === "registration" && INVITATION_VARIABLE_TOKENS.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); insertVariableToken(`{${v.key}}`); }}
                        className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-indigo-600"
                        title={`{${v.key}}`}
                      >
                        {td(v.labelKey)}
                      </button>
                    ))}
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
              {type === "registration" && (
                <div className="flex items-center gap-1 flex-wrap mb-1">
                  {INVITATION_VARIABLE_TOKENS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertSmsToken(`{${v.key}}`)}
                      className="px-2 py-0.5 rounded text-xs hover:bg-gray-200 text-indigo-600 border border-indigo-200 bg-indigo-50"
                    >
                      {td(v.labelKey)}
                    </button>
                  ))}
                </div>
              )}
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
