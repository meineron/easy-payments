import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import PhonePrefixInput from "@/components/PhonePrefixInput";
import { formatDob, dobAge } from "@/lib/dob";

import DashboardLayout from "@/components/DashboardLayout";
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];
const PHONE_PREFIXES = ["+1", "+44", "+972", "+61", "+49", "+33", "+34", "+39", "+81", "+86"];

function fmt(cents) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CURRENT_SEASON = "26/27";
const PREVIOUS_SEASON = "25/26";

const age = dobAge;

export default function TeamDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [team, setTeam] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const ALL_OPTIONAL_COLS = [
    { key: "position", label: "Position" },
    { key: "school", label: "School" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
  ];
  const [visibleCols, setVisibleCols] = useState(new Set(["phone", "email"]));
  const [showColPicker, setShowColPicker] = useState(false);

  function toggleCol(key) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Details modal
  const [detailsModal, setDetailsModal] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [addModal, setAddModal] = useState(false);
  const [addTab, setAddTab] = useState("previous");

  // Manage Teams state
  const [manageModal, setManageModal] = useState(null);
  const [manageTeams, setManageTeams] = useState([]);
  const [managePlayerTeamIds, setManagePlayerTeamIds] = useState(new Set());
  const [manageRegTeamId, setManageRegTeamId] = useState("");
  const [manageRegStatuses, setManageRegStatuses] = useState({});
  const [manageLoading, setManageLoading] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState("");

  // Remove state
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  // "New Player" form state
  const [newPlayer, setNewPlayer] = useState(emptyPlayerForm());
  const [newPlayerSaving, setNewPlayerSaving] = useState(false);
  const [newPlayerError, setNewPlayerError] = useState("");
  const [playerOptions, setPlayerOptions] = useState({ positions: [], schools: [] });

  // "From Previous Season" state
  const [allTeams, setAllTeams] = useState([]);
  const [prevSeason, setPrevSeason] = useState("");
  const [prevTeamId, setPrevTeamId] = useState("");
  const [prevPlayers, setPrevPlayers] = useState([]);
  const [prevLoading, setPrevLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [addingSeason, setAddingSeason] = useState(false);
  const [addSeasonResult, setAddSeasonResult] = useState("");

  function emptyPlayerForm() {
    return {
      firstName: "", lastName: "", dateOfBirth: "", gender: "",
      primaryPosition: "", secondaryPosition: "", school: "",
      phonePrefix: "+1", phoneNumber: "", email: "", address: "", city: "", state: "", zip: "",
    };
  }

  useEffect(() => { fetchData(); }, [id]);

  async function fetchData() {
    try {
      const [teamRes, regsRes] = await Promise.all([
        fetch(`/api/teams/${id}`),
        fetch(`/api/teams/${id}/registrations`),
      ]);
      const teamData = await teamRes.json();
      const regsData = await regsRes.json();
      if (teamRes.ok) setTeam(teamData.team);
      if (regsRes.ok) {
        setRegistrations(regsData.registrations || []);
        setTeamPlayers(regsData.teamPlayers || []);
      }
    } catch (err) {
      console.error("Failed to fetch team data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function openAddModal() {
    setAddModal(true);
    setAddTab("previous");
    setNewPlayer(emptyPlayerForm());
    setNewPlayerError("");
    setSelectedIds(new Set());
    setPrevPlayers([]);
    setPrevTeamId("");
    setPrevSeason("");
    setAddSeasonResult("");

    const [teamsRes, optsRes] = await Promise.all([
      fetch("/api/teams"),
      fetch("/api/players/options"),
    ]);
    if (teamsRes.ok) {
      const data = await teamsRes.json();
      setAllTeams(data.teams || []);
    }
    if (optsRes.ok) {
      const data = await optsRes.json();
      setPlayerOptions({ positions: data.positions || [], schools: data.schools || [] });
    }
  }

  function closeAddModal() {
    setAddModal(false);
  }

  // --- Details modal ---
  async function openDetailsModal(row) {
    const playerInfo = {};
    const parentInfo = [];
    const activityInfo = [];

    if (row.type === "team-member" && row.player) {
      const p = row.player;
      Object.assign(playerInfo, {
        name: `${p.firstName} ${p.lastName}`,
        gender: p.gender || "—",
        dob: p.dateOfBirth ? formatDob(p.dateOfBirth, "en-US") : "—",
        email: p.email || "—",
        phone: p.phoneNumber ? `${p.phonePrefix || "+1"} ${p.phoneNumber}` : "—",
        address: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ") || "—",
        position: [p.primaryPosition, p.secondaryPosition].filter(Boolean).join(" / ") || "—",
        school: p.school || "—",
      });
      if (p.parents && p.parents.length > 0) {
        p.parents.forEach((pr) => {
          parentInfo.push({
            name: `${pr.firstName} ${pr.lastName}`,
            email: pr.email || "—",
            phone: `${pr.phonePrefix || "+1"} ${pr.phone || "—"}`,
          });
        });
      }
      setDetailsModal({ playerInfo, parentInfo, activityInfo, loading: true });
      setDetailsLoading(true);
      try {
        const res = await fetch(`/api/players/${p._id}/activities`);
        if (res.ok) {
          const data = await res.json();
          setDetailsModal((prev) => prev && ({ ...prev, activityInfo: data.activities || [], loading: false }));
        } else {
          setDetailsModal((prev) => prev && ({ ...prev, loading: false }));
        }
      } catch {
        setDetailsModal((prev) => prev && ({ ...prev, loading: false }));
      } finally {
        setDetailsLoading(false);
      }
    } else if (row.type === "registration" && row.reg) {
      const r = row.reg;
      Object.assign(playerInfo, {
        name: `${r.playerFirstName} ${r.playerLastName}`,
        gender: r.playerGender || "—",
        dob: r.playerDob ? formatDob(r.playerDob, "en-US") : "—",
        email: r.playerEmail || "—",
        phone: r.playerPhone || "—",
        address: [r.playerAddress, r.playerCity, r.playerState, r.playerZip].filter(Boolean).join(", ") || "—",
        position: "—",
        school: "—",
      });
      parentInfo.push({
        name: `${r.parentFirstName} ${r.parentLastName}`,
        email: r.parentEmail || "—",
        phone: `${r.parentPhonePrefix || "+1"} ${r.parentPhone || "—"}`,
      });
      activityInfo.push({
        title: "Registration",
        season: team?.season || "",
        status: r.status,
        finalCostCents: r.finalCostCents,
        collectedCents: r.collectedCents,
      });
      setDetailsModal({ playerInfo, parentInfo, activityInfo, loading: false });
    }
  }

  // --- Remove player logic ---
  async function removePlayerFromTeam() {
    if (!removeConfirm) return;
    setRemoveLoading(true);
    try {
      const res = await fetch(`/api/teams/${id}/players`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: removeConfirm._id }),
      });
      if (res.ok) {
        setRemoveConfirm(null);
        fetchData();
      }
    } catch (err) {
      console.error("Remove failed:", err);
    } finally {
      setRemoveLoading(false);
    }
  }

  async function openManageTeams(player) {
    setManageModal(player);
    setManageTeams([]);
    setManagePlayerTeamIds(new Set());
    setManageRegTeamId(player.registrationTeamId ? (typeof player.registrationTeamId === "object" ? player.registrationTeamId._id : player.registrationTeamId) : "");
    setManageRegStatuses({});
    setManageError("");
    setManageLoading(true);
    try {
      const res = await fetch(`/api/players/${player._id}/teams`);
      const data = await res.json();
      if (res.ok) {
        setManageTeams(data.allTeams || []);
        const ptIds = new Set(data.playerTeamIds || []);
        if (data.registrationTeamId) ptIds.delete(data.registrationTeamId);
        setManagePlayerTeamIds(ptIds);
        setManageRegTeamId(data.registrationTeamId || "");
        setManageRegStatuses(data.registrationStatuses || {});
      }
    } catch (err) {
      console.error("Failed to load teams:", err);
    } finally {
      setManageLoading(false);
    }
  }

  function toggleManageTeam(teamId) {
    setManagePlayerTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function saveManageTeams() {
    if (!manageModal) return;
    setManageSaving(true);
    setManageError("");
    try {
      const guestIds = [...managePlayerTeamIds].filter((tid) => tid !== manageRegTeamId);
      const res = await fetch(`/api/players/${manageModal._id}/teams`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: guestIds, registrationTeamId: manageRegTeamId || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setManageModal(null);
        fetchData();
      } else {
        setManageError(data.error || "Failed to update teams");
      }
    } catch {
      setManageError("Something went wrong");
    } finally {
      setManageSaving(false);
    }
  }

  // --- Previous season logic ---
  const existingPlayerIds = new Set(teamPlayers.map((p) => p._id));

  const otherTeams = allTeams.filter((t) => t._id !== id);
  const seasons = [...new Set(otherTeams.map((t) => t.season))].sort().reverse();
  const teamsForSeason = otherTeams.filter((t) => t.season === prevSeason);

  useEffect(() => {
    if (prevSeason && teamsForSeason.length > 0 && !teamsForSeason.find((t) => t._id === prevTeamId)) {
      setPrevTeamId("");
      setPrevPlayers([]);
      setSelectedIds(new Set());
    }
  }, [prevSeason]);

  async function loadPrevPlayers(teamId) {
    setPrevTeamId(teamId);
    setSelectedIds(new Set());
    setPrevPlayers([]);
    setAddSeasonResult("");
    if (!teamId) return;
    setPrevLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/players`);
      const data = await res.json();
      if (res.ok) setPrevPlayers(data.players || []);
    } catch (err) {
      console.error("Failed to load players:", err);
    } finally {
      setPrevLoading(false);
    }
  }

  function togglePlayer(playerId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function toggleAll() {
    const eligible = prevPlayers.filter((p) => !existingPlayerIds.has(p._id));
    if (selectedIds.size === eligible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map((p) => p._id)));
    }
  }

  async function addSelectedPlayers() {
    if (selectedIds.size === 0) return;
    setAddingSeason(true);
    setAddSeasonResult("");
    try {
      const res = await fetch(`/api/teams/${id}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddSeasonResult(`${data.added} player(s) added to team`);
        setSelectedIds(new Set());
        fetchData();
      } else {
        setAddSeasonResult(data.error || "Failed to add players");
      }
    } catch {
      setAddSeasonResult("Something went wrong");
    } finally {
      setAddingSeason(false);
    }
  }

  // --- New player logic ---
  async function createNewPlayer() {
    if (!newPlayer.firstName.trim() || !newPlayer.lastName.trim()) {
      setNewPlayerError("First and last name are required");
      return;
    }
    setNewPlayerSaving(true);
    setNewPlayerError("");
    try {
      const payload = {
        ...newPlayer,
        teams: [{ teamId: id, season: team.season }],
      };
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewPlayerError(data.error || "Failed to create player");
        return;
      }
      setNewPlayer(emptyPlayerForm());
      setNewPlayerError("");
      fetchData();
      closeAddModal();
    } catch {
      setNewPlayerError("Something went wrong");
    } finally {
      setNewPlayerSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-gray-500">Loading team...</p></div>;
  }

  if (!team) {
    return <div className="flex items-center justify-center py-12"><p className="text-gray-500">Team not found.</p></div>;
  }

  const totalMembers = teamPlayers.length;

  function statusBadge(status) {
    const styles = {
      pending: "bg-yellow-50 text-yellow-700",
      active: "bg-blue-50 text-blue-700",
      completed: "bg-green-50 text-green-700",
      failed: "bg-red-50 text-red-700",
      "team-member": "bg-purple-50 text-purple-700",
      guest: "bg-orange-50 text-orange-700",
    };
    return styles[status] || "bg-gray-50 text-gray-700";
  }

  function statusLabel(status) {
    if (status === "team-member") return "Team Member";
    if (status === "guest") return "Guest";
    return status;
  }

  function genderBadge(gender) {
    return gender === "Female" ? "bg-pink-50 text-pink-700" : "bg-blue-50 text-blue-700";
  }

  const allRows = [];

  teamPlayers.forEach((player) => {
    const p1 = player.parents?.[0];
    const p2 = player.parents?.[1];
    const regTeamId = player.registrationTeamId ? (typeof player.registrationTeamId === "object" ? player.registrationTeamId._id : player.registrationTeamId) : null;
    const isRegistrationTeam = regTeamId && regTeamId.toString() === id;
    allRows.push({
      key: `player-${player._id}`,
      type: "team-member",
      playerName: `${player.firstName} ${player.lastName}`,
      gender: player.gender || "",
      dob: player.dateOfBirth,
      primaryPosition: player.primaryPosition || "",
      secondaryPosition: player.secondaryPosition || "",
      school: player.school || "",
      phonePrefix: player.phonePrefix || "+1",
      phoneNumber: player.phoneNumber || "",
      email: player.email || "",
      parent1: p1 || null,
      parent2: p2 || null,
      teams: player.teams || [],
      regTeamId,
      status: isRegistrationTeam ? "team-member" : "guest",
      player, reg: null,
    });
  });

  registrations.forEach((reg) => {
    allRows.push({
      key: `reg-${reg._id}`,
      type: "registration",
      playerName: `${reg.playerFirstName} ${reg.playerLastName}`,
      gender: reg.playerGender || "",
      dob: reg.playerDob,
      primaryPosition: "",
      secondaryPosition: "",
      school: "",
      phoneNumber: reg.playerPhone || "",
      email: reg.playerEmail || "",
      parent1: reg.parentFirstName ? { firstName: reg.parentFirstName, lastName: reg.parentLastName, email: reg.parentEmail, phone: reg.parentPhone, phonePrefix: reg.parentPhonePrefix || "+1" } : null,
      parent2: null,
      teams: [],
      regTeamId: null,
      status: reg.status,
      player: null, reg,
    });
  });

  const isEmpty = allRows.length === 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/teams" className="text-sm text-gray-500 hover:text-gray-700 transition mb-3 inline-block">&larr; Back to Teams</Link>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">{team.name}</h2>
          {team.gender && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${genderBadge(team.gender)}`}>{team.gender}</span>}
          {team.teamType && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{team.teamType}</span>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
          <span>Season {team.season}</span>
          <span className="font-medium text-purple-600">{totalMembers} member{totalMembers !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Players ({allRows.length})</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setShowColPicker((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 transition flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Columns
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 w-40">
                  {ALL_OPTIONAL_COLS.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                      <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded" />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={openAddModal}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              + Add Players
            </button>
          </div>
        </div>
        {isEmpty ? (
          <div className="p-8 text-center text-sm text-gray-400">No players in this team yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">DOB (Age)</th>
                  {visibleCols.has("position") && <th className="px-4 py-3">Position</th>}
                  {visibleCols.has("phone") && <th className="px-4 py-3">Phone</th>}
                  {visibleCols.has("email") && <th className="px-4 py-3">Email</th>}
                  <th className="px-4 py-3">Parent 1</th>
                  <th className="px-4 py-3">Parent 2</th>
                  <th className="px-4 py-3">Team ({CURRENT_SEASON})</th>
                  <th className="px-4 py-3">Team ({PREVIOUS_SEASON})</th>
                  {visibleCols.has("school") && <th className="px-4 py-3">School</th>}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allRows.map((row) => (
                  <tr key={row.key} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{row.playerName}</span>
                        {row.gender && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${genderBadge(row.gender)}`}>{row.gender}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {row.dob ? (
                        <><span className="text-xs">{formatDob(row.dob)}</span> <span className="text-gray-400">({age(row.dob)})</span></>
                      ) : "—"}
                    </td>
                    {visibleCols.has("position") && (
                      <td className="px-4 py-3 text-gray-700">
                        {row.primaryPosition ? (
                          <div>
                            <div className="text-xs">{row.primaryPosition}</div>
                            {row.secondaryPosition && <div className="text-xs text-gray-400">{row.secondaryPosition}</div>}
                          </div>
                        ) : "—"}
                      </td>
                    )}
                    {visibleCols.has("phone") && <td className="px-4 py-3 text-gray-700 text-xs" dir="ltr">{row.phoneNumber ? `${row.phonePrefix || "+1"} ${row.phoneNumber}` : "—"}</td>}
                    {visibleCols.has("email") && <td className="px-4 py-3 text-gray-700 text-xs">{row.email || "—"}</td>}
                    <td className="px-4 py-3">
                      {row.parent1 ? (
                        <div>
                          <div className="text-xs font-medium text-gray-900">{row.parent1.firstName} {row.parent1.lastName}</div>
                          {row.parent1.email && <div className="text-[10px] text-gray-400">{row.parent1.email}</div>}
                          {row.parent1.phone && <div className="text-[10px] text-gray-400" dir="ltr">{row.parent1.phonePrefix || ""}{row.parent1.phone}</div>}
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.parent2 ? (
                        <div>
                          <div className="text-xs font-medium text-gray-900">{row.parent2.firstName} {row.parent2.lastName}</div>
                          {row.parent2.email && <div className="text-[10px] text-gray-400">{row.parent2.email}</div>}
                          {row.parent2.phone && <div className="text-[10px] text-gray-400" dir="ltr">{row.parent2.phonePrefix || ""}{row.parent2.phone}</div>}
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const curr = row.teams.filter((t) => t.season === CURRENT_SEASON);
                        return curr.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {curr.map((t, i) => {
                              const tid = typeof t.teamId === "object" ? t.teamId?._id : t.teamId;
                              const isSub = row.regTeamId && String(tid) === String(row.regTeamId);
                              return <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSub ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{t.teamId?.name || "?"}{isSub ? " (sub)" : ""}</span>;
                            })}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const prev = row.teams.filter((t) => t.season === PREVIOUS_SEASON);
                        return prev.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {prev.map((t, i) => {
                              const tid = typeof t.teamId === "object" ? t.teamId?._id : t.teamId;
                              const isSub = row.regTeamId && String(tid) === String(row.regTeamId);
                              return <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSub ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{t.teamId?.name || "?"}{isSub ? " (sub)" : ""}</span>;
                            })}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>;
                      })()}
                    </td>
                    {visibleCols.has("school") && <td className="px-4 py-3 text-gray-700 text-xs">{row.school || "—"}</td>}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${statusBadge(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openDetailsModal(row)} className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition">
                          Details
                        </button>
                        {row.type === "team-member" && (
                          <>
                            <button onClick={() => openManageTeams(row.player)} className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition">
                              Teams
                            </button>
                            <button onClick={() => setRemoveConfirm(row.player)} className="px-2.5 py-1 border border-red-200 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition">
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {detailsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Player Details</h3>
              <button onClick={() => setDetailsModal(null)} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Player Info */}
            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Player Information</p>
              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-900">{detailsModal.playerInfo.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Gender</span><span className="text-gray-900">{detailsModal.playerInfo.gender}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Date of Birth</span><span className="text-gray-900">{detailsModal.playerInfo.dob}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-900">{detailsModal.playerInfo.email}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Phone</span><span className="text-gray-900">{detailsModal.playerInfo.phone}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="text-gray-900 text-right max-w-[60%]">{detailsModal.playerInfo.address}</span></div>
                {detailsModal.playerInfo.position !== "—" && (
                  <div className="flex justify-between"><span className="text-gray-500">Position</span><span className="text-gray-900">{detailsModal.playerInfo.position}</span></div>
                )}
                {detailsModal.playerInfo.school !== "—" && (
                  <div className="flex justify-between"><span className="text-gray-500">School</span><span className="text-gray-900">{detailsModal.playerInfo.school}</span></div>
                )}
              </div>
            </div>

            {/* Parent Info */}
            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Parents</p>
              {detailsModal.parentInfo.length === 0 ? (
                <p className="text-sm text-gray-400">No parent information available.</p>
              ) : (
                <div className="space-y-2">
                  {detailsModal.parentInfo.map((pr, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                      <div className="font-medium text-gray-900">{pr.name}</div>
                      <div className="text-gray-500">{pr.email}</div>
                      <div className="text-gray-500">{pr.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity / Payment Info */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Activity & Payment</p>
              {detailsModal.loading ? (
                <p className="text-sm text-gray-400">Loading activity data...</p>
              ) : detailsModal.activityInfo.length === 0 ? (
                <p className="text-sm text-gray-400">No activity registrations found.</p>
              ) : (
                <div className="space-y-2">
                  {detailsModal.activityInfo.map((act, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900">{act.title}</span>
                        {act.season && <span className="text-xs text-gray-400">Season {act.season}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge(act.status || "pending")}`}>
                          {act.status || "pending"}
                        </span>
                        {act.finalCostCents !== undefined && (
                          <span className="text-xs text-gray-500">
                            Cost: {fmt(act.finalCostCents)} · Collected: {fmt(act.collectedCents || 0)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Players Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="px-6 pt-6 pb-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Add Players to {team.name}</h3>
                <button onClick={closeAddModal} className="text-gray-400 hover:text-gray-600 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex gap-1 border-b border-gray-200">
                <button
                  onClick={() => setAddTab("previous")}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${addTab === "previous" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  From Previous Season
                </button>
                <button
                  onClick={() => setAddTab("new")}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${addTab === "new" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  New Player
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {addTab === "previous" && (
                <div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                      <select value={prevSeason} onChange={(e) => { setPrevSeason(e.target.value); setPrevTeamId(""); setPrevPlayers([]); setSelectedIds(new Set()); setAddSeasonResult(""); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select season...</option>
                        {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                      <select value={prevTeamId} onChange={(e) => loadPrevPlayers(e.target.value)} disabled={!prevSeason}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400">
                        <option value="">Select team...</option>
                        {teamsForSeason.map((t) => <option key={t._id} value={t._id}>{t.name}{t.gender ? ` (${t.gender})` : ""}</option>)}
                      </select>
                    </div>
                  </div>

                  {prevLoading && <div className="py-8 text-center text-gray-500">Loading players...</div>}
                  {!prevLoading && prevTeamId && prevPlayers.length === 0 && <div className="py-8 text-center text-gray-400">No players found in this team.</div>}
                  {!prevLoading && prevPlayers.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-gray-600">{prevPlayers.length} player(s) found</p>
                        <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                          {selectedIds.size === prevPlayers.filter((p) => !existingPlayerIds.has(p._id)).length ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                        {prevPlayers.map((p) => {
                          const alreadyInTeam = existingPlayerIds.has(p._id);
                          return (
                            <label key={p._id} className={`flex items-center gap-3 px-4 py-3 transition ${alreadyInTeam ? "bg-gray-50 opacity-60" : "hover:bg-blue-50 cursor-pointer"}`}>
                              <input type="checkbox" checked={alreadyInTeam || selectedIds.has(p._id)} disabled={alreadyInTeam}
                                onChange={() => togglePlayer(p._id)} className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 text-sm">{p.firstName} {p.lastName}</span>
                                  {p.gender && <span className="text-xs text-gray-400">{p.gender}</span>}
                                  {alreadyInTeam && <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">Already in team</span>}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {[p.dateOfBirth ? formatDob(p.dateOfBirth) : null, p.primaryPosition, p.school].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {addSeasonResult && (
                        <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${addSeasonResult.includes("added") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                          {addSeasonResult}
                        </div>
                      )}
                      <div className="mt-4 flex gap-3">
                        <button onClick={closeAddModal} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                        <button onClick={addSelectedPlayers} disabled={selectedIds.size === 0 || addingSeason}
                          className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
                          {addingSeason ? "Adding..." : `Add ${selectedIds.size} Player${selectedIds.size !== 1 ? "s" : ""}`}
                        </button>
                      </div>
                    </div>
                  )}
                  {!prevLoading && !prevTeamId && <div className="py-8 text-center text-gray-400">Select a season and team to browse players.</div>}
                </div>
              )}

              {addTab === "new" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                      <input type="text" value={newPlayer.firstName} onChange={(e) => setNewPlayer({ ...newPlayer, firstName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                      <input type="text" value={newPlayer.lastName} onChange={(e) => setNewPlayer({ ...newPlayer, lastName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                      <input type="date" value={newPlayer.dateOfBirth} onChange={(e) => setNewPlayer({ ...newPlayer, dateOfBirth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                      <select value={newPlayer.gender} onChange={(e) => setNewPlayer({ ...newPlayer, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">—</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
                      <input type="text" list="schools-list" value={newPlayer.school} onChange={(e) => setNewPlayer({ ...newPlayer, school: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                      <datalist id="schools-list">{playerOptions.schools.map((s) => <option key={s} value={s} />)}</datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Primary Position</label>
                      <input type="text" list="pos-list" value={newPlayer.primaryPosition} onChange={(e) => setNewPlayer({ ...newPlayer, primaryPosition: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                      <datalist id="pos-list">{playerOptions.positions.map((p) => <option key={p} value={p} />)}</datalist>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Position</label>
                      <input type="text" list="pos-list" value={newPlayer.secondaryPosition} onChange={(e) => setNewPlayer({ ...newPlayer, secondaryPosition: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input type="email" value={newPlayer.email} onChange={(e) => setNewPlayer({ ...newPlayer, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <PhonePrefixInput prefix={newPlayer.phonePrefix} phone={newPlayer.phoneNumber} onPrefixChange={(v) => setNewPlayer({ ...newPlayer, phonePrefix: v })} onPhoneChange={(v) => setNewPlayer({ ...newPlayer, phoneNumber: v })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" value={newPlayer.address} onChange={(e) => setNewPlayer({ ...newPlayer, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input type="text" value={newPlayer.city} onChange={(e) => setNewPlayer({ ...newPlayer, city: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <select value={newPlayer.state} onChange={(e) => setNewPlayer({ ...newPlayer, state: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">—</option>
                        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                      <input type="text" value={newPlayer.zip} onChange={(e) => setNewPlayer({ ...newPlayer, zip: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  {newPlayerError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">{newPlayerError}</div>}
                  <div className="flex gap-3 pt-2">
                    <button onClick={closeAddModal} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                    <button onClick={createNewPlayer} disabled={newPlayerSaving}
                      className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
                      {newPlayerSaving ? "Creating..." : "Create & Add to Team"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Remove Player</h3>
            <p className="text-sm text-gray-600 mb-4">
              Remove <span className="font-semibold">{removeConfirm.firstName} {removeConfirm.lastName}</span> from <span className="font-semibold">{team.name}</span>?
            </p>
            <p className="text-xs text-gray-400 mb-4">The player will no longer be a member of this team. Any existing payments are kept.</p>
            <div className="flex gap-3">
              <button onClick={() => setRemoveConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
              <button onClick={removePlayerFromTeam} disabled={removeLoading}
                className="flex-1 bg-red-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50">
                {removeLoading ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Teams Modal */}
      {manageModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-gray-900">Manage Teams</h3>
                <button onClick={() => setManageModal(null)} className="text-gray-400 hover:text-gray-600 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{manageModal.firstName} {manageModal.lastName}</span>
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {manageLoading ? (
                <div className="py-8 text-center text-gray-500">Loading teams...</div>
              ) : (
                <>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Registration Team</label>
                    <p className="text-xs text-gray-400 mb-2">The main team this player is registered and pays for.</p>
                    <select value={manageRegTeamId}
                      onChange={(e) => {
                        const newRegId = e.target.value;
                        setManagePlayerTeamIds((prev) => { const next = new Set(prev); if (manageRegTeamId) next.add(manageRegTeamId); next.delete(newRegId); return next; });
                        setManageRegTeamId(newRegId);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                      <option value="">No registration team</option>
                      {manageTeams.map((t) => {
                        const regStatus = manageRegStatuses[t._id];
                        return <option key={t._id} value={t._id}>{t.name} ({t.season}){t.gender ? ` · ${t.gender}` : ""}{regStatus ? ` [Payment: ${regStatus}]` : ""}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Additional Teams (Guest)</label>
                    <p className="text-xs text-gray-400 mb-2">Attach the player to other teams as a guest.</p>
                    {(() => {
                      const other = manageTeams.filter((t) => t._id !== manageRegTeamId);
                      const grouped = {};
                      other.forEach((t) => { if (!grouped[t.season]) grouped[t.season] = []; grouped[t.season].push(t); });
                      const seasonKeys = Object.keys(grouped).sort().reverse();
                      if (other.length === 0) return <div className="py-4 text-center text-gray-400 text-sm">No other teams available.</div>;
                      return seasonKeys.map((season) => (
                        <div key={season} className="mb-3 last:mb-0">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Season {season}</p>
                          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                            {grouped[season].map((t) => (
                              <label key={t._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50 cursor-pointer transition">
                                <input type="checkbox" checked={managePlayerTeamIds.has(t._id)} onChange={() => toggleManageTeam(t._id)}
                                  className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900 text-sm">{t.name}</span>
                                    {t.gender && <span className={`text-xs px-1.5 py-0.5 rounded ${t.gender === "Female" ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"}`}>{t.gender}</span>}
                                    {t.teamType && <span className="text-xs text-gray-400">{t.teamType}</span>}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-3">
                {manageRegTeamId ? "1 registration team" : "No registration team"}{managePlayerTeamIds.size > 0 ? ` + ${managePlayerTeamIds.size} guest team${managePlayerTeamIds.size !== 1 ? "s" : ""}` : ""}. Payments are preserved regardless of changes.
              </p>
              {manageError && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-3">{manageError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setManageModal(null)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                <button onClick={saveManageTeams} disabled={manageSaving}
                  className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
                  {manageSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

TeamDetailPage.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;
