import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

export default function AdminDashboard() {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const fetchClubs = useCallback(async (statusFilter) => {
    setLoading(true);
    const res = await fetch(`/api/admin/clubs?status=${statusFilter}`);
    const data = await res.json();
    setClubs(data.clubs || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClubs(tab);
  }, [tab, fetchClubs]);

  async function handleDeactivate() {
    if (!confirmTarget) return;
    setBusyId(confirmTarget._id);
    try {
      const res = await fetch(`/api/admin/clubs/${confirmTarget._id}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to deactivate club");
        return;
      }
      setConfirmTarget(null);
      setReason("");
      await fetchClubs(tab);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReactivate(club) {
    if (!confirm(`Reactivate "${club.name}"? It will be visible to its users again.`)) return;
    setBusyId(club._id);
    try {
      const res = await fetch(`/api/admin/clubs/${club._id}/reactivate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to reactivate club");
        return;
      }
      await fetchClubs(tab);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Clubs</h2>
        <Link
          href="/admin/clubs/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          + Create Club
        </Link>
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {[
          { id: "active", label: "Active" },
          { id: "deactivated", label: "Deactivated" },
          { id: "all", label: "All" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading clubs...</p>
      ) : clubs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">
            {tab === "deactivated" ? "No deactivated clubs" : "No clubs yet"}
          </p>
          {tab !== "deactivated" && (
            <Link
              href="/admin/clubs/new"
              className="text-blue-600 font-medium hover:underline"
            >
              Create your first club
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Club Name
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Username
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Stripe Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {clubs.map((club) => {
                const isDeactivated = club.status === "deactivated";
                return (
                  <tr key={club._id} className={`hover:bg-gray-50 transition ${isDeactivated ? "opacity-70" : ""}`}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {club.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {club.username}
                    </td>
                    <td className="px-6 py-4">
                      {club.hasDirectStripeAccess ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          Direct Access
                        </span>
                      ) : club.onboardingComplete ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Connected
                        </span>
                      ) : club.stripeAccountId ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Not Started
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isDeactivated ? (
                        <div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            Deactivated
                          </span>
                          {club.deactivatedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(club.deactivatedAt).toLocaleDateString()}
                              {club.deactivatedBy ? ` · ${club.deactivatedBy}` : ""}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(club.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/clubs/${club._id}/edit`}
                          className="text-blue-600 hover:underline text-sm font-medium"
                        >
                          Edit
                        </Link>
                        {isDeactivated ? (
                          <button
                            type="button"
                            disabled={busyId === club._id}
                            onClick={() => handleReactivate(club)}
                            className="text-emerald-600 hover:underline text-sm font-medium disabled:opacity-50"
                          >
                            {busyId === club._id ? "Working..." : "Reactivate"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === club._id}
                            onClick={() => { setConfirmTarget(club); setReason(""); }}
                            className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Deactivate {confirmTarget.name}?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              The club&apos;s users won&apos;t be able to log in, public registration
              and payment links will return 404, and Stripe webhooks will be
              ignored. All data stays intact and the club can be reactivated at
              any time.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. duplicate of Aspire FC, unpaid invoice, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setConfirmTarget(null); setReason(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === confirmTarget._id}
                onClick={handleDeactivate}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg transition disabled:opacity-50"
              >
                {busyId === confirmTarget._id ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
