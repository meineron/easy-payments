"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ActivitiesPage() {
  const router = useRouter();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSeason, setNewSeason] = useState("");
  const [seasons, setSeasons] = useState([]);

  useEffect(() => {
    fetchActivities();
    fetchSeasons();
  }, []);

  async function fetchActivities() {
    try {
      const res = await fetch("/api/activities");
      const data = await res.json();
      setActivities(data.activities || []);
    } catch {
      console.error("Failed to load activities");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSeasons() {
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      const teamSeasons = [...new Set((data.teams || []).map((t) => t.season))].sort().reverse();
      setSeasons(teamSeasons);
      if (teamSeasons.length > 0) setNewSeason(teamSeasons[0]);
    } catch {
      // ignore
    }
  }

  function openCreateModal() {
    setNewTitle("");
    if (seasons.length > 0) setNewSeason(seasons[0]);
    setShowCreateModal(true);
  }

  async function createActivity() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), season: newSeason }),
      });
      const data = await res.json();
      if (data.activity?._id) {
        router.push(`/dashboard/activities/${data.activity._id}`);
      }
    } catch {
      alert("Failed to create activity");
    } finally {
      setCreating(false);
      setShowCreateModal(false);
    }
  }

  async function toggleStatus(id, currentStatus) {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    try {
      await fetch(`/api/activities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setActivities((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: newStatus } : a))
      );
    } catch {
      alert("Failed to update status");
    }
  }

  async function deleteActivity(id) {
    if (!confirm("Delete this activity? This cannot be undone.")) return;
    try {
      await fetch(`/api/activities/${id}`, { method: "DELETE" });
      setActivities((prev) => prev.filter((a) => a._id !== id));
    } catch {
      alert("Failed to delete activity");
    }
  }

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) {
    return <p className="text-gray-500 py-8 text-center">Loading activities...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Activities</h2>
        <button
          onClick={openCreateModal}
          disabled={creating}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "Creating..." : "+ Create Activity"}
        </button>
      </div>

      {activities.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
          <p className="text-lg mb-2">No activities yet</p>
          <p className="text-sm">Create your first activity to start managing registrations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((a) => (
            <div key={a._id} className="bg-white rounded-lg border p-4 hover:border-blue-300 transition">
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => router.push(`/dashboard/activities/${a._id}`)}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-gray-900">{a.title}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.status === "published"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {a.status || "draft"}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {a.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {a.season && <span>Season: {a.season}</span>}
                    <span>{a.teams?.length || 0} team(s)</span>
                    <span>{fmtDate(a.startDate)} — {fmtDate(a.endDate)}</span>
                    {a.hasPayment && (
                      <span className="text-green-600 font-medium">$ Payment</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleStatus(a._id, a.status)}
                    className={`text-xs px-3 py-1 rounded font-medium ${
                      a.status === "published"
                        ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                        : "bg-green-50 text-green-700 hover:bg-green-100"
                    }`}
                  >
                    {a.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => deleteActivity(a._id)}
                    className="text-xs px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Activity Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create Activity</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Fall 2026 Season Registration"
                  autoFocus
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                  onKeyDown={(e) => e.key === "Enter" && newTitle.trim() && createActivity()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                <select
                  value={newSeason}
                  onChange={(e) => setNewSeason(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                >
                  <option value="">No season</option>
                  {seasons.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={createActivity}
                disabled={!newTitle.trim() || creating}
                className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
