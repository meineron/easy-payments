import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useSession, signOut } from "next-auth/react";

const STATUS_LABEL = {
  pending_user: "Pending your acceptance",
  active: "Active",
  declined: "Declined",
  deactivated: "Deactivated by club",
  left: "You left this club",
};

const STATUS_COLOR = {
  pending_user: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  declined: "bg-gray-100 text-gray-500",
  deactivated: "bg-red-100 text-red-600",
  left: "bg-gray-100 text-gray-500",
};

// /invitations — user-side hub. Shows:
//   - Pending invites (Accept / Decline buttons)
//   - Active memberships (Open dashboard / Leave)
//   - Historical memberships (declined, deactivated, left) for transparency
export default function InvitationsPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const fetchMemberships = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invitations");
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setMemberships(data.memberships || []);
    } catch {
      setError("Failed to load your invitations");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") fetchMemberships();
  }, [status, fetchMemberships, router]);

  async function handleAction(membershipId, action) {
    setBusy(membershipId + ":" + action);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
        setBusy(null);
        return;
      }
      // If they just accepted their FIRST invite, the JWT has no activeClubId
      // yet — refresh it so the dashboard nav picks up the new active club.
      if (action === "accept") {
        const newlyActive = memberships.find((m) => m.id === membershipId);
        if (newlyActive) {
          await update({ activeClubId: newlyActive.clubId });
        }
      }
      await fetchMemberships();
    } catch {
      setError("Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function openDashboard(clubId) {
    setBusy(clubId + ":open");
    try {
      // Persist the choice on the server, then refresh the JWT, then navigate.
      await fetch("/api/auth/switch-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId }),
      });
      await update({ activeClubId: clubId });
      router.push("/dashboard");
    } catch {
      setError("Failed to switch club");
    } finally {
      setBusy(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const pending = memberships.filter((m) => m.status === "pending_user");
  const active = memberships.filter((m) => m.status === "active");
  const past = memberships.filter((m) => ["declined", "deactivated", "left"].includes(m.status));

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Clubs</h1>
            <p className="text-sm text-gray-600 mt-1">
              Hello {session?.user?.username || ""} — manage your invitations and memberships.
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Pending invites */}
        {pending.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Pending invitations
            </h2>
            <div className="space-y-3">
              {pending.map((m) => (
                <div key={m.id} className="bg-white border border-yellow-200 rounded-xl p-4 flex items-center gap-4">
                  {m.clubLogoUrl ? (
                    <img src={m.clubLogoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-medium">
                      {m.clubName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{m.clubName}</div>
                    <div className="text-xs text-gray-500">Invited as {m.customRoleLabel || m.mainRole}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(m.id, "decline")}
                      disabled={!!busy}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleAction(m.id, "accept")}
                      disabled={!!busy}
                      className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy === m.id + ":accept" ? "..." : "Accept"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active memberships */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Your clubs
          </h2>
          {active.length === 0 && pending.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
              You don&apos;t belong to any clubs yet. When a club invites you, it will show up here.
            </div>
          ) : active.length === 0 ? (
            <p className="text-sm text-gray-500">No active memberships.</p>
          ) : (
            <div className="space-y-3">
              {active.map((m) => (
                <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                  {m.clubLogoUrl ? (
                    <img src={m.clubLogoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-medium">
                      {m.clubName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{m.clubName}</div>
                    <div className="text-xs text-gray-500">{m.customRoleLabel || m.mainRole}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(m.id, "leave")}
                      disabled={!!busy}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-red-600 disabled:opacity-50"
                    >
                      Leave
                    </button>
                    <button
                      onClick={() => openDashboard(m.clubId)}
                      disabled={!!busy}
                      className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Historical */}
        {past.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Past memberships
            </h2>
            <div className="space-y-2">
              {past.map((m) => (
                <div key={m.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-medium">
                    {m.clubName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{m.clubName}</div>
                    <div className="text-xs text-gray-500">{m.customRoleLabel || m.mainRole}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[m.status]}`}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
