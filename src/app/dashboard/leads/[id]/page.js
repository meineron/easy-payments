"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SendMessageModal from "@/components/SendMessageModal";

const LOG_ICON = {
  submission_received: "✉",
  comment: "💬",
  message_sent: "📤",
  submission_deleted: "🗑",
  lead_updated: "✎",
  status_changed: "⚑",
  staff_notified: "🔔",
  submission_status_changed: "⚑",
};

const SUB_STATUS_OPTIONS = ["in_progress", "done", "not_relevant"];

const SUB_STATUS_CLASS = {
  in_progress: "bg-orange-50 text-orange-700 border-orange-200",
  done: "bg-green-50 text-green-700 border-green-200",
  not_relevant: "bg-red-50 text-red-700 border-red-200",
};

function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function LeadDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("leads");
  const tc = useTranslations("common");

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [openSub, setOpenSub] = useState(null);
  const [showSend, setShowSend] = useState(false);
  const [sendRecipients, setSendRecipients] = useState([]);
  const [toast, setToast] = useState(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [activeTab, setActiveTab] = useState("submissions");
  const [leadLogs, setLeadLogs] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadLead = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}`);
      const d = await res.json();
      if (d.lead) setLead(d.lead);
    } catch {}
  }, [id]);

  const loadSubmissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}/submissions?limit=100`);
      const d = await res.json();
      setSubmissions(d.submissions || []);
    } catch {}
  }, [id]);

  const loadLeadLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${id}/logs`);
      const d = await res.json();
      setLeadLogs(d.logs || []);
    } catch {}
  }, [id]);

  useEffect(() => {
    Promise.all([loadLead(), loadSubmissions()]).finally(() => setLoading(false));
  }, [loadLead, loadSubmissions]);

  useEffect(() => {
    if (activeTab === "log") loadLeadLogs();
  }, [activeTab, loadLeadLogs]);

  async function copyLink() {
    if (!lead) return;
    const url = `${baseUrl}/leads/${lead.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ type: "success", message: t("linkCopied") });
    } catch {}
  }

  async function toggleStatus() {
    if (!lead) return;
    const next = lead.status === "enabled" ? "disabled" : "enabled";
    const res = await fetch(`/api/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      const d = await res.json();
      setLead(d.lead);
    }
  }

  function toggleSelect(sid) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === submissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submissions.map((s) => s._id)));
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(t("deleteSubmissionConfirm"))) return;
    const ids = [...selectedIds];
    await Promise.all(ids.map((sid) =>
      fetch(`/api/leads/${id}/submissions/${sid}`, { method: "DELETE" })
    ));
    setSelectedIds(new Set());
    loadSubmissions();
  }

  async function changeSubmissionStatus(submission, nextStatus) {
    if (!submission || submission.status === nextStatus) return;
    setSubmissions((prev) => prev.map((s) =>
      s._id === submission._id ? { ...s, status: nextStatus } : s,
    ));
    if (openSub && openSub._id === submission._id) {
      setOpenSub({ ...openSub, status: nextStatus });
    }
    try {
      const res = await fetch(`/api/leads/${id}/submissions/${submission._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setSubmissions((prev) => prev.map((s) =>
        s._id === submission._id ? { ...s, status: submission.status } : s,
      ));
      if (openSub && openSub._id === submission._id) {
        setOpenSub({ ...openSub, status: submission.status });
      }
      setToast({ type: "error", message: t("saveFailed") });
    }
  }

  function openSendMessage() {
    const chosen = submissions.filter((s) => selectedIds.has(s._id));
    if (chosen.length === 0) return;
    setSendRecipients(chosen.map((s) => ({
      type: "lead",
      id: s._id,
      name: s.name || s.email || "Lead",
      email: s.email || "",
      phonePrefix: s.phonePrefix || "",
      phone: s.phone || "",
    })));
    setShowSend(true);
  }

  if (loading) return <p className="text-gray-500 py-8 text-center">{tc("loading")}</p>;
  if (!lead) return <p className="text-red-500 py-8 text-center">{tc("notFound") || "Not found"}</p>;

  const expired = lead.expiresAt && new Date(lead.expiresAt) < new Date();
  const publicUrl = `${baseUrl}/leads/${lead.slug}`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push("/dashboard/leads")}
          className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-gray-900 truncate">{lead.title}</h2>
      </div>

      {/* Top info card */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                lead.status === "enabled" && !expired ? "bg-green-100 text-green-700" :
                expired ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
              }`}>
                {expired ? t("expired") : lead.status === "enabled" ? t("statusEnabled") : t("statusDisabled")}
              </span>
              <span className="text-xs text-gray-500">
                {t("expiresAt")}: {lead.expiresAt ? fmtDate(lead.expiresAt) : t("noExpiry")}
              </span>
              <span className="text-xs text-gray-500">
                {submissions.length} {t("submissions")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t("publicLink")}:</span>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded truncate max-w-md" dir="ltr">{publicUrl}</code>
              <button onClick={copyLink}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-medium">
                {t("copyLink")}
              </button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800">↗</a>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={toggleStatus}
              className={`text-xs px-3 py-1.5 rounded font-medium ${
                lead.status === "enabled"
                  ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
              }`}>
              {lead.status === "enabled" ? t("disable") : t("enable")}
            </button>
            <button onClick={() => router.push(`/dashboard/leads/${id}/edit`)}
              className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium">
              {t("edit")}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button onClick={() => setActiveTab("submissions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "submissions"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}>
          {t("submissions")}
        </button>
        <button onClick={() => setActiveTab("log")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === "log"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}>
          {t("activityLog")}
        </button>
      </div>

      {activeTab === "submissions" && (
        <>
          {submissions.length === 0 ? (
            <div className="bg-white rounded-xl border p-12 text-center text-gray-500 text-sm">
              {t("noSubmissions")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {[
                  { id: "all", label: t("filterAll") },
                  { id: "in_progress", label: t("statusInProgress") },
                  { id: "done", label: t("statusDone") },
                  { id: "not_relevant", label: t("statusNotRelevant") },
                ].map((opt) => (
                  <button key={opt.id} onClick={() => setStatusFilter(opt.id)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition ${
                      statusFilter === opt.id
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {selectedIds.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-3 flex items-center justify-between">
                  <span className="text-sm text-blue-900 font-medium">
                    {t("selectedCount", { count: selectedIds.size })}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={openSendMessage}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                      {t("sendMessage")}
                    </button>
                    <button onClick={deleteSelected}
                      className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 font-medium">
                      {t("deleteSelected")}
                    </button>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox"
                          checked={submissions.length > 0 && selectedIds.size === submissions.length}
                          onChange={toggleSelectAll} className="rounded" />
                      </th>
                      <th className="px-3 py-3 text-start font-medium">{t("name")}</th>
                      <th className="px-3 py-3 text-start font-medium">{t("email")}</th>
                      <th className="px-3 py-3 text-start font-medium">{t("phone")}</th>
                      <th className="px-3 py-3 text-start font-medium">{t("receivedAt")}</th>
                      <th className="px-3 py-3 text-start font-medium">{t("submissionStatus")}</th>
                      <th className="px-3 py-3 text-end font-medium w-20">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {submissions
                      .filter((s) => statusFilter === "all" || (s.status || "in_progress") === statusFilter)
                      .map((s) => {
                      const status = s.status || "in_progress";
                      return (
                        <tr key={s._id} className="hover:bg-gray-50">
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(s._id)}
                              onChange={() => toggleSelect(s._id)} className="rounded" />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900 cursor-pointer"
                            onClick={() => setOpenSub(s)}>
                            {s.name || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600 cursor-pointer" onClick={() => setOpenSub(s)}>
                            {s.email || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600 cursor-pointer" onClick={() => setOpenSub(s)} dir="ltr">
                            {s.phone ? `${s.phonePrefix || ""} ${s.phone}`.trim() : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap cursor-pointer"
                            onClick={() => setOpenSub(s)}>
                            {fmtDateTime(s.createdAt)}
                          </td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <select value={status}
                              onChange={(e) => changeSubmissionStatus(s, e.target.value)}
                              className={`text-xs px-2 py-1 rounded-md border font-medium outline-none focus:ring-2 focus:ring-blue-500 ${SUB_STATUS_CLASS[status] || ""}`}>
                              <option value="in_progress">{t("statusInProgress")}</option>
                              <option value="done">{t("statusDone")}</option>
                              <option value="not_relevant">{t("statusNotRelevant")}</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-end">
                            <button onClick={() => setOpenSub(s)} title={t("viewLogs")}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-blue-700 hover:bg-blue-50">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "log" && (
        <LogTimeline logs={leadLogs} t={t} />
      )}

      {/* Submission drawer */}
      {openSub && (
        <SubmissionDrawer
          leadId={id}
          lead={lead}
          submission={openSub}
          onClose={() => setOpenSub(null)}
          onSend={(sub) => {
            setSendRecipients([{
              type: "lead",
              id: sub._id,
              name: sub.name || sub.email || "Lead",
              email: sub.email || "",
              phonePrefix: sub.phonePrefix || "",
              phone: sub.phone || "",
            }]);
            setShowSend(true);
          }}
          onDelete={async () => {
            if (!confirm(t("deleteSubmissionConfirm"))) return;
            await fetch(`/api/leads/${id}/submissions/${openSub._id}`, { method: "DELETE" });
            setOpenSub(null);
            loadSubmissions();
          }}
          onStatusChange={(nextStatus) => changeSubmissionStatus(openSub, nextStatus)}
          t={t}
          tc={tc}
        />
      )}

      {showSend && sendRecipients.length > 0 && (
        <SendMessageModal
          recipients={sendRecipients}
          endpoint={`/api/leads/${id}/send-message`}
          extraPayload={{ submissionIds: sendRecipients.map((r) => r.id) }}
          onClose={() => setShowSend(false)}
          onSent={(msg) => {
            setToast({ type: "success", message: msg });
            setSelectedIds(new Set());
            loadSubmissions();
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-[60] ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>{toast.message}</div>
      )}
    </div>
  );
}

/* ========== Submission Drawer ========== */
function SubmissionDrawer({ leadId, lead, submission, onClose, onSend, onDelete, onStatusChange, t, tc }) {
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/submissions/${submission._id}/logs`);
      const d = await res.json();
      setLogs(d.logs || []);
    } catch {}
    setLoadingLogs(false);
  }, [leadId, submission._id]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function postComment() {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/submissions/${submission._id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment.trim() }),
      });
      if (res.ok) {
        setComment("");
        loadLogs();
      }
    } catch {}
    setPosting(false);
  }

  function renderResponse(field, value) {
    if (value === undefined || value === null || value === "") return <span className="text-gray-400">—</span>;
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") {
      if (value.prefix !== undefined || value.number !== undefined) {
        return <span dir="ltr">{`${value.prefix || ""} ${value.number || ""}`.trim()}</span>;
      }
      return JSON.stringify(value);
    }
    return String(value);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-3 px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900 truncate">{submission.name || submission.email}</h3>
              <p className="text-xs text-gray-500">{fmtDateTime(submission.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onSend(submission)}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                {t("sendMessage")}
              </button>
              <button onClick={onDelete}
                className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 font-medium">
                {t("delete")}
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ms-1">×</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase">{t("submissionStatus")}:</span>
            <select value={submission.status || "in_progress"}
              onChange={(e) => onStatusChange && onStatusChange(e.target.value)}
              className={`text-xs px-2 py-1 rounded-md border font-medium outline-none focus:ring-2 focus:ring-blue-500 ${SUB_STATUS_CLASS[submission.status || "in_progress"] || ""}`}>
              <option value="in_progress">{t("statusInProgress")}</option>
              <option value="done">{t("statusDone")}</option>
              <option value="not_relevant">{t("statusNotRelevant")}</option>
            </select>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Responses */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">{t("responses")}</h4>
            <div className="bg-gray-50 border rounded-lg divide-y">
              {(lead.formSections || []).flatMap((section) =>
                (section.fields || []).filter((f) => f.type !== "title_description").map((field) => (
                  <div key={field.key} className="flex gap-3 px-4 py-2 text-sm">
                    <div className="w-40 shrink-0 text-gray-500"
                      dangerouslySetInnerHTML={{ __html: field.label || field.key }} />
                    <div className="flex-1 min-w-0 text-gray-900 break-words">
                      {renderResponse(field, submission.responses?.[field.key])}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add Comment */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">{t("addComment")}</h4>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              rows={3} placeholder={t("commentPlaceholder")}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="mt-2 flex justify-end">
              <button onClick={postComment} disabled={!comment.trim() || posting}
                className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50">
                {posting ? tc("saving") : t("postComment")}
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">{t("activityLog")}</h4>
            {loadingLogs ? (
              <p className="text-sm text-gray-500">{tc("loading")}</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noLogs")}</p>
            ) : (
              <LogTimeline logs={logs} t={t} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== Shared log timeline ========== */
function LogTimeline({ logs, t }) {
  const labels = {
    submission_received: t("logSubmissionReceived"),
    comment: t("logComment"),
    message_sent: t("logMessageSent"),
    submission_deleted: t("logSubmissionDeleted"),
    lead_updated: t("logLeadUpdated"),
    status_changed: t("logStatusChanged"),
    staff_notified: t("logStaffNotified"),
    submission_status_changed: t("logSubmissionStatusChanged"),
  };

  const statusLabel = {
    in_progress: t("statusInProgress"),
    done: t("statusDone"),
    not_relevant: t("statusNotRelevant"),
  };

  if (logs.length === 0) {
    return <p className="text-sm text-gray-400">{t("noLogs")}</p>;
  }

  return (
    <ol className="relative border-s-2 border-gray-100 ps-4 space-y-4">
      {logs.map((log) => (
        <li key={log._id} className="relative">
          <span className="absolute -start-[26px] top-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
            {LOG_ICON[log.type] || "•"}
          </span>
          <div className="bg-white border rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{labels[log.type] || log.type}</span>
              <span className="text-xs text-gray-400">{fmtDateTime(log.createdAt)}</span>
              {log.authorName && (
                <span className="text-xs text-gray-500">· {log.authorName}</span>
              )}
            </div>
            {log.content && (
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{log.content}</p>
            )}
            {log.type === "message_sent" && log.context?.subject && (
              <p className="text-xs text-gray-500 mt-1">
                {log.context.channel === "sms" ? "SMS" : "Email"}
                {log.context.subject ? ` · ${log.context.subject}` : ""}
              </p>
            )}
            {log.type === "submission_status_changed" && log.context && (
              <p className="text-xs text-gray-600 mt-1">
                {(statusLabel[log.context.previous] || log.context.previous || "—")} → {(statusLabel[log.context.next] || log.context.next || "—")}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
