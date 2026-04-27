import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useIntl } from "react-intl";

import DashboardLayout from "@/components/DashboardLayout";
export default function LeadsPage() {
  const intl = useIntl();
  const router = useRouter();
  // next-intl migration: use intl.formatMessage({ id: "payments.leads.key" })
  // next-intl migration: use intl.formatMessage({ id: "payments.common.key" })

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
    loadLeads();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadLeads() {
    try {
      const res = await fetch("/api/leads");
      const d = await res.json();
      setLeads(d.leads || []);
    } catch {}
    setLoading(false);
  }

  async function createLead() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const d = await res.json();
      if (d.lead?._id) {
        router.push(`/dashboard/leads/${d.lead._id}/edit`);
      } else {
        setToast({ type: "error", message: d.error || t("saveFailed") });
        setCreating(false);
      }
    } catch {
      setToast({ type: "error", message: t("saveFailed") });
      setCreating(false);
    }
  }

  async function deleteLead(id) {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      await fetch(`/api/leads/${id}`, { method: "DELETE" });
      setLeads((prev) => prev.filter((l) => l._id !== id));
    } catch {
      setToast({ type: "error", message: t("saveFailed") });
    }
  }

  async function toggleStatus(lead) {
    const newStatus = lead.status === "enabled" ? "disabled" : "enabled";
    try {
      const res = await fetch(`/api/leads/${lead._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLeads((prev) => prev.map((l) => (l._id === lead._id ? { ...l, status: newStatus } : l)));
      }
    } catch {}
  }

  async function copyLink(slug) {
    const url = `${baseUrl}/leads/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ type: "success", message: t("linkCopied") });
    } catch {
      setToast({ type: "error", message: t("saveFailed") });
    }
  }

  function fmtDate(d) {
    if (!d) return t("noExpiry");
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function isExpired(lead) {
    return lead.expiresAt && new Date(lead.expiresAt) < new Date();
  }

  if (loading) return <p className="text-gray-500 py-8 text-center">{tc("loading")}</p>;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">{t("title")}</h2>
        <button onClick={() => { setNewTitle(""); setShowCreate(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 w-full sm:w-auto">
          {t("newLead")}
        </button>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
          <p className="text-lg mb-2">{t("noLeads")}</p>
          <p className="text-sm">{t("noLeadsDesc")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const expired = isExpired(lead);
            return (
              <div key={lead._id} className="bg-white rounded-lg border p-4 hover:border-blue-300 transition">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => router.push(`/dashboard/leads/${lead._id}`)}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{lead.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        lead.status === "enabled" && !expired
                          ? "bg-green-100 text-green-700"
                          : expired
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                      }`}>
                        {expired ? t("expired") : lead.status === "enabled" ? t("statusEnabled") : t("statusDisabled")}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {lead.submissionCount || 0} {t("submissions")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{t("expiresAt")}: {fmtDate(lead.expiresAt)}</span>
                      <span className="truncate max-w-xs" dir="ltr">/leads/{lead.slug}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button onClick={() => copyLink(lead.slug)}
                      className="text-xs px-3 py-1 rounded bg-gray-50 text-gray-700 hover:bg-gray-100 font-medium">
                      {t("copyLink")}
                    </button>
                    <button onClick={() => toggleStatus(lead)}
                      className={`text-xs px-3 py-1 rounded font-medium ${
                        lead.status === "enabled"
                          ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                          : "bg-green-50 text-green-700 hover:bg-green-100"
                      }`}>
                      {lead.status === "enabled" ? t("disable") : t("enable")}
                    </button>
                    <button onClick={() => router.push(`/dashboard/leads/${lead._id}/edit`)}
                      className="text-xs px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                      {t("edit")}
                    </button>
                    <button onClick={() => deleteLead(lead._id)}
                      className="text-xs px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium">
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white rounded-xl border p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t("createTitle")}</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("titleLabel")}</label>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              autoFocus placeholder={t("titlePlaceholder")}
              className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} disabled={creating}
                className="flex-1 px-4 py-2.5 border rounded-lg text-gray-700 font-medium hover:bg-gray-50">
                {tc("cancel")}
              </button>
              <button onClick={createLead} disabled={!newTitle.trim() || creating}
                className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {creating ? tc("creating") : t("create")}
              </button>
            </div>
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

LeadsPage.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;
