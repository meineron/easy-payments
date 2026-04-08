"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

export default function RecipientPicker({ open, onClose, onConfirm, t }) {
  const [players, setPlayers] = useState([]);
  const [parents, setParents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [season, setSeason] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/messages/recipients")
      .then((r) => r.json())
      .then((d) => { setPlayers(d.players || []); setParents(d.parents || []); setTeams(d.teams || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const updatePlayerEmail = useCallback((playerId, email) => {
    setPlayers((prev) => prev.map((p) => String(p._id) === String(playerId) ? { ...p, email } : p));
  }, []);

  const seasons = useMemo(() => {
    const s = new Set();
    for (const tm of teams) if (tm.season) s.add(tm.season);
    return [...s].sort().reverse();
  }, [teams]);

  const filteredTeams = useMemo(() => {
    if (season === "all") return teams;
    return teams.filter((tm) => tm.season === season);
  }, [teams, season]);

  const filteredTeamIds = useMemo(() => new Set(filteredTeams.map((tm) => String(tm._id))), [filteredTeams]);

  const teamData = useMemo(() => {
    const result = {};
    for (const p of players) {
      const pTeams = (p.teams || []).filter((pt) => filteredTeamIds.has(String(pt.teamId?._id || pt.teamId)));
      for (const pt of pTeams) {
        const tid = String(pt.teamId?._id || pt.teamId);
        if (!result[tid]) result[tid] = { players: [], parents: [], parentIds: new Set() };
        result[tid].players.push(p);
        for (const par of (p.parents || [])) {
          const parObj = typeof par === "object" ? par : null;
          if (parObj?.email && !result[tid].parentIds.has(String(parObj._id))) {
            result[tid].parentIds.add(String(parObj._id));
            result[tid].parents.push(parObj);
          }
        }
      }
    }
    return result;
  }, [players, filteredTeamIds]);

  const allPlayers = useMemo(() => players, [players]);
  const allPlayersWithEmail = useMemo(() => players.filter((p) => p.email), [players]);
  const filteredParents = useMemo(() => parents.filter((p) => p.email), [parents]);

  const noTeamPlayers = useMemo(() => {
    return players.filter((p) => {
      const pTeams = (p.teams || []).filter((pt) => filteredTeamIds.has(String(pt.teamId?._id || pt.teamId)));
      return pTeams.length === 0 && season === "all";
    });
  }, [players, filteredTeamIds, season]);

  const lc = search.toLowerCase();
  function matches(name, email) {
    if (!lc) return true;
    return name.toLowerCase().includes(lc) || (email || "").toLowerCase().includes(lc);
  }

  function mk(type, id) { return `${type}:${id}`; }

  function toggle(key) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function toggleAll(keys) {
    setSelected((prev) => {
      const n = new Set(prev);
      const allIn = keys.length > 0 && keys.every((k) => n.has(k));
      if (allIn) keys.forEach((k) => n.delete(k)); else keys.forEach((k) => n.add(k));
      return n;
    });
  }

  function toggleExp(group) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(group)) n.delete(group); else n.add(group); return n; });
  }

  function visiblePlayerKeys(list) {
    return list.filter((p) => p.email && matches(`${p.firstName} ${p.lastName}`, p.email)).map((p) => mk("player", p._id));
  }
  function visibleParentKeys(list) {
    return list.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email)).map((p) => mk("parent", p._id));
  }
  function teamAllKeys(tid) {
    const td = teamData[tid];
    if (!td) return [];
    return [...visiblePlayerKeys(td.players), ...visibleParentKeys(td.parents)];
  }

  function handleConfirm() {
    const result = [];
    const seen = new Set();
    for (const sel of selected) {
      const [type, id] = sel.split(":");
      if (seen.has(id)) continue;
      seen.add(id);
      if (type === "player") {
        const p = players.find((pl) => String(pl._id) === id);
        if (p?.email) result.push({ type: "player", id: p._id, name: `${p.firstName} ${p.lastName}`, email: p.email });
      } else {
        const p = parents.find((pa) => String(pa._id) === id);
        if (p?.email) result.push({ type: "parent", id: p._id, name: `${p.firstName} ${p.lastName}`, email: p.email });
      }
    }
    onConfirm(result);
    onClose();
  }

  if (!open) return null;

  const visibleAllPlayers = allPlayers.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
  const visibleAllParents = filteredParents.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email));
  const allPlayerKeys = visiblePlayerKeys(allPlayersWithEmail);
  const allParentKeys = visibleParentKeys(filteredParents);
  const allPlayersChecked = allPlayerKeys.length > 0 && allPlayerKeys.every((k) => selected.has(k));
  const allParentsChecked = allParentKeys.length > 0 && allParentKeys.every((k) => selected.has(k));

  function renderPlayerList(list, indent) {
    const visible = list.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
    return (
      <div className={`${indent} space-y-0.5`}>
        {visible.map((p) =>
          p.email ? (
            <PersonRow key={p._id} name={`${p.firstName} ${p.lastName}`} email={p.email}
              checked={selected.has(mk("player", p._id))} onCheck={() => toggle(mk("player", p._id))} />
          ) : (
            <AddEmailRow key={p._id} player={p} onSaved={updatePlayerEmail} t={t} />
          )
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t("addRecipients")}</h3>
            <p className="text-sm text-gray-500">{t("addRecipientsHint")}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3">
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">{t("filters")}</p>
            <div className="relative">
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchRecipientsPlaceholder")}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {seasons.length > 1 && (
              <select value={season} onChange={(e) => setSeason(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">{t("allSeasons")}</option>
                {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* All Players */}
              <GroupRow label={t("players")} count={visibleAllPlayers.length}
                checked={allPlayersChecked} onCheck={() => toggleAll(allPlayerKeys)}
                isExpanded={expanded.has("allPlayers")} onExpand={() => toggleExp("allPlayers")} />
              {expanded.has("allPlayers") && renderPlayerList(allPlayers, "ml-4 mb-2")}

              {/* All Parents */}
              <GroupRow label={t("parentGroup")} count={visibleAllParents.length}
                checked={allParentsChecked} onCheck={() => toggleAll(allParentKeys)}
                isExpanded={expanded.has("allParents")} onExpand={() => toggleExp("allParents")} />
              {expanded.has("allParents") && (
                <div className="ml-4 space-y-0.5 mb-2">
                  {filteredParents.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email)).map((p) => (
                    <PersonRow key={p._id} name={`${p.firstName} ${p.lastName}`} email={p.email}
                      checked={selected.has(mk("parent", p._id))} onCheck={() => toggle(mk("parent", p._id))} />
                  ))}
                </div>
              )}

              {/* Divider */}
              {filteredTeams.length > 0 && <div className="border-t my-3" />}

              {/* Per-team rows */}
              {filteredTeams.map((team) => {
                const td = teamData[String(team._id)];
                if (!td || td.players.length === 0) return null;
                const tPlayersAll = td.players.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
                const tPlayers = td.players.filter((p) => p.email && matches(`${p.firstName} ${p.lastName}`, p.email));
                const tParents = td.parents.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email));
                const totalCount = tPlayersAll.length + tParents.length;
                if (totalCount === 0) return null;

                const allKeys = teamAllKeys(String(team._id));
                const allTeamChecked = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
                const teamGk = `team:${team._id}`;
                const pGk = `${teamGk}:players`;
                const parGk = `${teamGk}:parents`;

                const teamPlayerKeys = visiblePlayerKeys(tPlayers);
                const teamParentKeys = visibleParentKeys(tParents);
                const teamPlayersChecked = teamPlayerKeys.length > 0 && teamPlayerKeys.every((k) => selected.has(k));
                const teamParentsChecked = teamParentKeys.length > 0 && teamParentKeys.every((k) => selected.has(k));

                return (
                  <div key={team._id}>
                    <GroupRow label={team.name} count={totalCount}
                      checked={allTeamChecked} onCheck={() => toggleAll(allKeys)}
                      isExpanded={expanded.has(teamGk)} onExpand={() => toggleExp(teamGk)} />

                    {expanded.has(teamGk) && (
                      <div className="ml-4 space-y-1 mt-1 mb-2">
                        {tPlayersAll.length > 0 && (
                          <>
                            <SubGroupRow label={t("players")} count={tPlayersAll.length}
                              checked={teamPlayersChecked} onCheck={() => toggleAll(teamPlayerKeys)}
                              isExpanded={expanded.has(pGk)} onExpand={() => toggleExp(pGk)} />
                            {expanded.has(pGk) && renderPlayerList(td.players.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || "")), "ml-6")}
                          </>
                        )}

                        {tParents.length > 0 && (
                          <>
                            <SubGroupRow label={t("parentGroup")} count={tParents.length}
                              checked={teamParentsChecked} onCheck={() => toggleAll(teamParentKeys)}
                              isExpanded={expanded.has(parGk)} onExpand={() => toggleExp(parGk)} />
                            {expanded.has(parGk) && (
                              <div className="ml-6 space-y-0.5">
                                {tParents.map((p) => (
                                  <PersonRow key={p._id} name={`${p.firstName} ${p.lastName}`} email={p.email}
                                    checked={selected.has(mk("parent", p._id))} onCheck={() => toggle(mk("parent", p._id))} />
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* No-team players */}
              {noTeamPlayers.length > 0 && (() => {
                const vis = noTeamPlayers.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
                if (vis.length === 0) return null;
                const ntKeys = visiblePlayerKeys(vis.filter((p) => p.email));
                const ntChecked = ntKeys.length > 0 && ntKeys.every((k) => selected.has(k));
                return (
                  <div>
                    <GroupRow label={t("noTeam")} count={vis.length}
                      checked={ntChecked} onCheck={() => toggleAll(ntKeys)}
                      isExpanded={expanded.has("team:none")} onExpand={() => toggleExp("team:none")} />
                    {expanded.has("team:none") && renderPlayerList(vis, "ml-4 mb-1")}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <span className="text-sm text-gray-500">{t("selectedCount", { count: selected.size })}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
              {t("cancel")}
            </button>
            <button onClick={handleConfirm} disabled={selected.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {t("done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupRow({ label, count, checked, onCheck, isExpanded, onExpand }) {
  return (
    <div className="flex items-center bg-white border rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 flex-1 cursor-pointer select-none" onClick={onExpand}>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className="text-xs text-gray-400">({count})</span>
      </div>
      <input type="checkbox" checked={checked}
        onChange={(e) => { e.stopPropagation(); onCheck(); }}
        onClick={(e) => e.stopPropagation()}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
    </div>
  );
}

function SubGroupRow({ label, count, checked, onCheck, isExpanded, onExpand }) {
  return (
    <div className="flex items-center bg-gray-50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 flex-1 cursor-pointer select-none" onClick={onExpand}>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm text-gray-900">{label}</span>
        <span className="text-xs text-gray-400">({count})</span>
      </div>
      <input type="checkbox" checked={checked}
        onChange={(e) => { e.stopPropagation(); onCheck(); }}
        onClick={(e) => e.stopPropagation()}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
    </div>
  );
}

function PersonRow({ name, email, checked, onCheck }) {
  return (
    <label className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-900">{name}</span>
        <span className="text-xs text-gray-400 ml-2 truncate">{email}</span>
      </div>
      <input type="checkbox" checked={checked} onChange={onCheck}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0" />
    </label>
  );
}

function AddEmailRow({ player, onSaved, t }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const email = value.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t("invalidEmail"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/players/${player._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        onSaved(player._id, email);
        setEditing(false);
      } else {
        const d = await res.json();
        setError(d.error || t("saveFailed"));
      }
    } catch {
      setError(t("saveFailed"));
    }
    setSaving(false);
  }

  const name = `${player.firstName} ${player.lastName}`;

  if (!editing) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-gray-50">
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-900">{name}</span>
          <span className="text-xs text-gray-300 ml-2">{t("noEmail")}</span>
        </div>
        <button onClick={() => setEditing(true)}
          className="text-xs text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 rounded px-2 py-0.5 hover:bg-blue-50 transition flex-shrink-0">
          + {t("addEmailBtn")}
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-1.5 rounded bg-blue-50/50">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-900 flex-shrink-0">{name}</span>
        <input type="email" value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") setEditing(false); }}
          placeholder="email@example.com" autoFocus
          className="flex-1 min-w-0 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <button onClick={save} disabled={saving}
          className="text-xs font-medium text-white bg-blue-600 rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
          {saving ? "..." : t("saveBtn")}
        </button>
        <button onClick={() => setEditing(false)}
          className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">&times;</button>
      </div>
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}
