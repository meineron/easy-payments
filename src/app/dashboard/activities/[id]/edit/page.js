"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import InvitationTemplateEditor from "@/components/InvitationTemplateEditor";
import {
  getDefaultInvitationEmailHtml,
  getDefaultInvitationSms,
  getDefaultInvitationSubject,
} from "@/lib/registration-invitation";

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "success" ? "bg-green-600" : type === "error" ? "bg-red-600" : "bg-blue-600";
  return (
    <div className={`fixed top-4 end-4 z-[100] ${bg} text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-3`}>
      {type === "success" && <span>&#10003;</span>}
      {type === "error" && <span>&#10007;</span>}
      {message}
      <button onClick={onClose} className="ms-2 opacity-70 hover:opacity-100">×</button>
    </div>
  );
}

const ACTIVITY_TYPES = ["Season Registration", "Tryout", "Camp"];
const months = Array.from({ length: 12 }, (_, i) => i + 1);
const days = Array.from({ length: 31 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - 2 + i);

function parseDateParts(d) {
  if (!d) return { m: "", d: "", y: "" };
  const dt = new Date(d);
  return { m: String(dt.getMonth() + 1), d: String(dt.getDate()), y: String(dt.getFullYear()) };
}
function buildDate(m, d, y) {
  if (!m || !d || !y) return null;
  return new Date(Number(y), Number(m) - 1, Number(d));
}
function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }
function displayToCents(v) { return Math.round(parseFloat(v || 0) * 100); }

function PriceInput({ value, onChange, className = "", placeholder = "0.00" }) {
  const [text, setText] = useState(() => { const n = (value || 0) / 100; return n === 0 ? "" : String(n); });
  const [focused, setFocused] = useState(false);
  const lastCents = useRef(value);

  useEffect(() => {
    if (!focused && value !== lastCents.current) {
      lastCents.current = value;
      const n = (value || 0) / 100;
      setText(n === 0 ? "" : String(n));
    }
  }, [value, focused]);

  function handleChange(e) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
      setText(v);
      const cents = Math.round(parseFloat(v || 0) * 100);
      lastCents.current = cents;
      onChange(cents);
    }
  }

  function handleBlur() {
    setFocused(false);
    if (text === "") { onChange(0); return; }
    const n = parseFloat(text);
    if (isNaN(n)) { setText(""); onChange(0); return; }
    const cents = Math.round(n * 100);
    lastCents.current = cents;
    onChange(cents);
  }

  return <input type="text" inputMode="decimal" value={text} onChange={handleChange}
    onFocus={() => setFocused(true)} onBlur={handleBlur}
    placeholder={placeholder} className={className} />;
}

