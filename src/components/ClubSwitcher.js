"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Dropdown next to the club name in the dashboard nav. Only renders when the
// signed-in user has more than one active membership. Otherwise silent.
export default function ClubSwitcher() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open]);

  const memberships = (session?.user?.memberships || []).filter((m) => m.status === "active");
  const activeId = session?.user?.activeClubId;
  const pendingCount = (session?.user?.memberships || []).filter((m) => m.status === "pending_user").length;

  if (!memberships || memberships.length <= 1) {
    // Still surface the badge for pending invitations even when only one club
    // is active — it lives in the same UI affordance.
    if (pendingCount === 0) return null;
  }

  const activeClub = memberships.find((m) => m.clubId === activeId);
  const otherClubs = memberships.filter((m) => m.clubId !== activeId);

  async function switchTo(clubId) {
    setSwitching(clubId);
    try {
      await fetch("/api/auth/switch-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId }),
      });
      await update({ activeClubId: clubId });
      setOpen(false);
      router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition text-sm"
        aria-label="Switch club"
      >
        <span className="text-gray-500 text-xs font-medium">
          {activeClub?.clubName || session?.user?.name || "Club"}
        </span>
        {pendingCount > 0 && (
          <span className="bg-yellow-100 text-yellow-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
            {pendingCount}
          </span>
        )}
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 z-30 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5">
          {otherClubs.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Switch to
              </div>
              {otherClubs.map((m) => (
                <button
                  key={m.clubId}
                  onClick={() => switchTo(m.clubId)}
                  disabled={!!switching}
                  className="w-full text-start px-3 py-2 hover:bg-gray-50 transition flex items-center gap-3 disabled:opacity-50"
                >
                  {m.clubLogoUrl ? (
                    <img src={m.clubLogoUrl} alt="" className="w-7 h-7 rounded object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-500">
                      {m.clubName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{m.clubName}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {m.customRoleLabel || m.role}
                    </div>
                  </div>
                  {switching === m.clubId && (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600" />
                  )}
                </button>
              ))}
              <div className="border-t border-gray-100 my-1" />
            </>
          )}
          <Link
            href="/invitations"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            My clubs & invitations
            {pendingCount > 0 && (
              <span className="ms-2 bg-yellow-100 text-yellow-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {pendingCount} new
              </span>
            )}
          </Link>
        </div>
      )}
    </div>
  );
}
