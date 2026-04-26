"use client";

import { useRef, useState } from "react";
import Modal from "@/shared/components/Modal";
import RichTextEditor from "@/shared/components/RichTextEditor/lazy";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";

export default function SendPaymentEmailsModal({ activityId, activity, orders, expectedPlayers, onClose, onDone, onError, tc, td }) {
  const activityTeams = (activity?.teams || []).map((row, slotIndex) => ({
    slotIndex,
    teamId: row.teamId?._id || row.teamId || null,
    name: row.teamId?.name || "Unknown",
  }));
  const linkTeams = activityTeams.filter((t) => t.teamId);
  const [selectedTeams, setSelectedTeams] = useState(() => new Set(linkTeams.map((row) => String(row.teamId))));
  const [subject, setSubject] = useState(`Payment link for ${activity?.title || "Activity"}`);
  const [bodyHtml, setBodyHtml] = useState("<p>Dear parent,</p><p>Please complete your payment using the link below.</p>");
  const [sending, setSending] = useState(false);
  const editorRef = useRef(null);

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
    if (r.status === "paid") return false;
    if (!r.parent1Email && !r._isExpected) return false;
    return true;
  }).length;

  const orderOnlyCount = orders.filter((r) => {
    const tid = String(r.teamId?._id || r.teamId || "");
    return selectedTeams.has(tid) && r.status !== "paid" && r.parent1Email;
  }).length;

  async function handleSend() {
    const html = editorRef.current?.getHtml() || bodyHtml;
    if (!subject.trim()) { onError(td("subjectRequired")); return; }
    if (!html.trim() || html.trim() === "<br>") { onError(td("messageBodyRequired")); return; }
    if (selectedTeams.size === 0) { onError(td("selectAtLeastOneTeam")); return; }

    setSending(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/send-bulk-payment-emails`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: [...selectedTeams], subject: subject.trim(), bodyHtml: html }),
      });
      const data = await res.json();
      if (data.success) {
        let msg = td("sentPaymentLinks", { count: data.sentCount });
        if (data.errorCount > 0) msg += ` (${td("failedCount", { count: data.errorCount })})`;
        onDone(msg);
      } else {
        onError(data.error || td("failedToSendEmails"));
      }
    } catch { onError(td("failedToSendEmails")); }
    finally { setSending(false); }
  }

  return (
    <Modal open onClose={onClose} size="2xl" ariaLabel={td("sendPaymentLinksTitle")}>
      <Modal.Header title={td("sendPaymentLinksTitle")} onClose={onClose} />
      <Modal.Body className="space-y-5">
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

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{td("emailSubject")}</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Payment link for..." />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{td("emailMessage")}</label>
          <RichTextEditor
            ref={editorRef}
            value={bodyHtml}
            onChange={setBodyHtml}
            minHeight={150}
            maxHeight={300}
            compact
          />
          <p className="text-xs text-gray-400 mt-1">{td("emailMessageHint")}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            {td("unpaidParentsWillReceive", { count: orderOnlyCount })}
            {eligibleCount > orderOnlyCount && (
              <span className="text-gray-400"> ({td("expectedPlayersSkipped", { count: eligibleCount - orderOnlyCount })})</span>
            )}
          </p>
          {orderOnlyCount === 0 && <p className="text-xs text-orange-600 mt-1">{td("noEligibleParents")}</p>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
        <button onClick={handleSend} disabled={sending || orderOnlyCount === 0}
          className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {sending ? td("sending") : td("sendToParents", { count: orderOnlyCount })}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
