"use client";

import { useState, useEffect, useRef } from "react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const CURRENT_SEASON = "26/27";
const PREVIOUS_SEASON = "25/26";

const EMPTY_PLAYER = {
  firstName: "", lastName: "", dateOfBirth: "", gender: "",
  primaryPosition: "", secondaryPosition: "", school: "",
  joinDate: "", phoneNumber: "", address: "", city: "", state: "", zip: "", email: "",
};

function age(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function TeamsBySeason({ teams, regTeamId, genderBadge }) {
  const grouped = {};
  teams.forEach((t) => {
    const s = t.season || "Unknown";
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(t);
  });
  const seasonKeys = Object.keys(grouped).sort().reverse();
  const [activeSeason, setActiveSeason] = useState(
    seasonKeys.includes(CURRENT_SEASON) ? CURRENT_SEASON : seasonKeys[0] || CURRENT_SEASON
  );
  const activeTeams = grouped[activeSeason] || [];

  return (
    <div className="mb-4">
      <h4 className="font-semibold text-gray-900 mb-2">Teams ({teams.length})</h4>
      {seasonKeys.length === 0 ? (
        <p className="text-sm text-gray-400">No teams assigned.</p>
      ) : (
        <>
          <div className="flex gap-1 border-b border-gray-200 mb-3">
            {seasonKeys.map((s) => (
              <button key={s} onClick={() => setActiveSeason(s)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition -mb-px ${activeSeason === s ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {s} ({grouped[s].length})
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {activeTeams.map((t, idx) => {
              const team = t.teamId;
              const tid = typeof team === "object" ? team?._id : team;
              const isSub = regTeamId && String(tid) === String(regTeamId);
              return (
                <div key={idx} className={`rounded-lg p-3 flex items-center justify-between ${isSub ? "border border-green-200 bg-green-50/30" : "border border-gray-200"}`}>
                  <div>
                    <p className="font-medium text-gray-900">{team?.name || "Unknown"}{isSub ? <span className="text-xs text-green-600 font-normal ml-1">(subscription)</span> : ""}</p>
                    {team?.teamType && <p className="text-xs text-gray-500">{team.teamType}</p>}
                  </div>
                  {team?.gender && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${genderBadge(team.gender)}`}>{team.gender}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [options, setOptions] = useState({ positions: [], schools: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_PLAYER });
  const [editSeasonTab, setEditSeasonTab] = useState(CURRENT_SEASON);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

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

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [pRes, tRes, oRes] = await Promise.all([
        fetch("/api/players"),
        fetch("/api/teams"),
        fetch("/api/players/options"),
      ]);
      const pData = await pRes.json();
      const tData = await tRes.json();
      const oData = await oRes.json();
      if (pRes.ok) setPlayers(pData.players);
      if (tRes.ok) setTeams(tData.teams);
      if (oRes.ok) setOptions(oData);
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = search
    ? players.filter((p) => {
        const s = search.toLowerCase();
        return (
          p.firstName.toLowerCase().includes(s) ||
          p.lastName.toLowerCase().includes(s) ||
          (p.email && p.email.toLowerCase().includes(s)) ||
          (p.school && p.school.toLowerCase().includes(s))
        );
      })
    : players;

  function openPlayer(player) {
    setSelectedPlayer(player);
    setEditing(false);
    setEditForm(null);
    setFormError("");
  }

  function closePlayer() {
    setSelectedPlayer(null);
    setEditing(false);
    setEditForm(null);
    setFormError("");
  }

  function startEdit() {
    const p = selectedPlayer;
    setEditForm({
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split("T")[0] : "",
      gender: p.gender || "",
      primaryPosition: p.primaryPosition || "",
      secondaryPosition: p.secondaryPosition || "",
      school: p.school || "",
      joinDate: p.joinDate ? p.joinDate.split("T")[0] : "",
      phoneNumber: p.phoneNumber || "",
      address: p.address || "",
      city: p.city || "",
      state: p.state || "",
      zip: p.zip || "",
      email: p.email || "",
      teams: p.teams.map((t) => ({
        teamId: typeof t.teamId === "object" ? t.teamId._id : t.teamId,
        season: t.season,
      })),
      registrationTeamId: p.registrationTeamId?._id || p.registrationTeamId || "",
    });
    setEditSeasonTab(CURRENT_SEASON);
    setEditing(true);
    setFormError("");
  }

  async function saveEdit() {
    setFormLoading(true);
    setFormError("");
    try {
      const { registrationTeamId, ...rest } = editForm;
      const res = await fetch(`/api/players/${selectedPlayer._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, registrationTeamId: registrationTeamId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed to save"); return; }
      setSelectedPlayer(data.player);
      setEditing(false);
      setEditForm(null);
      fetchAll();
    } catch (err) {
      setFormError("Something went wrong");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed to create"); setFormLoading(false); return; }
      setShowCreate(false);
      setCreateForm({ ...EMPTY_PLAYER });
      fetchAll();
      openPlayer(data.player);
    } catch (err) {
      setFormError("Something went wrong");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(playerId) {
    if (!confirm("Delete this player?")) return;
    try {
      const res = await fetch(`/api/players/${playerId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedPlayer?._id === playerId) closePlayer();
        fetchAll();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/players/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setUploadResult({ success: false, message: data.error, errors: data.errors });
      } else {
        const s = data.stats;
        setUploadResult({
          success: true,
          message: `Created ${s.players.created} players, ${s.parents.created} parents, ${s.teams.created} teams. Updated ${s.players.updated} players, ${s.parents.updated} parents.`,
          errors: data.errors,
        });
        fetchAll();
      }
    } catch (err) {
      setUploadResult({ success: false, message: "Failed to upload file" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function addTeamRow() {
    setEditForm((prev) => ({
      ...prev,
      teams: [...prev.teams, { teamId: "", season: "25/26" }],
    }));
  }

  function removeTeamRow(idx) {
    setEditForm((prev) => ({
      ...prev,
      teams: prev.teams.filter((_, i) => i !== idx),
    }));
  }

  function updateTeamRow(idx, field, value) {
    setEditForm((prev) => {
      const teams = [...prev.teams];
      teams[idx] = { ...teams[idx], [field]: value };
      return { ...prev, teams };
    });
  }

  function genderBadge(gender) {
    if (gender === "Female") return "bg-pink-50 text-pink-700";
    if (gender === "Male") return "bg-blue-50 text-blue-700";
    return "bg-gray-50 text-gray-500";
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-gray-500">Loading players...</p></div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Players</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload CSV"}
          </button>
          <button
            onClick={() => { setShowCreate(true); setFormError(""); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Add Player
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or school..."
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
        />
      </div>

      {/* Upload Result Banner */}
      {uploadResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${
          uploadResult.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-medium">{uploadResult.message}</span>
            <button onClick={() => setUploadResult(null)} className="text-current opacity-50 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <div className="mt-2 text-xs space-y-0.5 opacity-80">
              {uploadResult.errors.slice(0, 10).map((err, i) => <p key={i}>{err}</p>)}
              {uploadResult.errors.length > 10 && <p>...and {uploadResult.errors.length - 10} more</p>}
            </div>
          )}
        </div>
      )}

      {/* Create Player Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Player</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              {renderPlayerFormFields(createForm, setCreateForm, options)}
              {formError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">{formError}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={formLoading} className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
                  {formLoading ? "Creating..." : "Create Player"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Player Profile</h3>
              <button onClick={closePlayer} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {!editing ? (
              <div>
                {/* Player Info */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-lg">{selectedPlayer.firstName} {selectedPlayer.lastName}</p>
                        {selectedPlayer.gender && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${genderBadge(selectedPlayer.gender)}`}>{selectedPlayer.gender}</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                        {selectedPlayer.dateOfBirth && <p>DOB: {new Date(selectedPlayer.dateOfBirth).toLocaleDateString()} (Age {age(selectedPlayer.dateOfBirth)})</p>}
                        {selectedPlayer.email && <p>Email: {selectedPlayer.email}</p>}
                        {selectedPlayer.phoneNumber && <p>Phone: {selectedPlayer.phoneNumber}</p>}
                        {selectedPlayer.primaryPosition && <p>Position: {selectedPlayer.primaryPosition}{selectedPlayer.secondaryPosition ? ` / ${selectedPlayer.secondaryPosition}` : ""}</p>}
                        {selectedPlayer.school && <p>School: {selectedPlayer.school}</p>}
                        {selectedPlayer.joinDate && <p>Joined: {new Date(selectedPlayer.joinDate).toLocaleDateString()}</p>}
                        {(selectedPlayer.address || selectedPlayer.city) && (
                          <p>{[selectedPlayer.address, selectedPlayer.city, selectedPlayer.state, selectedPlayer.zip].filter(Boolean).join(", ")}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={startEdit} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white transition">Edit</button>
                      <button onClick={() => handleDelete(selectedPlayer._id)} className="px-3 py-1.5 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">Delete</button>
                    </div>
                  </div>
                </div>

                {/* Teams grouped by season */}
                <TeamsBySeason teams={selectedPlayer.teams} regTeamId={selectedPlayer.registrationTeamId?._id || selectedPlayer.registrationTeamId} genderBadge={genderBadge} />

                {/* Parents */}
                <h4 className="font-semibold text-gray-900 mb-2">Parents ({selectedPlayer.parents.length})</h4>
                {selectedPlayer.parents.length === 0 ? (
                  <p className="text-sm text-gray-400">No parents linked.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedPlayer.parents.map((parent, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-medium text-gray-900">{parent.firstName} {parent.lastName}</p>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {parent.email && <span className="mr-3">{parent.email}</span>}
                          {parent.phone && <span>{parent.phonePrefix} {parent.phone}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {renderPlayerFormFields(editForm, setEditForm, options)}

                {/* Team Assignments - by season */}
                {(() => {
                  const regId = editForm.registrationTeamId;
                  const allTeamIds = editForm.teams.map((t) => t.teamId);
                  const isCurrent = editSeasonTab === CURRENT_SEASON;

                  const grouped = {};
                  editForm.teams.forEach((t) => {
                    const s = t.season || "Unknown";
                    if (!grouped[s]) grouped[s] = [];
                    grouped[s].push(t);
                  });
                  const seasonKeys = [...new Set([CURRENT_SEASON, ...Object.keys(grouped)])].sort().reverse();
                  const seasonTeams = editForm.teams.filter((t) => t.season === editSeasonTab);

                  function addSubTeam() {
                    const seasonFilteredTeams = teams.filter((tm) => tm.season === CURRENT_SEASON && !allTeamIds.includes(tm._id));
                    const first = seasonFilteredTeams[0];
                    setEditForm((prev) => ({
                      ...prev,
                      teams: [...prev.teams, { teamId: first?._id || "", season: CURRENT_SEASON }],
                      registrationTeamId: first?._id || prev.registrationTeamId,
                    }));
                    setEditSeasonTab(CURRENT_SEASON);
                  }

                  function addSquadTeam() {
                    setEditForm((prev) => ({
                      ...prev,
                      teams: [...prev.teams, { teamId: "", season: CURRENT_SEASON }],
                    }));
                    setEditSeasonTab(CURRENT_SEASON);
                  }

                  function setAsSubscriptionTeam(teamId) {
                    setEditForm((prev) => ({ ...prev, registrationTeamId: teamId }));
                  }

                  return (
                    <div className="border-t border-gray-200 pt-3">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Team Assignments</h4>
                      <div className="flex gap-1 border-b border-gray-200 mb-3">
                        {seasonKeys.map((s) => {
                          const count = (grouped[s] || []).length;
                          return (
                            <button key={s} type="button" onClick={() => setEditSeasonTab(s)}
                              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition -mb-px ${editSeasonTab === s ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                              {s} ({count})
                            </button>
                          );
                        })}
                      </div>

                      {isCurrent ? (
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-gray-700">Subscription Team</h4>
                              <button type="button" onClick={addSubTeam} className="text-xs text-green-600 hover:text-green-700 font-medium">+ Add Sub Team</button>
                            </div>
                            {seasonTeams.filter((t) => t.teamId && String(t.teamId) === String(regId)).length === 0 && (
                              <p className="text-xs text-gray-400 mb-2">No subscription team for this season.</p>
                            )}
                            {editForm.teams.map((t, idx) => {
                              if (t.season !== CURRENT_SEASON) return null;
                              const isSub = t.teamId && String(t.teamId) === String(regId);
                              if (!isSub) return null;
                              return (
                                <div key={idx} className="flex items-center gap-2 mb-2 bg-green-50/50 rounded-lg p-1">
                                  <select value={t.teamId} onChange={(e) => { updateTeamRow(idx, "teamId", e.target.value); setEditForm((prev) => ({ ...prev, registrationTeamId: e.target.value })); }}
                                    className="flex-1 px-3 py-2 border border-green-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500">
                                    <option value="">Select Team</option>
                                    {teams.filter((tm) => tm.season === CURRENT_SEASON).map((tm) => {
                                      const taken = allTeamIds.includes(tm._id) && tm._id !== t.teamId;
                                      return <option key={tm._id} value={tm._id} disabled={taken}>{tm.name}{taken ? " (already added)" : ""}</option>;
                                    })}
                                  </select>
                                  <button type="button" onClick={() => { removeTeamRow(idx); setEditForm((prev) => ({ ...prev, registrationTeamId: "" })); }} className="text-red-400 hover:text-red-600 transition p-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-gray-700">Squad Teams</h4>
                              <button type="button" onClick={addSquadTeam} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add Squad Team</button>
                            </div>
                            {editForm.teams.map((t, idx) => {
                              if (t.season !== CURRENT_SEASON) return null;
                              const isSub = t.teamId && String(t.teamId) === String(regId);
                              if (isSub) return null;
                              return (
                                <div key={idx} className="flex items-center gap-2 mb-2">
                                  <select value={t.teamId} onChange={(e) => updateTeamRow(idx, "teamId", e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Select Team</option>
                                    {teams.filter((tm) => tm.season === CURRENT_SEASON).map((tm) => {
                                      const taken = allTeamIds.includes(tm._id) && tm._id !== t.teamId;
                                      return <option key={tm._id} value={tm._id} disabled={taken}>{tm.name}{taken ? " (already added)" : ""}</option>;
                                    })}
                                  </select>
                                  {t.teamId && (
                                    <button type="button" onClick={() => setAsSubscriptionTeam(t.teamId)} title="Set as subscription team"
                                      className="text-green-500 hover:text-green-700 transition p-1 text-xs whitespace-nowrap border border-green-200 rounded px-1.5">Sub</button>
                                  )}
                                  <button type="button" onClick={() => removeTeamRow(idx)} className="text-red-400 hover:text-red-600 transition p-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div>
                          {seasonTeams.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-3">No teams for season {editSeasonTab}.</p>
                          ) : (
                            <div className="space-y-2">
                              {seasonTeams.map((t) => {
                                const team = teams.find((tm) => tm._id === t.teamId);
                                const isSub = t.teamId && String(t.teamId) === String(regId);
                                return (
                                  <div key={t.teamId || Math.random()} className={`rounded-lg p-3 flex items-center justify-between ${isSub ? "border border-green-200 bg-green-50/30" : "border border-gray-200 bg-gray-50/50"}`}>
                                    <div>
                                      <p className="font-medium text-gray-700 text-sm">{team?.name || t.teamId || "Unknown"}{isSub ? <span className="text-xs text-green-600 font-normal ml-1">(subscription)</span> : ""}</p>
                                    </div>
                                    <span className="text-xs text-gray-400">Read-only</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {formError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">{formError}</div>}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setEditing(false); setEditForm(null); setFormError(""); }} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={saveEdit} disabled={formLoading} className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
                    {formLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Players List */}
      {players.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Players Yet</h3>
          <p className="text-gray-500 mb-4">Upload a CSV or add players manually.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => fileInputRef.current?.click()} className="px-6 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition">Upload CSV</button>
            <button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition">+ Add Player</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Column picker */}
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">{filtered.length} player{filtered.length !== 1 ? "s" : ""}{search ? ` matching "${search}"` : ""}</span>
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
          </div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((player) => {
                  const p1 = player.parents?.[0];
                  const p2 = player.parents?.[1];
                  const regTeamId = player.registrationTeamId?._id || player.registrationTeamId;
                  return (
                    <tr key={player._id} onClick={() => openPlayer(player)} className="hover:bg-gray-50 transition cursor-pointer">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{player.firstName} {player.lastName}</span>
                          {player.gender && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${genderBadge(player.gender)}`}>{player.gender}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {player.dateOfBirth ? (
                          <><span className="text-xs">{new Date(player.dateOfBirth).toLocaleDateString()}</span> <span className="text-gray-400">({age(player.dateOfBirth)})</span></>
                        ) : "—"}
                      </td>
                      {visibleCols.has("position") && (
                        <td className="px-4 py-3 text-gray-700">
                          {player.primaryPosition ? (
                            <div>
                              <div className="text-xs">{player.primaryPosition}</div>
                              {player.secondaryPosition && <div className="text-xs text-gray-400">{player.secondaryPosition}</div>}
                            </div>
                          ) : "—"}
                        </td>
                      )}
                      {visibleCols.has("phone") && <td className="px-4 py-3 text-gray-700 text-xs">{player.phoneNumber || "—"}</td>}
                      {visibleCols.has("email") && <td className="px-4 py-3 text-gray-700 text-xs">{player.email || "—"}</td>}
                      <td className="px-4 py-3">
                        {p1 ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900">{p1.firstName} {p1.lastName}</div>
                            {p1.email && <div className="text-[10px] text-gray-400">{p1.email}</div>}
                            {p1.phone && <div className="text-[10px] text-gray-400">{p1.phonePrefix || ""}{p1.phone}</div>}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p2 ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900">{p2.firstName} {p2.lastName}</div>
                            {p2.email && <div className="text-[10px] text-gray-400">{p2.email}</div>}
                            {p2.phone && <div className="text-[10px] text-gray-400">{p2.phonePrefix || ""}{p2.phone}</div>}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const curr = player.teams.filter((t) => t.season === CURRENT_SEASON);
                          return curr.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {curr.map((t, i) => {
                                const tid = typeof t.teamId === "object" ? t.teamId?._id : t.teamId;
                                const isSub = regTeamId && String(tid) === String(regTeamId);
                                return <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSub ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{t.teamId?.name || "?"}{isSub ? " (sub)" : ""}</span>;
                              })}
                            </div>
                          ) : <span className="text-gray-400 text-xs">—</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const prev = player.teams.filter((t) => t.season === PREVIOUS_SEASON);
                          return prev.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {prev.map((t, i) => {
                                const tid = typeof t.teamId === "object" ? t.teamId?._id : t.teamId;
                                const isSub = regTeamId && String(tid) === String(regTeamId);
                                return <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSub ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{t.teamId?.name || "?"}{isSub ? " (sub)" : ""}</span>;
                              })}
                            </div>
                          ) : <span className="text-gray-400 text-xs">—</span>;
                        })()}
                      </td>
                      {visibleCols.has("school") && <td className="px-4 py-3 text-gray-700 text-xs">{player.school || "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  function renderPlayerFormFields(form, setForm, opts) {
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="First name" />
          <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Last name" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Email" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <input type="text" value={form.primaryPosition} onChange={(e) => setForm({ ...form, primaryPosition: e.target.value })} list="positions-list" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Primary position" />
            <datalist id="positions-list">
              {opts.positions.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="relative">
            <input type="text" value={form.secondaryPosition} onChange={(e) => setForm({ ...form, secondaryPosition: e.target.value })} list="positions-list" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Secondary position" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <input type="text" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} list="schools-list" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="School" />
            <datalist id="schools-list">
              {opts.schools.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <input type="tel" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Phone number" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-gray-400 self-center">Join date</span>
        </div>
        <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Street address" />
        <div className="grid grid-cols-3 gap-2">
          <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="City" />
          <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">State</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="text" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" placeholder="ZIP" maxLength={10} />
        </div>
      </>
    );
  }
}
