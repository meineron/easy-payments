import { useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import Modal from "@/shared/components/Modal";
import RichTextEditor from "@/shared/components/RichTextEditor/lazy";
import {
  getDefaultInvitationEmailHtml,
  getDefaultInvitationSms,
  getDefaultInvitationSubject,
} from "@/lib/registration-invitation";
import { BULK_MESSAGE_VARIABLES } from "@/features/activities/constants";

export default function BulkSendMessageModal({ activityId, activity, rows, ensureOrder, onClose, onDone, onError, tc, td }) {
  const intl = useIntl();
  const locale = intl.locale;
  const tm = (id, values) => intl.formatMessage({ id: `payments.messages.${id}` }, values);

  const savedInvitation = activity?.registrationInvitation || null;

  const [selectedRows, setSelectedRows] = useState(rows);
  const [target, setTarget] = useState("parents");
  const [channel, setChannel] = useState("email");
  const [template, setTemplate] = useState("custom");
  const [subject, setSubject] = useState(`${activity?.title || ""} — ${td("sendRegistrationLink")}`.trim());
  const [bodyHtml, setBodyHtml] = useState(td("defaultRegistrationEmailBody"));
  const [bodyText, setBodyText] = useState(td("defaultRegistrationSmsBody", { activity: activity?.title || "", link: "{personal_registration_link}" }));
  const [smsNotification, setSmsNotification] = useState(false);
  const [smsNotificationText, setSmsNotificationText] = useState("");
  const [sending, setSending] = useState(false);
  const editorRef = useRef(null);

  function applyTemplate(next) {
    setTemplate(next);
    if (next === "invitation") {
      const invSubject = savedInvitation?.subject || getDefaultInvitationSubject(locale);
      const invBody = savedInvitation?.bodyHtml || getDefaultInvitationEmailHtml(locale);
      const invSms = savedInvitation?.smsText || getDefaultInvitationSms(locale);
      setSubject(invSubject);
      setBodyHtml(invBody);
      if (editorRef.current?.setHtml) editorRef.current.setHtml(invBody);
      setBodyText(invSms);
    } else {
      setSubject(`${activity?.title || ""} — ${td("sendRegistrationLink")}`.trim());
      const defaultBody = td("defaultRegistrationEmailBody");
      setBodyHtml(defaultBody);
      if (editorRef.current?.setHtml) editorRef.current.setHtml(defaultBody);
      setBodyText(td("defaultRegistrationSmsBody", { activity: activity?.title || "", link: "{personal_registration_link}" }));
    }
  }

  function insertVariableToken(token) {
    if (channel === "email") {
      const current = editorRef.current?.getHtml() ?? bodyHtml;
      const next = current + ` ${token}`;
      if (editorRef.current?.setHtml) editorRef.current.setHtml(next);
      setBodyHtml(next);
    } else {
      setBodyText((prev) => (prev ? `${prev} ${token}` : token));
    }
  }

  function removeRow(rowId) {
    setSelectedRows((prev) => prev.filter((r) => r._id !== rowId));
  }

  function rowContactCount(r) {
    let count = 0;
    const hasContact = (email, phone) => channel === "email" ? !!email : !!phone;
    if (target === "parents" || target === "both") {
      if (r.parent1FirstName && hasContact(r.parent1Email, r.parent1Phone)) count++;
      if (r.parent2FirstName && hasContact(r.parent2Email, r.parent2Phone)) count++;
    }
    if (target === "player" || target === "both") {
      if (hasContact(r.playerEmail, r.playerPhone)) count++;
    }
    return count;
  }

  const reachableCount = useMemo(
    () => selectedRows.reduce((sum, r) => sum + rowContactCount(r), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRows, target, channel]
  );

  function insertPersonalLink() {
    const token = "{personal_registration_link}";
    if (channel === "email") {
      const current = editorRef.current?.getHtml() ?? bodyHtml;
      const next = current + ` ${token}`;
      if (editorRef.current?.setHtml) editorRef.current.setHtml(next);
      setBodyHtml(next);
    } else {
      setBodyText((prev) => (prev ? `${prev} ${token}` : token));
    }
  }

  async function handleSend() {
    if (selectedRows.length === 0) { onError(td("bulkMessageNoRecipients")); return; }

    if (channel === "email") {
      const html = editorRef.current?.getHtml() || bodyHtml;
      if (!subject.trim()) { onError(tm("subjectRequired")); return; }
      if (!html.trim() || html === "<br>") { onError(tm("bodyRequired")); return; }
      setBodyHtml(html);
    } else {
      if (!bodyText.trim()) { onError(tm("smsBodyRequired")); return; }
    }

    setSending(true);
    try {
      const orderIds = [];
      for (const r of selectedRows) {
        if (r._isExpected) {
          const order = await ensureOrder(r);
          if (order?._id) orderIds.push(order._id);
        } else if (r._id) {
          orderIds.push(r._id);
        }
      }
      if (orderIds.length === 0) { onError(td("bulkMessageNoRecipients")); setSending(false); return; }

      const payload = { orderIds, target, channel };
      if (channel === "email") {
        payload.subject = subject.trim();
        payload.bodyHtml = editorRef.current?.getHtml() || bodyHtml;
        if (smsNotification) {
          payload.smsNotification = true;
          const rawText = smsNotificationText || `${tm("smsNotificationPrefix")}\n${tm("smsNotificationSubjectLabel")} {email_subject}`;
          payload.smsText = rawText.replace(/\{email_subject\}/g, subject.trim());
        }
      } else {
        payload.bodyText = bodyText.trim();
      }

      const res = await fetch(`/api/activities/${activityId}/orders/bulk-send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        let msg = td("bulkMessageSent", { count: data.sent });
        if (data.failed > 0) msg += ` (${td("failedCount", { count: data.failed })})`;
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

  return (
    <Modal open onClose={onClose} size="2xl" ariaLabel={td("bulkMessageTitle")}>
      <Modal.Header title={td("bulkMessageTitle")} onClose={onClose} />
      <Modal.Body className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">{td("bulkMessageRecipients", { count: selectedRows.length })}</label>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto border rounded-lg p-2 bg-gray-50">
            {selectedRows.length === 0 ? (
              <span className="text-xs text-gray-400">{td("bulkMessageNoRecipients")}</span>
            ) : (
              selectedRows.map((r) => {
                const teamName = r.teamId?.name || td("unassigned");
                const name = `${r.playerFirstName || ""} ${r.playerLastName || ""}`.trim();
                return (
                  <span key={r._id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">
                    <span>{name} — {teamName}</span>
                    <button onClick={() => removeRow(r._id)} className="text-blue-400 hover:text-blue-700" title={tc("remove")}>×</button>
                  </span>
                );
              })
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">{td("bulkMessageTarget")}</label>
          <div className="flex bg-gray-100 rounded-lg p-0.5 w-fit">
            {[
              { v: "parents", label: td("bulkMessageTargetParents") },
              { v: "player", label: td("bulkMessageTargetPlayer") },
              { v: "both", label: td("bulkMessageTargetBoth") },
            ].map((opt) => (
              <button key={opt.v} type="button" onClick={() => setTarget(opt.v)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${target === opt.v ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">{td("bulkMessageTemplate")}</label>
          <div className="flex bg-gray-100 rounded-lg p-0.5 w-fit">
            <button type="button" onClick={() => applyTemplate("custom")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${template === "custom" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
              {td("bulkMessageTemplateCustom")}
            </button>
            <button type="button" onClick={() => applyTemplate("invitation")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${template === "invitation" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
              {td("bulkMessageTemplateInvitation")}
            </button>
          </div>
          {template === "invitation" && (
            <p className="text-xs text-gray-400 mt-1.5">{td("bulkMessageTemplateInvitationHint")}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button type="button" onClick={() => setChannel("email")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "email" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
              {tm("channelEmail")}
            </button>
            <button type="button" onClick={() => setChannel("sms")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "sms" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
              {tm("channelSMS")}
            </button>
          </div>
        </div>

        {channel === "email" ? (
          <>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder={tm("subjectPlaceholder")}
              className="w-full border rounded-lg px-3 py-2 text-sm" />

            <div>
              <RichTextEditor
                ref={editorRef}
                value={bodyHtml}
                onChange={setBodyHtml}
                minHeight={180}
                maxHeight={300}
                compact
              />
              <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
                <p className="text-xs text-gray-400">{td("personalLinkBoxLine1Registration")}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {BULK_MESSAGE_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariableToken(`{${v.key}}`)}
                      className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap px-1.5 py-0.5 rounded border border-indigo-100 bg-indigo-50"
                    >
                      {td(v.labelKey)}
                    </button>
                  ))}
                  <button type="button" onClick={insertPersonalLink}
                    className="text-xs font-medium text-purple-600 hover:text-purple-800 whitespace-nowrap">
                    + {td("insertPersonalLink")}
                  </button>
                </div>
              </div>
            </div>

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
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                <p className="text-xs text-gray-400">{tm("smsVariableHint")}</p>
              </>
            )}
          </>
        ) : (
          <>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
              placeholder={tm("smsBodyPlaceholder")}
              rows={5} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-gray-400">{tm("smsCharCount", { count: bodyText.length })}</p>
              <div className="flex items-center gap-1 flex-wrap">
                {BULK_MESSAGE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariableToken(`{${v.key}}`)}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap px-1.5 py-0.5 rounded border border-indigo-100 bg-indigo-50"
                  >
                    {td(v.labelKey)}
                  </button>
                ))}
                <button type="button" onClick={insertPersonalLink}
                  className="text-xs font-medium text-purple-600 hover:text-purple-800 whitespace-nowrap">
                  + {td("insertPersonalLink")}
                </button>
              </div>
            </div>
          </>
        )}

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm text-gray-700">{td("bulkMessageSummary", { count: reachableCount })}</p>
          {reachableCount === 0 && <p className="text-xs text-orange-600 mt-1">{td("bulkMessageNoContacts")}</p>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
        <button onClick={handleSend} disabled={sending || reachableCount === 0 || selectedRows.length === 0}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {sending ? tm("sending") : tm("send")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
