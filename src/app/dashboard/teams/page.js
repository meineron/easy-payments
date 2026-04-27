import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useIntl } from "react-intl";

const EMPTY_TEAM = { name: "", season: "26/27", gender: "Male", teamType: "" };

const LAST_TEAM_IMPORT_STORAGE_KEY = "teamsLastImportIds";
const LAST_IMPORT_TTL_MS = 48 * 60 * 60 * 1000;

function readLastImportIdsFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(LAST_TEAM_IMPORT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.ids) || typeof parsed.savedAt !== "number") return [];
    if (Date.now() - parsed.savedAt > LAST_IMPORT_TTL_MS) {
      sessionStorage.removeItem(LAST_TEAM_IMPORT_STORAGE_KEY);
      return [];
    }
    return parsed.ids.filter((id) => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function writeLastImportIdsToStorage(ids) {
  if (typeof window === "undefined" || !ids.length) return;
  sessionStorage.setItem(
    LAST_TEAM_IMPORT_STORAGE_KEY,
    JSON.stringify({ ids, savedAt: Date.now() }),
  );
}

function clearLastImportIdsFromStorage() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LAST_TEAM_IMPORT_STORAGE_KEY);
}

export default function TeamsPage() {
  const intl = useIntl();
  const t = (id, values) => intl.formatMessage({ id: `payments.teams.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
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
  const [lastImportTeamIds, setLastImportTeamIds] = useState([]);
  const [undoLoading, setUndoLoading] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState(() => new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const fileInputRef = useRef(null);
  const selectAllCheckboxRef = useRef(null);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    const ids = readLastImportIdsFromStorage();
    if (ids.length) setLastImportTeamIds(ids);
  }, []);

  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      if (filterType !== "all" && (team.teamType || "Other") !== filterType) return false;
      if (filterGender !== "all" && team.gender !== filterGender) return false;
      if (filterSeason !== "all" && team.season !== filterSeason) return false;
      return true;
    });
  }, [teams, filterType, filterGender, filterSeason]);

  const allFilteredSelected =
    filteredTeams.length > 0 &&
    filteredTeams.every((t) => selectedTeamIds.has(String(t._id)));
  const someFilteredSelected =
    filteredTeams.some((t) => selectedTeamIds.has(String(t._id))) && !allFilteredSelected;

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someFilteredSelected;
  }, [someFilteredSelected]);

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
          setFormError(data.error || tc("failedToSave"));
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
          setFormError(data.error || t("failedToCreate"));
          setFormLoading(false);
          return;
        }
      }

      setShowForm(false);
      setEditingTeam(null);
      fetchAll();
    } catch {
      setFormError(tc("somethingWentWrong"));
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
        const newIds = (data.teams || []).map((team) => String(team._id)).filter(Boolean);
        if (newIds.length) {
          writeLastImportIdsToStorage(newIds);
          setLastImportTeamIds(newIds);
        }
        setUploadResult({
          success: true,
          message: t("importSuccess", { count: data.created }),
          errors: data.errors,
        });
        fetchAll();
      }
    } catch {
      setUploadResult({ success: false, message: t("failedToUpload") });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(teamId) {
    if (!confirm(t("deleteConfirm"))) return;

    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedTeamIds((prev) => {
          const next = new Set(prev);
          next.delete(String(teamId));
          return next;
        });
        fetchAll();
      }
    } catch (err) {
      console.error("Failed to delete team:", err);
    }
  }

  async function postBulkDelete(teamIds) {
    const res = await fetch("/api/teams/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds }),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  }

  function bulkDeleteResultMessage(data) {
    let message = t("lastImportUndoResult", { deleted: data.deleted ?? 0 });
    if (data.skipped?.length) {
      message = `${message} ${t("lastImportUndoSkipped", { count: data.skipped.length })}`;
    }
    return message;
  }

  function toggleSelectAllFiltered() {
    const ids = filteredTeams.map((t) => String(t._id));
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allOn) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleTeamSelected(teamId) {
    const id = String(teamId);
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearTeamSelection() {
    setSelectedTeamIds(new Set());
  }

  async function handleBulkDeleteSelected() {
    const ids = [...selectedTeamIds];
    if (ids.length === 0) return;
    if (!confirm(t("bulkDeleteSelectedConfirm", { count: ids.length }))) return;

    setBulkDeleteLoading(true);
    try {
      const { ok, data } = await postBulkDelete(ids);
      if (!ok) {
        setUploadResult({ success: false, message: data.error || tc("somethingWentWrong") });
        return;
      }
      setUploadResult({ success: true, message: bulkDeleteResultMessage(data) });
      if (data.skipped?.length) {
        const skippedSet = new Set(data.skipped.map((s) => String(s.teamId)));
        setSelectedTeamIds((prev) => {
          const next = new Set();
          prev.forEach((id) => {
            if (skippedSet.has(id)) next.add(id);
          });
          return next;
        });
      } else {
        setSelectedTeamIds(new Set());
      }
      fetchAll();
    } catch {
      setUploadResult({ success: false, message: tc("somethingWentWrong") });
    } finally {
      setBulkDeleteLoading(false);
    }
  }

  function dismissLastImportHint() {
    clearLastImportIdsFromStorage();
    setLastImportTeamIds([]);
  }

  async function handleUndoLastImport() {
    if (!lastImportTeamIds.length) return;
    if (!confirm(t("lastImportUndoConfirm", { count: lastImportTeamIds.length }))) return;

    setUndoLoading(true);
    try {
      const { ok, data } = await postBulkDelete(lastImportTeamIds);
      if (!ok) {
        setUploadResult({ success: false, message: data.error || tc("somethingWentWrong") });
        return;
      }
      setUploadResult({ success: true, message: bulkDeleteResultMessage(data) });
      dismissLastImportHint();
      fetchAll();
    } catch {
      setUploadResult({ success: false, message: tc("somethingWentWrong") });
    } finally {
      setUndoLoading(false);
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
        <p className="text-gray-500">{t("loadingTeams")}</p>
      </div>
    );
  }

  const allSeasons = [...new Set(teams.map((team) => team.season))].sort().reverse();

  return (
    <div className="max-w-5xl mx-auto text-start">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">{t("title")}</h2>
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
            {uploading ? t("uploading") : t("uploadExcel")}
          </button>
          <button
            onClick={openCreateForm}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            {t("addTeam")}
          </button>
        </div>
      </div>

      {/* Filters */}
      {teams.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label
            className={`flex items-center gap-2 text-sm shrink-0 ${
              filteredTeams.length === 0 ? "opacity-50 pointer-events-none text-gray-400" : "text-gray-700 cursor-pointer"
            }`}
          >
            <input
              ref={selectAllCheckboxRef}
              type="checkbox"
              checked={allFilteredSelected}
              disabled={filteredTeams.length === 0}
              onChange={toggleSelectAllFiltered}
              className="rounded border-gray-300"
            />
            <span className="whitespace-nowrap">{t("bulkSelectVisible")}</span>
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          >
            <option value="all">{t("allTypes")}</option>
            {[...new Set(teams.map((team) => team.teamType || "Other"))].sort((a, b) => {
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
            <option value="all">{t("allSeasons")}</option>
            {allSeasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          >
            <option value="all">{t("allGenders")}</option>
            <option value="Male">{t("male")}</option>
            <option value="Female">{t("female")}</option>
          </select>
          {(filterType !== "all" || filterGender !== "all" || filterSeason !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterGender("all"); setFilterSeason("all"); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition underline"
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {selectedTeamIds.size > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 text-sm">
          <span className="font-medium text-gray-900">
            {t("bulkSelectedCount", { count: selectedTeamIds.size })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearTeamSelection}
              disabled={bulkDeleteLoading}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-blue-300 text-blue-900 hover:bg-white/80 transition disabled:opacity-50"
            >
              {t("bulkClearSelection")}
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteSelected}
              disabled={bulkDeleteLoading}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {bulkDeleteLoading ? t("bulkDeleting") : t("bulkDeleteSelected")}
            </button>
          </div>
        </div>
      )}

      {lastImportTeamIds.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">
            {t("lastImportUndoHint", { count: lastImportTeamIds.length })}
          </p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleUndoLastImport}
              disabled={undoLoading}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-800 text-white hover:bg-amber-900 transition disabled:opacity-50"
            >
              {undoLoading ? tc("saving") : t("lastImportUndoButton")}
            </button>
            <button
              type="button"
              onClick={dismissLastImportHint}
              disabled={undoLoading}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-300 text-amber-900 hover:bg-amber-100/80 transition disabled:opacity-50"
            >
              {t("lastImportUndoDismiss")}
            </button>
          </div>
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
            <button type="button" onClick={() => setUploadResult(null)} className="text-current opacity-50 hover:opacity-100">
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
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto text-start">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingTeam ? t("editTeam") : t("addTeamTitle")}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {editingTeam ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("teamName")}</label>
                    <input
                      type="text"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder={t("editNamePlaceholder")}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("teamType")}</label>
                    <input
                      type="text"
                      value={editFormData.teamType}
                      onChange={(e) => setEditFormData({ ...editFormData, teamType: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder={t("editTypePlaceholder")}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("season")}</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("gender")}</label>
                      <select
                        value={editFormData.gender}
                        onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      >
                        <option value="Male">{t("male")}</option>
                        <option value="Female">{t("female")}</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {batchTeams.map((row, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4 relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-gray-500">{t("teamRowLabel", { index: index + 1 })}</span>
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
                            value={row.name}
                            onChange={(e) => updateBatchTeam(index, "name", e.target.value)}
                            required
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                            placeholder={t("placeholderTeamName")}
                          />
                          <input
                            type="text"
                            value={row.teamType}
                            onChange={(e) => updateBatchTeam(index, "teamType", e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                            placeholder={t("placeholderTeamType")}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={row.season}
                            onChange={(e) => updateBatchTeam(index, "season", e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                          >
                            {allSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
                            {!allSeasons.includes("26/27") && <option value="26/27">26/27</option>}
                            {!allSeasons.includes("25/26") && <option value="25/26">25/26</option>}
                          </select>
                          <select
                            value={row.gender}
                            onChange={(e) => updateBatchTeam(index, "gender", e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm"
                          >
                            <option value="Male">{t("male")}</option>
                            <option value="Female">{t("female")}</option>
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
                    {t("addAnotherTeam")}
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
                  {tc("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {formLoading
                    ? tc("saving")
                    : editingTeam
                    ? t("updateTeam")
                    : batchTeams.length === 1
                    ? t("createTeam")
                    : t("createTeamsCount", { count: batchTeams.length })}
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
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("noTeams")}</h3>
          <p className="text-gray-500 mb-4">{t("noTeamsDesc")}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t("uploadExcel")}
            </button>
            <button
              onClick={openCreateForm}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              {t("addTeam")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const grouped = {};
            filteredTeams.forEach((team) => {
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
                    const tid = String(team._id);

                    return (
                      <div key={team._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-3">
                            <label className="flex items-start gap-3 min-w-0 cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={selectedTeamIds.has(tid)}
                                onChange={() => toggleTeamSelected(tid)}
                                className="mt-1 rounded border-gray-300"
                              />
                            </label>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900">{team.name}</h3>
                                {team.gender && (
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${genderBadge(team.gender)}`}>
                                    {team.gender}
                                  </span>
                                )}
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                  {t("seasonBadge", { season: team.season })}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                                  {t("membersBadge", { count: ts.teamMembers })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                              <Link
                                href={`/dashboard/teams/${team._id}`}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                              >
                                {t("players")}
                              </Link>
                              <button type="button" onClick={() => openEditForm(team)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition">
                                {tc("edit")}
                              </button>
                              <button type="button" onClick={() => handleDelete(team._id)} className="px-3 py-1.5 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">
                                {tc("delete")}
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
