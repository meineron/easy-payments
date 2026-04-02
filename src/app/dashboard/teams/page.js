"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const EMPTY_TEAM = { name: "", season: "26/27", gender: "Male", teamType: "" };

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState({ byTeam: {}, global: { totalPlayers: 0, committedPlayers: 0 } });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);

  const [batchTeams, setBatchTeams] = useState([{ ...EMPTY_TEAM }]);
  const [editFormData, setEditFormData] = useState({ ...EMPTY_TEAM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [filterType, setFilterType] = useState("all");
  const [filterGender, setFilterGender] = useState("all");
  const [filterSeason, setFilterSeason] = useState("all");

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [teamsRes, statsRes] = await Promise.all([
        fetch("/api/teams"),
        fetch("/api/teams/stats"),
      ]);
      const teamsData = await teamsRes.json();
      const statsData = await statsRes.json();
      if (teamsRes.ok) setTeams(teamsData.teams);
      if (statsRes.ok) setStats(statsData);
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingTeam(null);
    setBatchTeams([{ ...EMPTY_TEAM }]);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(team) {
    setEditingTeam(team);
    setEditFormData({
      name: team.name,
      season: team.season,
      gender: team.gender || "Male",
      teamType: team.teamType || "",
    });
    setFormError("");
    setShowForm(true);
  }

  function updateBatchTeam(index, field, value) {
    setBatchTeams((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addBatchRow() {
    setBatchTeams((prev) => [...prev, { ...EMPTY_TEAM }]);
  }

  function removeBatchRow(index) {
    if (batchTeams.length <= 1) return;
    setBatchTeams((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);

    try {
      if (editingTeam) {
        const res = await fetch(`/api/teams/${editingTeam._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editFormData),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || "Failed to update team");
          setFormLoading(false);
          return;
        }
      } else {
        const res = await fetch("/api/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teams: batchTeams }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || "Failed to create teams");
          setFormLoading(false);
          return;
        }
      }

      setShowForm(false);
      setEditingTeam(null);
      fetchAll();
    } catch {
      setFormError("Something went wrong");
    } finally {
      setFormLoading(false);
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
      formData.append("season", "26/27");

      const res = await fetch("/api/teams/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setUploadResult({ success: false, message: data.error, errors: data.errors });
      } else {
        setUploadResult({
          success: true,
          message: `${data.created} team${data.created !== 1 ? "s" : ""} imported successfully!`,
          errors: data.errors,
        });
        fetchAll();
      }
    } catch {
      setUploadResult({ success: false, message: "Failed to upload file" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(teamId) {
    if (!confirm("Are you sure you want to delete this team?")) return;

    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (res.ok) fetchAll();
    } catch (err) {
      console.error("Failed to delete team:", err);
    }
  }

  function genderBadge(gender) {
    return gender === "Female"
      ? "bg-pink-50 text-pink-700"
      : "bg-blue-50 text-blue-700";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading teams...</p>
      </div>
    );
  }

  const allSeasons = [...new Set(teams.map((t) => t.season))].sort().reverse();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Teams</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload Excel"}
          </button>
          <button
            onClick={openCreateForm}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Add Teams
          </button>
        </div>
      </div>

      {/* Filters */}
      {teams.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          >
            <option value="all">All Types</option>
            {[...new Set(teams.map((t) => t.teamType || "Other"))].sort((a, b) => {
              if (a === "Other") return 1;
              if (b === "Other") return -1;
              return a.localeCompare(b);
            }).map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={filterSeason}
            onChange={(e) => setFilterSeason(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          >
            <option value="all">All Seasons</option>
            {allSeasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          >
            <option value="all">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          {(filterType !== "all" || filterGender !== "all" || filterSeason !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterGender("all"); setFilterSeason("all"); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Upload Result Banner */}
      {uploadResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${
          uploadResult.success
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-red-50 border-red-200 text-red-700"
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
              {uploadResult.errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingTeam ? "Edit Team" : "Add Teams"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {editingTeam ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
                    <input
                      type="text"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder="e.g. U12 Male"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team Type</label>
                    <input
                      type="text"
                      value={editFormData.teamType}
                      onChange={(e) => setEditFormData({ ...editFormData, teamType: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder="e.g. MLSNEXT, APEX"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                      <select
                        value={editFormData.season}
                        onChange={(e) => setEditFormData({ ...editFormData, season: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      >
                        {allSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
                        {!allSeasons.includes(editFormData.season) && (
                          <option value={editFormData.season}>{editFormData.season}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                      <select
                        value={editFormData.gender}
                        onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {batchTeams.map((t, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4 relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-gray-500">Team {index + 1}</span>
                        {batchTeams.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeBatchRow(index)}
                            className="text-red-400 hover:text-red-600 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={t.name}
                            onChange={(e) => updateBatchTeam(index, "name", e.target.value)}
                            required
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                            placeholder="Team name (e.g. U12 Male)"
                          />
                          <input
                            type="text"
                            value={t.teamType}
                            onChange={(e) => updateBatchTeam(index, "teamType", e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                            placeholder="Type (e.g. MLSNEXT)"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={t.season}
                            onChange={(e) => updateBatchTeam(index, "season", e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                          >
                            {allSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
                            {!allSeasons.includes("26/27") && <option value="26/27">26/27</option>}
                            {!allSeasons.includes("25/26") && <option value="25/26">25/26</option>}
                          </select>
                          <select
                            value={t.gender}
                            onChange={(e) => updateBatchTeam(index, "gender", e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addBatchRow}
                    className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 font-medium hover:border-blue-400 hover:text-blue-600 transition"
                  >
                    + Add Another Team
                  </button>
                </div>
              )}

              {formError && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingTeam(null); }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {formLoading
                    ? "Saving..."
                    : editingTeam
                    ? "Update"
                    : batchTeams.length === 1
                    ? "Create Team"
                    : `Create ${batchTeams.length} Teams`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Teams List */}
      {teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Teams Yet</h3>
          <p className="text-gray-500 mb-4">Create teams manually or upload an Excel file.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Upload Excel
            </button>
            <button
              onClick={openCreateForm}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              + Add Teams
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const filtered = teams.filter((team) => {
              if (filterType !== "all" && (team.teamType || "Other") !== filterType) return false;
              if (filterGender !== "all" && team.gender !== filterGender) return false;
              if (filterSeason !== "all" && team.season !== filterSeason) return false;
              return true;
            });
            const grouped = {};
            filtered.forEach((team) => {
              const type = team.teamType || "Other";
              if (!grouped[type]) grouped[type] = [];
              grouped[type].push(team);
            });
            const typeNames = Object.keys(grouped).sort((a, b) => {
              if (a === "Other") return 1;
              if (b === "Other") return -1;
              return a.localeCompare(b);
            });

            return typeNames.map((typeName) => (
              <div key={typeName}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{typeName}</h3>
                  <span className="text-xs text-gray-400 font-medium">({grouped[typeName].length})</span>
                </div>
                <div className="space-y-3">
                  {grouped[typeName].map((team) => {
                    const ts = stats.byTeam[team._id] || { teamMembers: 0, totalPlayers: 0 };

                    return (
                      <div key={team._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-5">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900">{team.name}</h3>
                                {team.gender && (
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${genderBadge(team.gender)}`}>
                                    {team.gender}
                                  </span>
                                )}
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                  Season {team.season}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                                  {ts.teamMembers} member{ts.teamMembers !== 1 ? "s" : ""}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/dashboard/teams/${team._id}`}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                              >
                                Players
                              </Link>
                              <button onClick={() => openEditForm(team)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">
                                Edit
                              </button>
                              <button onClick={() => handleDelete(team._id)} className="px-3 py-1.5 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