/* ============== TAB 1: Activity Details ============== */
function TabDetails({ activity, onSave, saving, t, tc, td }) {
  const [form, setForm] = useState({
    title: "", description: "", type: "Season Registration", season: "",
    hasPayment: false, coverImage: "",
    status: "draft", registrationType: "public", hiddenLink: false,
  });
  const [startParts, setStartParts] = useState({ m: "", d: "", y: "" });
  const [endParts, setEndParts] = useState({ m: "", d: "", y: "" });
  const [lastRegParts, setLastRegParts] = useState({ m: "", d: "", y: "" });
  const [seasons, setSeasons] = useState([]);

  useEffect(() => {
    if (activity) {
      setForm({
        title: activity.title || "", description: activity.description || "",
        type: activity.type || "Season Registration", season: activity.season || "",
        hasPayment: !!activity.hasPayment, coverImage: activity.coverImage || "",
        status: activity.status || "draft", registrationType: activity.registrationType || "public",
        hiddenLink: !!activity.hiddenLink,
      });
      setStartParts(parseDateParts(activity.startDate));
      setEndParts(parseDateParts(activity.endDate));
      setLastRegParts(parseDateParts(activity.lastRegisterDate));
    }
  }, [activity]);

  useEffect(() => {
    fetch("/api/teams").then((r) => r.json()).then((d) => {
      const fromTeams = (d.teams || []).map((t) => t.season);
      setSeasons([...new Set(["26/27", "25/26", ...fromTeams])].sort().reverse());
    }).catch(() => {});
  }, []);

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((p) => ({ ...p, coverImage: reader.result }));
    reader.readAsDataURL(file);
  }

  function save() {
    onSave({
      ...form,
      startDate: buildDate(startParts.m, startParts.d, startParts.y),
      endDate: buildDate(endParts.m, endParts.d, endParts.y),
      lastRegisterDate: buildDate(lastRegParts.m, lastRegParts.d, lastRegParts.y),
    });
  }

  function DateDropdown({ label, parts, setParts }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="flex gap-2">
          <select value={parts.m} onChange={(e) => setParts((p) => ({ ...p, m: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-20">
            <option value="">MM</option>
            {months.map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
          </select>
          <select value={parts.d} onChange={(e) => setParts((p) => ({ ...p, d: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-20">
            <option value="">DD</option>
            {days.map((d) => <option key={d} value={d}>{String(d).padStart(2, "0")}</option>)}
          </select>
          <select value={parts.y} onChange={(e) => setParts((p) => ({ ...p, y: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-24">
            <option value="">YYYY</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("titleLabel")}</label>
        <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{td("coverImage")}</label>
        {form.coverImage && <img src={form.coverImage} alt="Cover" className="w-48 h-28 object-cover rounded-lg mb-2" />}
        <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{td("description")}</label>
        <div contentEditable suppressContentEditableWarning className="w-full border rounded-lg px-3 py-2 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          dangerouslySetInnerHTML={{ __html: form.description }} onBlur={(e) => setForm((p) => ({ ...p, description: e.target.innerHTML }))} />
        <p className="text-xs text-gray-400 mt-1">{td("descriptionHint")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{td("type")}</label>
          <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
            {ACTIVITY_TYPES.map((at) => <option key={at} value={at}>{at}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("season")}</label>
          <select value={form.season} onChange={(e) => setForm((p) => ({ ...p, season: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">No season</option>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            {form.season && !seasons.includes(form.season) && <option value={form.season}>{form.season}</option>}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">{td("hasPayment")}</label>
        <button type="button" onClick={() => setForm((p) => ({ ...p, hasPayment: !p.hasPayment }))}
          className={`relative w-11 h-6 rounded-full transition ${form.hasPayment ? "bg-blue-600" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.hasPayment ? "translate-x-5" : ""}`} />
        </button>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm">{td("publishingSettings")}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tc("status")}</label>
            <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="draft">{t("draft")}</option><option value="published">{t("published")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{td("registrationType")}</label>
            <select value={form.registrationType} onChange={(e) => setForm((p) => ({ ...p, registrationType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="public">{td("publicRegistration")}</option><option value="login">{td("loginRegistration")}</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.hiddenLink} onChange={(e) => setForm((p) => ({ ...p, hiddenLink: e.target.checked }))} className="rounded" />
          {td("hiddenLink")}
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <DateDropdown label={t("startDate")} parts={startParts} setParts={setStartParts} />
        <DateDropdown label={td("endDate")} parts={endParts} setParts={setEndParts} />
        <DateDropdown label={td("lastDateToRegister")} parts={lastRegParts} setParts={setLastRegParts} />
      </div>
      <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? tc("saving") : td("saveDetails")}
      </button>
    </div>
  );
}

/* ============== TAB 2: Teams ============== */
function TabTeams({ activity, onSave, saving, tc, td }) {
  const [settings, setSettings] = useState({ onlyAssignedPlayers: false, playerAssignment: "manual" });
  const [teams, setTeams] = useState([]);
  const [clubTeams, setClubTeams] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTeamMode, setNewTeamMode] = useState("existing");
  const [selectedExistingTeams, setSelectedExistingTeams] = useState([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamSeason, setNewTeamSeason] = useState("");
  const [newTeamGender, setNewTeamGender] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [teamActivityMap, setTeamActivityMap] = useState({});

  useEffect(() => {
    if (activity) {
      setSettings({ onlyAssignedPlayers: !!activity.onlyAssignedPlayers, playerAssignment: activity.playerAssignment || "manual" });
      setTeams((activity.teams || []).map((t) => ({
        teamId: t.teamId?._id || t.teamId, teamName: t.teamId?.name || "Unknown",
        teamSeason: t.teamId?.season || "", teamGender: t.teamId?.gender || "",
        playerLimit: t.playerLimit ?? "", ageLimitType: t.ageLimitType || "none",
        ageLimitYobMin: t.ageLimitYobMin ?? "", ageLimitYobMax: t.ageLimitYobMax ?? "",
        ageLimitDateMin: t.ageLimitDateMin || "", ageLimitDateMax: t.ageLimitDateMax || "",
        serialNumber: t.serialNumber || "",
      })));
    }
  }, [activity]);

  useEffect(() => {
    fetch("/api/teams").then((r) => r.json()).then((d) => setClubTeams(d.teams || [])).catch(() => {});
    fetch("/api/activities").then((r) => r.json()).then((d) => {
      const map = {};
      (d.activities || []).forEach((a) => {
        if (a._id === activity?._id) return;
        (a.teams || []).forEach((t) => { const tid = t.teamId?._id || t.teamId; if (tid) map[tid] = a.title; });
      });
      setTeamActivityMap(map);
    }).catch(() => {});
  }, [activity?._id]);

  function addExistingTeams() {
    if (selectedExistingTeams.length === 0) return;
    const newEntries = selectedExistingTeams.filter((id) => !teams.some((t) => t.teamId === id)).map((id) => {
      const ct = clubTeams.find((t) => t._id === id); if (!ct) return null;
      return { teamId: ct._id, teamName: ct.name, teamSeason: ct.season, teamGender: ct.gender,
        playerLimit: "", ageLimitType: "none", ageLimitYobMin: "", ageLimitYobMax: "",
        ageLimitDateMin: "", ageLimitDateMax: "", serialNumber: "" };
    }).filter(Boolean);
    if (newEntries.length === 0) { alert("Selected teams are already added"); return; }
    setTeams((prev) => [...prev, ...newEntries]);
    setSelectedExistingTeams([]); setShowAddModal(false);
  }
  function toggleExistingTeamSelection(teamId) {
    setSelectedExistingTeams((prev) => prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]);
  }
  async function createAndAddTeam() {
    if (!newTeamName.trim()) return;
    try {
      const res = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim(), season: newTeamSeason, gender: newTeamGender }) });
      const data = await res.json(); const newTeam = data.teams?.[0] || data.team;
      if (newTeam) {
        setClubTeams((prev) => [...prev, newTeam]);
        setTeams((prev) => [...prev, { teamId: newTeam._id, teamName: newTeam.name, teamSeason: newTeam.season || "", teamGender: newTeam.gender || "",
          playerLimit: "", ageLimitType: "none", ageLimitYobMin: "", ageLimitYobMax: "",
          ageLimitDateMin: "", ageLimitDateMax: "", serialNumber: "" }]);
        setNewTeamName(""); setNewTeamSeason(""); setNewTeamGender(""); setShowAddModal(false);
      }
    } catch { alert("Failed to create team"); }
  }
  function removeTeam(idx) { setTeams((prev) => prev.filter((_, i) => i !== idx)); }
  function updateTeam(idx, field, value) { setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))); }

  function save() {
    const teamsPayload = teams.map((t) => ({
      teamId: t.teamId, playerLimit: t.playerLimit ? Number(t.playerLimit) : null,
      ageLimitType: t.ageLimitType, ageLimitYobMin: t.ageLimitYobMin ? Number(t.ageLimitYobMin) : null,
      ageLimitYobMax: t.ageLimitYobMax ? Number(t.ageLimitYobMax) : null,
      ageLimitDateMin: t.ageLimitDateMin || null, ageLimitDateMax: t.ageLimitDateMax || null,
      serialNumber: t.serialNumber || "",
    }));
    onSave({ ...settings, teams: teamsPayload });
  }

  const addedTeamIds = new Set(teams.map((t) => t.teamId));
  const allAvailableTeams = clubTeams.filter((t) => !addedTeamIds.has(t._id));
  const availableSeasons = [...new Set(allAvailableTeams.map((t) => t.season).filter(Boolean))].sort().reverse();
  const availableTeams = seasonFilter ? allAvailableTeams.filter((t) => t.season === seasonFilter) : allAvailableTeams;

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-gray-900">{td("playerAssignmentSettings")}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.onlyAssignedPlayers} onChange={(e) => setSettings((p) => ({ ...p, onlyAssignedPlayers: e.target.checked }))} className="rounded" />
          {td("onlyAssignedPlayers")}
        </label>
        {!settings.onlyAssignedPlayers && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{td("playerAssignment")}</label>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              {[{ v: "auto", l: td("assignAutomatically") }, { v: "after_paid", l: td("afterFullyPaid") }, { v: "manual", l: td("dontAssignAutomatically") }].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="playerAssignment" value={v} checked={settings.playerAssignment === v}
                    onChange={() => setSettings((p) => ({ ...p, playerAssignment: v }))} />{l}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{td("teamsCount", { count: teams.length })}</h3>
          <button onClick={() => { setShowAddModal(true); setSeasonFilter(""); setSelectedExistingTeams([]); }}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">{td("addTeam")}</button>
        </div>
        {teams.length === 0 ? <p className="text-gray-400 text-sm p-4 bg-gray-50 rounded text-center">{td("noTeamsAddedYet")}</p> : (
          <div className="space-y-3">
            {teams.map((teamRow, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div><span className="font-medium text-gray-900">{teamRow.teamName}</span><span className="text-xs text-gray-500 ms-2">{teamRow.teamSeason} · {teamRow.teamGender}</span></div>
                  <button onClick={() => removeTeam(idx)} className="text-red-500 text-xs hover:text-red-700">{tc("remove")}</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="block text-xs text-gray-500 mb-1">{td("playerLimit")}</label>
                    <input type="number" value={teamRow.playerLimit} onChange={(e) => updateTeam(idx, "playerLimit", e.target.value)} placeholder={td("noLimit")} className="w-full border rounded px-2 py-1 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">{td("ageLimit")}</label>
                    <select value={teamRow.ageLimitType} onChange={(e) => updateTeam(idx, "ageLimitType", e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
                      <option value="none">{td("none")}</option><option value="yob">{td("yearOfBirth")}</option><option value="range">{td("dateRange")}</option></select></div>
                  <div><label className="block text-xs text-gray-500 mb-1">{td("serialNumber")}</label>
                    <input value={teamRow.serialNumber} onChange={(e) => updateTeam(idx, "serialNumber", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
                </div>
                {teamRow.ageLimitType === "yob" && (<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div><label className="block text-xs text-gray-500 mb-1">{td("minYOB")}</label><input type="number" value={teamRow.ageLimitYobMin} onChange={(e) => updateTeam(idx, "ageLimitYobMin", e.target.value)} placeholder="e.g. 2010" className="w-full border rounded px-2 py-1 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">{td("maxYOB")}</label><input type="number" value={teamRow.ageLimitYobMax} onChange={(e) => updateTeam(idx, "ageLimitYobMax", e.target.value)} placeholder="e.g. 2012" className="w-full border rounded px-2 py-1 text-sm" /></div>
                </div>)}
                {teamRow.ageLimitType === "range" && (<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div><label className="block text-xs text-gray-500 mb-1">{td("minDate")}</label><input type="date" value={teamRow.ageLimitDateMin ? teamRow.ageLimitDateMin.slice(0, 10) : ""} onChange={(e) => updateTeam(idx, "ageLimitDateMin", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">{td("maxDate")}</label><input type="date" value={teamRow.ageLimitDateMax ? teamRow.ageLimitDateMax.slice(0, 10) : ""} onChange={(e) => updateTeam(idx, "ageLimitDateMax", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
                </div>)}
              </div>
            ))}
          </div>
        )}
      </div>
      <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? tc("saving") : td("saveTeams")}</button>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{td("addTeamTitle")}</h3>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setNewTeamMode("existing")} className={`px-3 py-1 rounded text-sm font-medium ${newTeamMode === "existing" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{td("fromExisting")}</button>
              <button onClick={() => setNewTeamMode("new")} className={`px-3 py-1 rounded text-sm font-medium ${newTeamMode === "new" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{td("createNew")}</button>
            </div>
            {newTeamMode === "existing" ? (
              <div className="space-y-3">
                <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">{td("allSeasons")}</option>
                  {availableSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {availableTeams.length === 0 ? <p className="text-sm text-gray-400 text-center py-2">{seasonFilter ? td("noTeamsAvailable") : td("allTeamsAlreadyAdded")}</p> : (
                  <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                    {availableTeams.map((teamItem) => {
                      const usedBy = teamActivityMap[teamItem._id]; const disabled = !!usedBy;
                      return (<label key={teamItem._id} className={`flex items-center gap-3 px-3 py-2 text-sm ${disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:bg-gray-50 cursor-pointer"}`}>
                        <input type="checkbox" checked={selectedExistingTeams.includes(teamItem._id)} onChange={() => !disabled && toggleExistingTeamSelection(teamItem._id)} disabled={disabled} className="rounded" />
                        <span className="flex-1"><span className="font-medium">{teamItem.name}</span><span className="text-xs text-gray-400 ms-2">{teamItem.season} · {teamItem.gender}</span>
                          {disabled && <span className="block text-xs text-orange-600 mt-0.5">{td("alreadyIn", { activity: usedBy })}</span>}</span>
                      </label>);
                    })}
                  </div>
                )}
                {selectedExistingTeams.length > 0 && <p className="text-xs text-blue-600">{selectedExistingTeams.length} selected</p>}
                <button onClick={addExistingTeams} disabled={selectedExistingTeams.length === 0}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {td("addTeamsButton", { count: selectedExistingTeams.length })}</button>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder={td("teamName")} className="w-full border rounded-lg px-3 py-2 text-sm" />
                <input value={newTeamSeason} onChange={(e) => setNewTeamSeason(e.target.value)} placeholder={td("seasonPlaceholder")} className="w-full border rounded-lg px-3 py-2 text-sm" />
                <select value={newTeamGender} onChange={(e) => setNewTeamGender(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">{td("gender")}</option><option value="Male">{td("male")}</option><option value="Female">{td("female")}</option>
                </select>
                <button onClick={createAndAddTeam} disabled={!newTeamName.trim()} className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{td("createAndAdd")}</button>
              </div>
            )}
            <button onClick={() => setShowAddModal(false)} className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700">{tc("cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============== TAB 3: Form Builder ============== */
const FIELD_TYPES = [
  { value: "input", label: "Input" }, { value: "textarea", label: "TextArea" },
  { value: "multichoice_checkbox", label: "Multi-Choice (Checkboxes)" }, { value: "radio", label: "Radio Choice" },
  { value: "dropdown_single", label: "Dropdown (Single)" }, { value: "dropdown_multi", label: "Dropdown (Multi)" },
  { value: "title_description", label: "Title / Description" }, { value: "phone", label: "Phone" },
  { value: "email", label: "Email" }, { value: "address", label: "Address" }, { value: "date", label: "Date" },
];

function TabForm({ activity, onSave, saving, tc, td }) {
  const [sections, setSections] = useState([]);
  const [editingField, setEditingField] = useState(null);
  const [fieldForm, setFieldForm] = useState({ key: "", type: "input", label: "", description: "", required: false, hidden: false, options: [] });
  const [newOptionText, setNewOptionText] = useState("");
  const [collapsedSections, setCollapsedSections] = useState({});

  useEffect(() => { if (activity?.formSections) setSections(JSON.parse(JSON.stringify(activity.formSections))); }, [activity]);

  function toggleCollapse(sIdx) { setCollapsedSections((p) => ({ ...p, [sIdx]: !p[sIdx] })); }
  function addSection() { const title = prompt(td("sectionTitle")); if (!title?.trim()) return; setSections((prev) => [...prev, { key: `custom_${Date.now()}`, title: title.trim(), order: prev.length, isDefault: false, fields: [] }]); }
  function removeSection(sIdx) { if (sections[sIdx].isDefault) return; if (!confirm(td("removeSection"))) return; setSections((prev) => prev.filter((_, i) => i !== sIdx)); }
  function openFieldEditor(sIdx, fIdx) {
    if (fIdx !== null) { const f = sections[sIdx].fields[fIdx]; setFieldForm({ key: f.key, type: f.type, label: f.label || "", description: f.description || "", required: !!f.required, hidden: !!f.hidden, options: [...(f.options || [])] }); }
    else { setFieldForm({ key: `field_${Date.now()}`, type: "input", label: "", description: "", required: false, hidden: false, options: [] }); }
    setEditingField({ sIdx, fIdx }); setNewOptionText("");
  }
  function saveField() {
    if (!editingField) return; const { sIdx, fIdx } = editingField;
    setSections((prev) => { const ns = JSON.parse(JSON.stringify(prev));
      const field = { ...fieldForm, isDefault: false, isMust: false, order: fIdx !== null ? ns[sIdx].fields[fIdx].order : ns[sIdx].fields.length };
      if (fIdx !== null) { const orig = ns[sIdx].fields[fIdx]; field.isDefault = orig.isDefault; field.isMust = orig.isMust; if (orig.isMust) { field.required = true; field.hidden = false; } ns[sIdx].fields[fIdx] = field; }
      else { ns[sIdx].fields.push(field); } return ns; });
    setEditingField(null);
  }
  function removeField(sIdx, fIdx) { if (sections[sIdx].fields[fIdx].isMust) return; setSections((prev) => { const ns = JSON.parse(JSON.stringify(prev)); ns[sIdx].fields.splice(fIdx, 1); return ns; }); }
  function toggleFieldHidden(sIdx, fIdx) { setSections((prev) => { const ns = JSON.parse(JSON.stringify(prev)); const f = ns[sIdx].fields[fIdx]; if (f.isMust) return prev; f.hidden = !f.hidden; return ns; }); }
  function toggleFieldRequired(sIdx, fIdx) { setSections((prev) => { const ns = JSON.parse(JSON.stringify(prev)); const f = ns[sIdx].fields[fIdx]; if (f.isMust) return prev; f.required = !f.required; return ns; }); }
  function moveField(sIdx, fIdx, dir) { const newIdx = fIdx + dir; if (newIdx < 0 || newIdx >= sections[sIdx].fields.length) return; setSections((prev) => { const ns = JSON.parse(JSON.stringify(prev)); const fields = ns[sIdx].fields; [fields[fIdx], fields[newIdx]] = [fields[newIdx], fields[fIdx]]; fields.forEach((f, i) => { f.order = i; }); return ns; }); }
  function addOption() { if (!newOptionText.trim()) return; setFieldForm((p) => ({ ...p, options: [...p.options, newOptionText.trim()] })); setNewOptionText(""); }
  function removeOption(idx) { setFieldForm((p) => ({ ...p, options: p.options.filter((_, i) => i !== idx) })); }
  function save() { sections.forEach((s, i) => { s.order = i; }); onSave({ formSections: sections }); }
  const hasChoiceOptions = ["multichoice_checkbox", "radio", "dropdown_single", "dropdown_multi"];

  return (
    <div className="space-y-6">
      {sections.map((section, sIdx) => (
        <div key={section.key} className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-t-lg cursor-pointer" onClick={() => toggleCollapse(sIdx)}>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">{collapsedSections[sIdx] ? "▶" : "▼"}</span>
              <h3 className="font-semibold text-gray-900">{section.title}</h3>
              {section.isDefault && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{td("default")}</span>}
              <span className="text-xs text-gray-400">({section.fields.length} {td("fields")})</span>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => openFieldEditor(sIdx, null)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">{td("addField")}</button>
              {!section.isDefault && <button onClick={() => removeSection(sIdx)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">{tc("remove")}</button>}
            </div>
          </div>
          {!collapsedSections[sIdx] && (
            <div className="p-4">
              {section.fields.length === 0 ? <p className="text-sm text-gray-400 text-center py-2">{td("noFieldsYet")}</p> : (
                <div className="space-y-2">
                  {section.fields.map((field, fIdx) => (
                    <div key={field.key} className={`flex items-center gap-3 px-3 py-2 rounded border text-sm ${field.hidden ? "bg-gray-50 opacity-60" : ""}`}>
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveField(sIdx, fIdx, -1)} disabled={fIdx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">▲</button>
                        <button onClick={() => moveField(sIdx, fIdx, 1)} disabled={fIdx === section.fields.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">▼</button>
                      </div>
                      <div className="flex-1">
                        <span className="font-medium" dangerouslySetInnerHTML={{ __html: field.label || "(no label)" }} />
                        <span className="text-xs text-gray-400 ms-2">{field.type}</span>
                        {field.isMust && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded ms-2">Must</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleFieldRequired(sIdx, fIdx)} className={`text-xs px-2 py-0.5 rounded ${field.required ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"} ${field.isMust ? "cursor-not-allowed" : ""}`} disabled={field.isMust}>{field.required ? tc("required") : tc("optional")}</button>
                        {!field.isMust && <button onClick={() => toggleFieldHidden(sIdx, fIdx)} className={`text-xs px-2 py-0.5 rounded ${field.hidden ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>{field.hidden ? td("hidden") : tc("visible")}</button>}
                        <button onClick={() => openFieldEditor(sIdx, fIdx)} className="text-xs text-blue-600 hover:text-blue-800">{tc("edit")}</button>
                        {!field.isMust && !field.isDefault && <button onClick={() => removeField(sIdx, fIdx)} className="text-xs text-red-500 hover:text-red-700">×</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <button onClick={addSection} className="text-sm text-blue-600 hover:text-blue-800 font-medium">{td("addSection")}</button>
      <div><button onClick={save} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? tc("saving") : td("saveForm")}</button></div>

      {editingField && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingField(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{editingField.fIdx !== null ? td("editField") : td("addField")}</h3>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{td("fieldType")}</label>
                <select value={fieldForm.type} onChange={(e) => setFieldForm((p) => ({ ...p, type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{td("label")}</label>
                <div contentEditable suppressContentEditableWarning className="w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dangerouslySetInnerHTML={{ __html: fieldForm.label }} onBlur={(e) => setFieldForm((p) => ({ ...p, label: e.target.innerHTML }))} />
                <p className="text-xs text-gray-400 mt-1">{td("labelHint")}</p></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{td("descriptionLabel")}</label>
                <div contentEditable suppressContentEditableWarning className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dangerouslySetInnerHTML={{ __html: fieldForm.description }} onBlur={(e) => setFieldForm((p) => ({ ...p, description: e.target.innerHTML }))} />
                <p className="text-xs text-gray-400 mt-1">{td("labelHint")}</p></div>
              {fieldForm.type !== "title_description" && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fieldForm.required} onChange={(e) => setFieldForm((p) => ({ ...p, required: e.target.checked }))} className="rounded" />{tc("required")}</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fieldForm.hidden} onChange={(e) => setFieldForm((p) => ({ ...p, hidden: e.target.checked }))} className="rounded" />{td("hidden")}</label>
                </div>
              )}
              {hasChoiceOptions.includes(fieldForm.type) && (
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
                  <div className="space-y-1 mb-2">{fieldForm.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2 text-sm"><span className="flex-1 px-2 py-1 bg-gray-50 rounded">{opt}</span><button onClick={() => removeOption(oIdx)} className="text-red-500 text-xs">×</button></div>
                  ))}</div>
                  <div className="flex gap-2"><input value={newOptionText} onChange={(e) => setNewOptionText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOption()} placeholder="Add option" className="flex-1 border rounded px-2 py-1 text-sm" />
                    <button onClick={addOption} className="text-sm text-blue-600 hover:text-blue-800">Add</button></div></div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveField} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">{editingField.fIdx !== null ? td("updateField") : td("addField")}</button>
              <button onClick={() => setEditingField(null)} className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">{tc("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============== TAB 4: Payment ============== */
function TabPayment({ activity, onSave, saving, t, tc, td }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [passStripeFee, setPassStripeFee] = useState(false);
  const [expandedSub, setExpandedSub] = useState(null);
  const [teamSearch, setTeamSearch] = useState("");

  const activityTeams = (activity?.teams || []).map((row, slotIndex) => ({
    slotIndex,
    teamId: row.teamId?._id || row.teamId || null,
    name: row.teamId?.name || "Unknown",
    season: row.teamId?.season || "",
  }));
  const assignableActivityTeams = activityTeams.filter((tm) => tm.teamId);

  const activityStartDate = activity?.startDate ? new Date(activity.startDate) : null;

  useEffect(() => {
    if (activity) {
      setSubscriptions(JSON.parse(JSON.stringify(activity.subscriptions || [])));
      setCoupons(JSON.parse(JSON.stringify(activity.coupons || [])));
      setPassStripeFee(!!activity.passStripeFeeToCustomer);
    }
  }, [activity]);

  function addSubscription() {
    const allTeamIds = assignableActivityTeams.map((tm) => tm.teamId);
    setSubscriptions((prev) => [...prev, {
      title: "", description: "", priceCents: 0, dueDateAmountCents: 0,
      maxInstallments: 1, firstInstallmentDate: null, months: 10,
      hasReduction: false, reductionSchedule: [],
      includedTeamIds: allTeamIds, items: [],
      paymentTypes: { card: true, bankTransfer: false, cash: false, check: false },
      paymentMessages: { card: "", bankTransfer: "Payment will not be completed until confirmed by the office", cash: "Please turn into the office and complete payment", check: "Please turn into the office and complete payment" },
    }]);
    setExpandedSub(subscriptions.length);
  }
  function updateSub(idx, field, value) { setSubscriptions((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))); }
  function removeSub(idx) { setSubscriptions((prev) => prev.filter((_, i) => i !== idx)); if (expandedSub === idx) setExpandedSub(null); }

  function generateReductionSchedule(idx) {
    const sub = subscriptions[idx];
    const m = sub.months || 10;
    const fullPrice = sub.priceCents || 0;
    const perMonth = m > 0 ? Math.round(fullPrice / m) : 0;
    const schedule = [];
    const start = activityStartDate || new Date();
    for (let i = 0; i < m; i++) {
      const date = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
      const price = fullPrice - (perMonth * i);
      schedule.push({ date: date.toISOString(), priceCents: Math.max(price, 0), maxInstallments: m - i });
    }
    updateSub(idx, "reductionSchedule", schedule);
  }

  function updateReductionRow(subIdx, rowIdx, field, value) {
    setSubscriptions((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      if (field === "date") ns[subIdx].reductionSchedule[rowIdx].date = value;
      else ns[subIdx].reductionSchedule[rowIdx][field] = Number(value);
      return ns;
    });
  }

  function addReductionRow(subIdx) {
    setSubscriptions((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      const schedule = ns[subIdx].reductionSchedule;
      const lastRow = schedule[schedule.length - 1];
      let newDate = new Date();
      if (lastRow?.date) {
        newDate = new Date(lastRow.date);
        newDate.setMonth(newDate.getMonth() + 1);
      }
      schedule.push({ date: newDate.toISOString(), priceCents: 0, maxInstallments: 1 });
      return ns;
    });
  }

  function removeReductionRow(subIdx, rowIdx) {
    setSubscriptions((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      ns[subIdx].reductionSchedule.splice(rowIdx, 1);
      return ns;
    });
  }

  function toggleTeamInSub(subIdx, teamId) {
    setSubscriptions((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      const ids = ns[subIdx].includedTeamIds || [];
      const t = String(teamId);
      const idx = ids.findIndex((id) => String(id) === t);
      if (idx >= 0) ids.splice(idx, 1); else ids.push(teamId);
      ns[subIdx].includedTeamIds = ids;
      return ns;
    });
  }

  function toggleAllTeamsInSub(subIdx, check) {
    setSubscriptions((prev) => {
      const ns = JSON.parse(JSON.stringify(prev));
      ns[subIdx].includedTeamIds = check ? assignableActivityTeams.map((tm) => tm.teamId) : [];
      return ns;
    });
  }

  function getTeamSubAssignmentLabel(tm, subIdx) {
    if (!tm.teamId) return { text: "", className: "text-xs text-gray-300 ms-2" };
    const tid = String(tm.teamId);
    const inSubs = [];
    subscriptions.forEach((s, j) => {
      if ((s.includedTeamIds || []).some((id) => String(id) === tid)) {
        inSubs.push({ j, title: (s.title || "").trim() || td("untitled") });
      }
    });
    const inCurrent = inSubs.some((x) => x.j === subIdx);
    const otherTitles = inSubs.filter((x) => x.j !== subIdx).map((x) => x.title);
    const titlesStr = otherTitles.join(", ");
    if (inCurrent && otherTitles.length > 0) {
      return { text: td("teamSubDuplicate", { titles: titlesStr }), className: "text-xs text-amber-600 ms-2 font-medium" };
    }
    if (!inCurrent && otherTitles.length > 0) {
      return { text: td("teamSubInOther", { titles: titlesStr }), className: "text-xs text-amber-600 ms-2" };
    }
    if (inCurrent) {
      return { text: td("teamSubThis"), className: "text-xs text-gray-400 ms-2" };
    }
    return { text: td("teamSubUnassigned"), className: "text-xs text-gray-300 ms-2" };
  }

  function addItem(subIdx, isDiscount = false) { setSubscriptions((prev) => { const ns = JSON.parse(JSON.stringify(prev)); ns[subIdx].items.push({ name: "", priceCents: 0, quantity: 1, isRequired: false, isDiscount, expiresAt: null }); return ns; }); }
  function updateItem(subIdx, itemIdx, field, value) { setSubscriptions((prev) => { const ns = JSON.parse(JSON.stringify(prev)); ns[subIdx].items[itemIdx][field] = value; return ns; }); }
  function removeItem(subIdx, itemIdx) { setSubscriptions((prev) => { const ns = JSON.parse(JSON.stringify(prev)); ns[subIdx].items.splice(itemIdx, 1); return ns; }); }
  function togglePaymentType(subIdx, type) { setSubscriptions((prev) => { const ns = JSON.parse(JSON.stringify(prev)); ns[subIdx].paymentTypes[type] = !ns[subIdx].paymentTypes[type]; return ns; }); }
  function updatePaymentMessage(subIdx, type, value) { setSubscriptions((prev) => { const ns = JSON.parse(JSON.stringify(prev)); ns[subIdx].paymentMessages[type] = value; return ns; }); }
  function addCoupon() { setCoupons((prev) => [...prev, { name: "", code: "", type: "fixed", amount: 0, duration: "one_time", maxUses: null, usedCount: 0, expiresAt: null }]); }
  function updateCoupon(idx, field, value) { setCoupons((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))); }
  function removeCoupon(idx) { setCoupons((prev) => prev.filter((_, i) => i !== idx)); }
  function save() { onSave({ subscriptions, coupons, passStripeFeeToCustomer: passStripeFee }); }

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="space-y-8">
      {/* Processing Fee Toggle */}
      <div className="bg-white border rounded-lg p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={passStripeFee}
            onChange={(e) => setPassStripeFee(e.target.checked)}
            className="rounded mt-0.5" />
          <div>
            <span className="text-sm font-medium text-gray-900">{td("passStripeFee")}</span>
            <p className="text-xs text-gray-400 mt-0.5">{td("passStripeFeeHint")}</p>
          </div>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{`${td("subscriptions")} (${subscriptions.length})`}</h3>
          <button onClick={addSubscription} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">{td("addSubscription")}</button>
        </div>
        {subscriptions.length === 0 ? <p className="text-gray-400 text-sm p-4 bg-gray-50 rounded text-center">{td("noSubscriptionsYet")}</p> : (
          <div className="space-y-3">
            {subscriptions.map((sub, sIdx) => {
              const priceLabel = sub.priceCents > 0 ? `$${centsToDisplay(sub.priceCents)}` : "No price set";
              const teamCount = (sub.includedTeamIds || []).length;
              return (
                <div key={sIdx} className="border rounded-lg">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer" onClick={() => setExpandedSub(expandedSub === sIdx ? null : sIdx)}>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{expandedSub === sIdx ? "▼" : "▶"}</span>
                      <span className="font-medium text-gray-900">{sub.title || td("untitled")}</span>
                      <span className="text-xs text-gray-500">{priceLabel}</span>
                      <span className="text-xs text-gray-400">({teamCount} {t("teams")})</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeSub(sIdx); }} className="text-xs text-red-500 hover:text-red-700">{tc("remove")}</button>
                  </div>
                  {expandedSub === sIdx && (
                    <div className="p-4 space-y-5">
                      {/* Title & Description */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">{td("title")}</label>
                          <input value={sub.title} onChange={(e) => updateSub(sIdx, "title", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">{td("description")}</label>
                          <input value={sub.description} onChange={(e) => updateSub(sIdx, "description", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                      </div>

                      {/* Price, Due Date Amount, Months */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{td("totalPrice")}</label>
                          <div className="flex items-center gap-1"><span className="text-sm text-gray-500">$</span>
                            <PriceInput value={sub.priceCents} onChange={(cents) => updateSub(sIdx, "priceCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{td("dueDateAmount")}</label>
                          <div className="flex items-center gap-1"><span className="text-sm text-gray-500">$</span>
                            <PriceInput value={sub.dueDateAmountCents} onChange={(cents) => updateSub(sIdx, "dueDateAmountCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                          <p className="text-xs text-gray-400 mt-1">{td("dueDateAmountHint")}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{td("months")}</label>
                          <input type="number" value={sub.months} onChange={(e) => updateSub(sIdx, "months", Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" min="1" />
                        </div>
                      </div>

                      {/* Max Installments & First Installment Date */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{td("maxInstallmentsLabel")}</label>
                          <input type="number" value={sub.maxInstallments} onChange={(e) => updateSub(sIdx, "maxInstallments", Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" min="1" />
                          <p className="text-xs text-gray-400 mt-1">{td("parentInstallmentHint", { max: sub.maxInstallments || 1 })}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{td("firstInstallmentDate")}</label>
                          <input type="date" value={sub.firstInstallmentDate ? sub.firstInstallmentDate.slice(0, 10) : ""}
                            onChange={(e) => updateSub(sIdx, "firstInstallmentDate", e.target.value || null)}
                            className="w-full border rounded-lg px-3 py-2 text-sm" />
                          <p className="text-xs text-gray-400 mt-1">{td("firstInstallmentDateHint")}</p>
                        </div>
                      </div>

                      {/* Installment Fee */}
                      {sub.maxInstallments > 1 && (
                        <div className="border rounded-lg p-4 bg-amber-50/50">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">{td("installmentFeeTitle")}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">{td("feeThreshold")}</label>
                              <input type="number" value={sub.installmentFeeThreshold || ""} placeholder="0"
                                onChange={(e) => updateSub(sIdx, "installmentFeeThreshold", Number(e.target.value) || 0)}
                                className="w-full border rounded-lg px-3 py-2 text-sm" min="0" max={sub.maxInstallments} />
                              <p className="text-xs text-gray-400 mt-1">{td("feeThresholdHint")}</p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">{td("feePercent")}</label>
                              <div className="flex items-center gap-1">
                                <input type="number" value={sub.installmentFeePercent || ""} placeholder="0" step="0.5"
                                  onChange={(e) => updateSub(sIdx, "installmentFeePercent", Number(e.target.value) || 0)}
                                  className="w-full border rounded-lg px-3 py-2 text-sm" min="0" max="100" />
                                <span className="text-sm text-gray-500">%</span>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">{td("feeMode")}</label>
                              <select value={sub.installmentFeeMode || "split"}
                                onChange={(e) => updateSub(sIdx, "installmentFeeMode", e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm">
                                <option value="split">{td("feeModeSplit")}</option>
                                <option value="due_date">{td("feeModeDueDate")}</option>
                              </select>
                            </div>
                          </div>
                          {sub.installmentFeeThreshold > 0 && sub.installmentFeePercent > 0 && sub.priceCents > 0 && (
                            <p className="text-xs text-amber-700 mt-2 font-medium">
                              {td("feePreview", {
                                threshold: sub.installmentFeeThreshold,
                                percent: sub.installmentFeePercent,
                                fee: "$" + centsToDisplay(Math.round(sub.priceCents * sub.installmentFeePercent / 100)),
                                mode: sub.installmentFeeMode === "due_date" ? td("feeModeDueDate").toLowerCase() : td("feeModeSplit").toLowerCase(),
                              })}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Installment Preview */}
                      {sub.priceCents > 0 && sub.maxInstallments > 1 && sub.dueDateAmountCents > 0 && sub.firstInstallmentDate && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">{td("installmentPreview", { max: sub.maxInstallments })}</h4>
                          <div className="text-xs text-blue-800 space-y-1">
                            {(() => {
                              const hasFee = sub.installmentFeeThreshold > 0 && sub.installmentFeePercent > 0 && sub.maxInstallments > sub.installmentFeeThreshold;
                              const feeCents = hasFee ? Math.round(sub.priceCents * sub.installmentFeePercent / 100) : 0;
                              const effectiveTotal = sub.priceCents + feeCents;
                              let dueNow = sub.dueDateAmountCents;
                              let remaining;
                              if (hasFee && sub.installmentFeeMode === "due_date") {
                                dueNow = sub.dueDateAmountCents + feeCents;
                                remaining = Math.max(0, sub.priceCents - sub.dueDateAmountCents);
                              } else {
                                remaining = Math.max(0, effectiveTotal - dueNow);
                              }
                              const numRemaining = (sub.maxInstallments || 1) - 1;
                              const perInstallment = numRemaining > 0 ? Math.round(remaining / numRemaining) : 0;
                              const firstDate = new Date(sub.firstInstallmentDate);
                              return (
                                <>
                                  <div className="flex justify-between">
                                    <span>{td("dueAtRegistration")}</span>
                                    <span className="font-medium">${centsToDisplay(dueNow)}</span>
                                  </div>
                                  {hasFee && sub.installmentFeeMode === "due_date" && (
                                    <div className="flex justify-between text-amber-700">
                                      <span className="italic">{td("includesFee", { percent: sub.installmentFeePercent })}</span>
                                      <span className="italic">+${centsToDisplay(feeCents)}</span>
                                    </div>
                                  )}
                                  {numRemaining > 0 && remaining > 0 && Array.from({ length: numRemaining }, (_, i) => {
                                    const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate());
                                    const amt = i === numRemaining - 1 ? remaining - (perInstallment * (numRemaining - 1)) : perInstallment;
                                    return (<div key={i} className="flex justify-between"><span>{fmtDate(d)} (installment #{i + 2})</span><span className="font-medium">${centsToDisplay(amt)}</span></div>);
                                  })}
                                  {hasFee && sub.installmentFeeMode === "split" && (
                                    <div className="flex justify-between text-amber-700">
                                      <span className="italic">{td("includesFee", { percent: sub.installmentFeePercent })}</span>
                                      <span className="italic">+${centsToDisplay(feeCents)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between border-t border-blue-200 pt-1 mt-1 font-semibold">
                                    <span>Total</span><span>${centsToDisplay(effectiveTotal)}</span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Reduction Schedule */}
                      <div>
                        <label className="flex items-center gap-2 text-sm mb-2">
                          <input type="checkbox" checked={!!sub.hasReduction} onChange={(e) => { updateSub(sIdx, "hasReduction", e.target.checked); if (e.target.checked && (!sub.reductionSchedule || sub.reductionSchedule.length === 0)) generateReductionSchedule(sIdx); }} className="rounded" />
                          <span className="font-medium text-gray-700">{td("priceReductionSchedule")}</span>
                        </label>
                        {sub.hasReduction && (
                          <div className="border rounded-lg overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead><tr className="bg-gray-50 text-start">
                                <th className="px-3 py-2 w-8">#</th>
                                <th className="px-3 py-2">Date</th>
                                <th className="px-3 py-2">Price ($)</th>
                                <th className="px-3 py-2">Max Installments</th>
                                <th className="px-3 py-2 w-8"></th>
                              </tr></thead>
                              <tbody>
                                {(sub.reductionSchedule || []).map((row, rIdx) => (
                                  <tr key={rIdx} className="border-t">
                                    <td className="px-3 py-2 text-gray-400">{rIdx + 1}</td>
                                    <td className="px-3 py-2"><input type="date" value={row.date ? row.date.slice(0, 10) : ""}
                                      onChange={(e) => updateReductionRow(sIdx, rIdx, "date", e.target.value)} className="border rounded px-2 py-1 text-sm" /></td>
                                    <td className="px-3 py-2"><PriceInput value={row.priceCents}
                                      onChange={(cents) => updateReductionRow(sIdx, rIdx, "priceCents", cents)} className="border rounded px-2 py-1 text-sm w-28" /></td>
                                    <td className="px-3 py-2"><input type="number" value={row.maxInstallments}
                                      onChange={(e) => updateReductionRow(sIdx, rIdx, "maxInstallments", e.target.value)} className="border rounded px-2 py-1 text-sm w-20" min="1" /></td>
                                    <td className="px-3 py-2"><button onClick={() => removeReductionRow(sIdx, rIdx)} className="text-red-400 hover:text-red-600 text-sm">×</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="px-3 py-2 bg-gray-50 flex items-center gap-3">
                              <button onClick={() => addReductionRow(sIdx)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">{td("addRow")}</button>
                              <button onClick={() => generateReductionSchedule(sIdx)} className="text-xs text-gray-500 hover:text-gray-700">{td("autoGenerate")}</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Included Teams */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">{td("includedTeams", { included: (sub.includedTeamIds || []).length, total: assignableActivityTeams.length })}</label>
                          <div className="flex gap-2">
                            <button onClick={() => toggleAllTeamsInSub(sIdx, true)} className="text-xs text-blue-600 hover:text-blue-800">{td("checkAll")}</button>
                            <button onClick={() => toggleAllTeamsInSub(sIdx, false)} className="text-xs text-red-500 hover:text-red-700">{td("uncheckAll")}</button>
                          </div>
                        </div>
                        {(sub.includedTeamIds || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {(sub.includedTeamIds || []).map((tid) => {
                              const team = activityTeams.find((tm) => String(tm.teamId) === String(tid));
                              if (!team) return null;
                              return (
                                <span key={tid} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                                  {team.name}
                                  <button onClick={() => toggleTeamInSub(sIdx, tid)} className="text-blue-400 hover:text-blue-700 ms-0.5" title={tc("remove")}>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {assignableActivityTeams.length === 0 ? <p className="text-xs text-gray-400">{td("addTeamsFirst")}</p> : (
                          <>
                            <input type="text" value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)}
                              placeholder={td("searchTeams")} className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" />
                            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                              {assignableActivityTeams.filter((tm) => {
                                if (!teamSearch.trim()) return true;
                                const q = teamSearch.toLowerCase();
                                return (tm.name || "").toLowerCase().includes(q) || (tm.season || "").toLowerCase().includes(q);
                              }).map((tm) => {
                                const included = (sub.includedTeamIds || []).some((id) => String(id) === String(tm.teamId));
                                const subHint = getTeamSubAssignmentLabel(tm, sIdx);
                                return (
                                  <div key={activityTeamSlotKey(tm, tm.slotIndex)} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                                    <input type="checkbox" checked={included} onChange={() => toggleTeamInSub(sIdx, tm.teamId)} className="rounded" />
                                    <span className="flex-1 text-sm flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                                      <span className="font-medium">{tm.name}</span>
                                      {tm.season ? <span className="text-xs text-gray-400">{tm.season}</span> : null}
                                      <span className={subHint.className}>{subHint.text}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Items & Discounts */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">{td("itemsAndDiscounts")}</label>
                          <div className="flex gap-2">
                            <button onClick={() => addItem(sIdx, false)} className="text-xs text-blue-600 hover:text-blue-800">{td("addItem")}</button>
                            <button onClick={() => addItem(sIdx, true)} className="text-xs text-green-600 hover:text-green-800">{td("addDiscount")}</button>
                          </div>
                        </div>
                        {sub.items.length === 0 ? <p className="text-xs text-gray-400 text-center py-2">{td("noItemsOrDiscounts")}</p> : (
                          <div className="space-y-2">
                            {sub.items.map((item, iIdx) => (
                              <div key={iIdx} className={`border rounded-lg p-2.5 ${item.isDiscount ? "bg-red-50/50 border-red-200" : ""}`}>
                                <div className="flex items-center gap-3">
                                  {item.isDiscount && <span className="text-red-500 text-xs font-semibold whitespace-nowrap">{td("DISCOUNT")}</span>}
                                  <input value={item.name} onChange={(e) => updateItem(sIdx, iIdx, "name", e.target.value)}
                                    placeholder={item.isDiscount ? td("discountName") : td("itemNamePlaceholder")} className="flex-1 border rounded px-2 py-1 text-sm" />
                                  <div className="flex items-center gap-1">
                                    {item.isDiscount && <span className="text-xs text-red-500">-$</span>}
                                    {!item.isDiscount && <span className="text-xs text-gray-500">$</span>}
                                    <PriceInput value={item.priceCents} onChange={(cents) => updateItem(sIdx, iIdx, "priceCents", cents)}
                                      placeholder="0.00" className="w-24 border rounded px-2 py-1 text-sm" />
                                  </div>
                                  <input type="number" value={item.quantity} onChange={(e) => updateItem(sIdx, iIdx, "quantity", Number(e.target.value))}
                                    className="w-14 border rounded px-2 py-1 text-sm" title="Quantity" min="1" />
                                  {!item.isDiscount && (
                                    <label className="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" checked={item.isRequired}
                                      onChange={(e) => updateItem(sIdx, iIdx, "isRequired", e.target.checked)} className="rounded" />{td("req")}</label>
                                  )}
                                  <button onClick={() => removeItem(sIdx, iIdx)} className="text-red-400 hover:text-red-600 text-sm">×</button>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                                    <span>{td("expiresLabel")}</span>
                                    <input type="date" value={item.expiresAt ? (typeof item.expiresAt === "string" ? item.expiresAt.slice(0, 10) : "") : ""}
                                      onChange={(e) => updateItem(sIdx, iIdx, "expiresAt", e.target.value || null)}
                                      className="border rounded px-1.5 py-0.5 text-xs w-36" />
                                  </label>
                                  {item.expiresAt && <span className="text-[10px] text-gray-400">{td("willNotAppearAfter")}</span>}
                                  {!item.expiresAt && <span className="text-[10px] text-gray-400">{td("noExpiryAlwaysIncluded")}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Payment Types */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">{td("paymentTypes")}</label>
                        <p className="text-xs text-gray-400 mb-2">{td("paymentTypesHint")}</p>
                        {(() => {
                          const ptLabels = { card: td("card"), bankTransfer: td("bankTransfer"), cash: td("cash"), check: td("check") };
                          return ["card", "bankTransfer", "cash", "check"].map((pt) => (
                            <div key={pt} className="mb-3">
                              <label className="flex items-center gap-2 text-sm mb-1">
                                <input type="checkbox" checked={!!sub.paymentTypes[pt]} onChange={() => togglePaymentType(sIdx, pt)} className="rounded" />
                                <span className="font-medium">{ptLabels[pt]}</span>
                              </label>
                              {sub.paymentTypes[pt] && <textarea value={sub.paymentMessages[pt]} onChange={(e) => updatePaymentMessage(sIdx, pt, e.target.value)} placeholder={td("messageAfterRegistration")} className="w-full border rounded px-3 py-1.5 text-sm ms-6" rows={2} />}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Coupons */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{`${td("coupons")} (${coupons.length})`}</h3>
          <button onClick={addCoupon} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700">{td("addCoupon")}</button>
        </div>
        {coupons.length === 0 ? <p className="text-gray-400 text-sm p-4 bg-gray-50 rounded text-center">{td("noCouponsYet")}</p> : (
          <div className="space-y-3">
            {coupons.map((c, cIdx) => (
              <div key={cIdx} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3"><span className="font-medium text-gray-900">{c.name || "(Untitled)"}</span><button onClick={() => removeCoupon(cIdx)} className="text-xs text-red-500 hover:text-red-700">{tc("remove")}</button></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className="block text-xs text-gray-500 mb-1">{tc("name")}</label><input value={c.name} onChange={(e) => updateCoupon(cIdx, "name", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">{td("code")}</label><input value={c.code} onChange={(e) => updateCoupon(cIdx, "code", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">{td("type")}</label><select value={c.type} onChange={(e) => updateCoupon(cIdx, "type", e.target.value)} className="w-full border rounded px-2 py-1 text-sm"><option value="fixed">{td("fixedAmount")}</option><option value="percentage">{td("percentage")}</option><option value="greater_than">{td("greaterThanPrice")}</option></select></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                  <div><label className="block text-xs text-gray-500 mb-1">{c.type === "percentage" ? td("percentage") + " (%)" : tc("amount") + " ($)"}</label>
                    {c.type === "percentage" ? (
                      <input type="text" inputMode="numeric" value={c.amount} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*$/.test(v)) updateCoupon(cIdx, "amount", Number(v || 0)); }} className="w-full border rounded px-2 py-1 text-sm" />
                    ) : (
                      <PriceInput value={c.amount} onChange={(cents) => updateCoupon(cIdx, "amount", cents)} className="w-full border rounded px-2 py-1 text-sm" />
                    )}</div>
                  <div><label className="block text-xs text-gray-500 mb-1">{td("duration")}</label><select value={c.duration} onChange={(e) => updateCoupon(cIdx, "duration", e.target.value)} className="w-full border rounded px-2 py-1 text-sm"><option value="one_time">{td("oneTime")}</option><option value="x_times">{td("xTimes")}</option><option value="until_date">{td("untilDate")}</option><option value="unlimited">{td("unlimited")}</option></select></div>
                  {c.duration === "x_times" && <div><label className="block text-xs text-gray-500 mb-1">{td("maxUses")}</label><input type="number" value={c.maxUses || ""} onChange={(e) => updateCoupon(cIdx, "maxUses", Number(e.target.value))} className="w-full border rounded px-2 py-1 text-sm" /></div>}
                  {c.duration === "until_date" && <div><label className="block text-xs text-gray-500 mb-1">{td("expiresLabel")}</label><input type="date" value={c.expiresAt ? c.expiresAt.slice(0, 10) : ""} onChange={(e) => updateCoupon(cIdx, "expiresAt", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? tc("saving") : td("savePaymentSettings")}</button>
    </div>
  );
}

/* ============== TAB: Waivers ============== */
function TabWaivers({ activity, onSave, saving, tc, td }) {
  const [waivers, setWaivers] = useState([]);
  const [emailConfirmation, setEmailConfirmation] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const fileInputRef = useRef(null);
  const activityId = activity?._id;

  useEffect(() => {
    if (activity?.waivers) {
      setWaivers(activity.waivers.map((w) => ({
        _id: w._id || undefined,
        title: w.title || "",
        contentHtml: w.contentHtml || "",
        isRequired: w.isRequired !== false,
        order: w.order || 0,
      })));
    }
    setEmailConfirmation(!!activity?.waiverEmailConfirmation);
  }, [activity]);

  function addWaiver() {
    setWaivers((prev) => [...prev, { title: "", contentHtml: "", isRequired: true, order: prev.length }]);
    setExpandedIdx(waivers.length);
  }

  function removeWaiver(idx) {
    setWaivers((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx(null);
  }

  function updateWaiver(idx, field, value) {
    setWaivers((prev) => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  }

  function moveWaiver(idx, dir) {
    setWaivers((prev) => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((w, i) => ({ ...w, order: i }));
    });
  }

  async function handleDocxUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".docx")) {
      alert("Please upload a .docx file");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/activities/${activityId}/upload-waiver`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setWaivers((prev) => [...prev, {
        title: data.title || file.name.replace(/\.[^/.]+$/, ""),
        contentHtml: data.html || "",
        isRequired: true,
        order: prev.length,
      }]);
      setExpandedIdx(waivers.length);
    } catch { alert("Failed to upload document"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  function save() {
    onSave({
      waivers: waivers.map((w, i) => ({ ...w, order: i })),
      waiverEmailConfirmation: emailConfirmation,
    });
  }

  return (
    <div className="space-y-6">
      <label className="flex items-start gap-3 border rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 transition">
        <input
          type="checkbox"
          checked={emailConfirmation}
          onChange={(e) => setEmailConfirmation(e.target.checked)}
          className="mt-0.5 rounded border-gray-300"
        />
        <span className="flex-1">
          <span className="block text-sm font-medium text-gray-900">{td("requireWaiverEmailConfirmation")}</span>
          <span className="block text-xs text-gray-500 mt-0.5">{td("requireWaiverEmailConfirmationHint")}</span>
        </span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{`${td("waivers")} (${waivers.length})`}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{td("waiversHint")}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <label className={`cursor-pointer bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-200 transition inline-flex items-center gap-1.5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            {uploading ? td("converting") : td("uploadDocx")}
            <input ref={fileInputRef} type="file" accept=".docx" onChange={handleDocxUpload} className="hidden" />
          </label>
          <button onClick={addWaiver} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">{td("addWaiver")}</button>
        </div>
      </div>

      {waivers.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <p className="text-sm text-gray-500 mb-1">{td("noWaiversYet")}</p>
          <p className="text-xs text-gray-400">{td("noWaiversDesc")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {waivers.map((w, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
                <div className="flex flex-col gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); moveWaiver(idx, -1); }} disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">▲</button>
                  <button onClick={(e) => { e.stopPropagation(); moveWaiver(idx, 1); }} disabled={idx === waivers.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">▼</button>
                </div>
                <span className="text-sm font-medium text-gray-900 flex-1">{w.title || td("untitledWaiver")}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${w.isRequired ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                  {w.isRequired ? tc("required") : tc("optional")}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition ${expandedIdx === idx ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>

              {expandedIdx === idx && (
                <div className="p-4 space-y-4 border-t">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{td("waiverTitle")}</label>
                    <input value={w.title} onChange={(e) => updateWaiver(idx, "title", e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g., Club Agreement" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{td("content")}</label>
                    <p className="text-xs text-gray-400 mb-1">{td("contentHint")}</p>
                    <div contentEditable suppressContentEditableWarning
                      className="w-full border rounded-lg px-3 py-2 text-sm min-h-[200px] max-h-[400px] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-500 prose prose-sm"
                      dangerouslySetInnerHTML={{ __html: w.contentHtml }}
                      onBlur={(e) => updateWaiver(idx, "contentHtml", e.target.innerHTML)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={w.isRequired} onChange={(e) => updateWaiver(idx, "isRequired", e.target.checked)} className="rounded" />
                      <span>{td("requiredWaiver")}</span>
                    </label>
                    <button onClick={() => removeWaiver(idx)} className="text-xs text-red-500 hover:text-red-700 font-medium">{td("removeWaiver")}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? tc("saving") : td("saveWaivers")}
      </button>
    </div>
  );
}

/* ============== TAB 5: Notifications ============== */
function TabNotifications({ activity, onSave, saving, tc, td }) {
  const locale = useLocale();
  const [message, setMessage] = useState("");
  const [invSubject, setInvSubject] = useState("");
  const [invBody, setInvBody] = useState("");
  const [invSms, setInvSms] = useState("");

  useEffect(() => {
    if (!activity) return;
    setMessage(activity.afterRegistrationMessage || "");
    const inv = activity.registrationInvitation || {};
    setInvSubject(inv.subject || getDefaultInvitationSubject(locale));
    setInvBody(inv.bodyHtml || getDefaultInvitationEmailHtml(locale));
    setInvSms(inv.smsText || getDefaultInvitationSms(locale));
  }, [activity, locale]);

  function resetInvitation() {
    setInvSubject(getDefaultInvitationSubject(locale));
    setInvBody(getDefaultInvitationEmailHtml(locale));
    setInvSms(getDefaultInvitationSms(locale));
  }

  function saveInvitation() {
    onSave({
      registrationInvitation: {
        subject: invSubject,
        bodyHtml: invBody,
        smsText: invSms,
      },
    });
  }

  function saveAfterMessage() { onSave({ afterRegistrationMessage: message }); }

  return (
    <div className="space-y-8">
      {/* Registration invitation template */}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{td("registrationInvitation")}</h3>
          <p className="text-xs text-gray-500 mt-1">{td("registrationInvitationDesc")}</p>
        </div>
        <InvitationTemplateEditor
          subject={invSubject}
          bodyHtml={invBody}
          smsText={invSms}
          onSubjectChange={setInvSubject}
          onBodyChange={setInvBody}
          onSmsChange={setInvSms}
          onReset={resetInvitation}
        />
        <button
          onClick={saveInvitation}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? tc("saving") : td("saveInvitationTemplate")}
        </button>
      </section>

      <hr className="border-gray-200" />

      {/* After-registration message */}
      <section className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{td("afterRegistrationMessage")}</label>
          <p className="text-xs text-gray-400 mb-2">{td("afterRegistrationDesc")}</p>
          <div contentEditable suppressContentEditableWarning className="w-full border rounded-lg px-3 py-2 text-sm min-h-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            dangerouslySetInnerHTML={{ __html: message }} onBlur={(e) => setMessage(e.target.innerHTML)} />
        </div>
        <button onClick={saveAfterMessage} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? tc("saving") : td("saveNotifications")}</button>
      </section>

      <div className="bg-gray-50 rounded-lg p-4"><p className="text-sm text-gray-500">{td("moreNotificationsComingSoon")}</p></div>
    </div>
  );
}

/* ============== MAIN EDIT PAGE ============== */
export default function ActivityEditPage({ params }) {
  const resolvedParams = use(params);
  const activityId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("activities");
  const tc = useTranslations("common");
  const td = useTranslations("activityDetail");
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const currentTab = searchParams.get("tab") || "details";

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/activities/${activityId}`);
      const data = await res.json();
      if (data.activity) setActivity(data.activity);
      else { alert("Activity not found"); router.push("/dashboard/activities"); }
    } catch { alert(tc("somethingWentWrong")); }
    finally { setLoading(false); }
  }, [activityId, router]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  function switchTab(tab) { router.push(`/dashboard/activities/${activityId}/edit?tab=${tab}`, { scroll: false }); }

  async function saveTab(data) {
    setSaving(true);
    try {
      const res = await fetch(`/api/activities/${activityId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await res.json();
      if (result.activity) { setActivity(result.activity); setToast({ message: td("savedSuccessfully"), type: "success" }); }
      else setToast({ message: result.error || tc("failedToSave"), type: "error" });
    } catch { setToast({ message: tc("failedToSave"), type: "error" }); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-gray-500 py-8 text-center">{tc("loading")}</p>;

  const allTabs = [
    { key: "details", label: td("activityDetails") },
    { key: "teams", label: td("teams") },
    { key: "form", label: td("registrationForm") },
    { key: "waivers", label: td("waivers") },
    { key: "payment", label: t("payment") },
    { key: "notifications", label: td("notifications") },
  ];
  const visibleTabs = allTabs.filter((tab) => !(tab.key === "payment" && !activity?.hasPayment));

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <button onClick={() => router.push(`/dashboard/activities/${activityId}`)} className="text-gray-400 hover:text-gray-600 text-sm">{td("backToActivity")}</button>
        <h2 className="text-xl font-bold text-gray-900">{td("edit")}: {activity?.title || t("activity")}</h2>
      </div>
      <div className="border-b mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {visibleTabs.map((tabItem) => (
            <button key={tabItem.key} onClick={() => switchTab(tabItem.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap shrink-0 ${currentTab === tabItem.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{tabItem.label}</button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3 sm:p-6">
        {currentTab === "details" && <TabDetails activity={activity} onSave={saveTab} saving={saving} t={t} tc={tc} td={td} />}
        {currentTab === "teams" && <TabTeams activity={activity} onSave={saveTab} saving={saving} tc={tc} td={td} />}
        {currentTab === "form" && <TabForm activity={activity} onSave={saveTab} saving={saving} tc={tc} td={td} />}
        {currentTab === "waivers" && <TabWaivers activity={activity} onSave={saveTab} saving={saving} tc={tc} td={td} />}
        {currentTab === "payment" && <TabPayment activity={activity} onSave={saveTab} saving={saving} t={t} tc={tc} td={td} />}
        {currentTab === "notifications" && <TabNotifications activity={activity} onSave={saveTab} saving={saving} tc={tc} td={td} />}
      </div>
    </div>
  );
}
