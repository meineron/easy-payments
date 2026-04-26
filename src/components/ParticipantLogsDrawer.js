"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";

function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Inline body of the participant logs UI: comment editor + activity timeline.
 *
 * Used in two surfaces:
 *  - `ParticipantLogsDrawer` (desktop slide-over, this file)
 *  - The mobile per-row Comments tab inside `ParticipantsTab`
 *
 * Both surfaces share the same fetching / posting logic — keep them in sync via this component.
 *
 * `initialLimit` clamps the timeline to the N most recent entries; the tab uses this so the
 * timeline doesn't dominate the card. A `Show all (N)` toggle reveals the rest. Pass `null`
 * (the default) to render the full timeline — the desktop drawer uses this.
 */
export function ParticipantLogsContent({ order, activityId, focusComment = false, initialLimit = null }) {
  const td = useTranslations("activityDetail");
  const tc = useTranslations("common");

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef(null);

  const orderId = order?._id;

  const loadLogs = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}/logs`);
      const d = await res.json();
      setLogs(d.logs || []);
    } catch {}
    setLoading(false);
  }, [activityId, orderId]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (focusComment && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [focusComment]);

  async function postComment() {
    if (!comment.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.log) setLogs((prev) => [d.log, ...prev]);
        else loadLogs();
        setComment("");
      }
    } catch {}
    setPosting(false);
  }

  if (!order) return null;

  return (
    <div className="space-y-6">
      {/* Add Comment */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">{td("addComment")}</h4>
        <textarea
          ref={textareaRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder={td("commentPlaceholder")}
          className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex justify-end mt-2">
          <button onClick={postComment} disabled={posting || !comment.trim()}
            className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50">
            {posting ? tc("loading") : td("postComment")}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">{td("activityLog")}</h4>
        {loading ? (
          <p className="text-sm text-gray-400">{tc("loading")}</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">{td("noLogsYet")}</p>
        ) : (() => {
          const shouldClamp = initialLimit != null && !expanded && logs.length > initialLimit;
          const visibleLogs = shouldClamp ? logs.slice(0, initialLimit) : logs;
          const hiddenCount = logs.length - visibleLogs.length;
          return (
            <>
              <ol className="relative border-s-2 border-gray-100 ps-4 space-y-3">
                {visibleLogs.map((log) => (
                  <li key={log._id} className="relative">
                <span className="absolute -start-[26px] top-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                  {log.field === "comment" ? "💬" :
                    log.field === "registration_submitted" ? "✉" : "✎"}
                </span>
                <div className="bg-white border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {log.field === "comment" ? td("logComment") :
                        log.field === "registration_submitted" ? td("logRegistrationSubmitted") :
                        (log.description || td("logFieldChanged"))}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDateTime(log.createdAt)}</span>
                    {log.userName && (
                      <span className="text-xs text-gray-500">· {log.userName}</span>
                    )}
                  </div>
                  {log.field === "comment" && log.description && (
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{log.description}</p>
                  )}
                  {log.field !== "comment" && log.field !== "registration_submitted" && (
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="font-mono">{log.field}</span>
                      {log.previousValue && log.previousValue !== "undefined" && (
                        <> · <span className="text-red-600">{String(log.previousValue).slice(0, 80)}</span></>
                      )}
                      {log.newValue && log.newValue !== "undefined" && log.newValue !== "created" && (
                        <> → <span className="text-green-600">{String(log.newValue).slice(0, 80)}</span></>
                      )}
                    </div>
                  )}
                </div>
                    </li>
                  ))}
                </ol>
                {(hiddenCount > 0 || expanded) && initialLimit != null && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    {expanded ? tc("showLess") : tc("showAll", { count: logs.length })}
                  </button>
                )}
              </>
            );
          })()}
      </div>
    </div>
  );
}

export default function ParticipantLogsDrawer({ order, activityId, onClose, focusComment = false }) {
  const firstName = order?.playerFirstName || order?.firstName || "";
  const lastName = order?.playerLastName || order?.lastName || "";
  const playerName = order
    ? `${firstName} ${lastName}`.trim() || order.playerEmail || order.email || "—"
    : "";

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">{playerName}</h3>
            <p className="text-xs text-gray-500">{fmtDateTime(order.createdAt)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl ms-2">×</button>
        </div>
        <div className="p-6">
          <ParticipantLogsContent order={order} activityId={activityId} focusComment={focusComment} />
        </div>
      </div>
    </div>
  );
}
