import { useState, useEffect, useMemo, useCallback } from "react";

const PHONE_PREFIXES = ["+1", "+44", "+972", "+61", "+49", "+33", "+34", "+39", "+81", "+86"];

export default function RecipientPicker({ open, onClose, onConfirm, channel = "email", t }) {
  const [players, setPlayers] = useState([]);
  const [parents, setParents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [season, setSeason] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());

  const isSms = channel === "sms";

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/messages/recipients")
      .then((r) => r.json())
      .then((d) => { setPlayers(d.players || []); setParents(d.parents || []); setTeams(d.teams || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const updatePlayerField = useCallback((playerId, updates) => {
    setPlayers((prev) => prev.map((p) => String(p._id) === String(playerId) ? { ...p, ...updates } : p));
  }, []);

  const updateParentField = useCallback((parentId, updates) => {
    setParents((prev) => prev.map((p) => String(p._id) === String(parentId) ? { ...p, ...updates } : p));
    setPlayers((prev) => prev.map((pl) => ({
      ...pl,
      parents: (pl.parents || []).map((par) =>
        typeof par === "object" && String(par._id) === String(parentId) ? { ...par, ...updates } : par
      ),
    })));
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
          if (parObj && !result[tid].parentIds.has(String(parObj._id))) {
            result[tid].parentIds.add(String(parObj._id));
            result[tid].parents.push(parObj);
          }
        }
      }
    }
    return result;
  }, [players, filteredTeamIds]);

  const allPlayers = useMemo(() => players, [players]);
  const filteredParents = useMemo(() => parents, [parents]);

  const noTeamPlayers = useMemo(() => {
    return players.filter((p) => {
      const pTeams = (p.teams || []).filter((pt) => filteredTeamIds.has(String(pt.teamId?._id || pt.teamId)));
      return pTeams.length === 0 && season === "all";
    });
  }, [players, filteredTeamIds, season]);

  const lc = search.toLowerCase();
  function matches(name, extra) {
    if (!lc) return true;
    return name.toLowerCase().includes(lc) || (extra || "").toLowerCase().includes(lc);
  }

  function hasContact(person, type) {
    if (type === "player") {
      return isSms ? !!(person.phonePrefix && person.phoneNumber) : !!person.email;
    }
    return isSms ? !!(person.phonePrefix && person.phone) : !!person.email;
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

  function selectablePlayerKeys(list) {
    return list.filter((p) => hasContact(p, "player") && matches(`${p.firstName} ${p.lastName}`, p.email || "")).map((p) => mk("player", p._id));
  }
  function selectableParentKeys(list) {
    return list.filter((p) => hasContact(p, "parent") && matches(`${p.firstName} ${p.lastName}`, p.email || "")).map((p) => mk("parent", p._id));
  }
  function teamAllKeys(tid) {
    const td = teamData[tid];
    if (!td) return [];
    return [...selectablePlayerKeys(td.players), ...selectableParentKeys(td.parents)];
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
        if (!p) continue;
        result.push({
          type: "player", id: p._id,
          name: `${p.firstName} ${p.lastName}`,
          email: p.email || "",
          phonePrefix: p.phonePrefix || "+1",
          phone: p.phoneNumber || "",
        });
      } else {
        const p = parents.find((pa) => String(pa._id) === id);
        if (!p) continue;
        result.push({
          type: "parent", id: p._id,
          name: `${p.firstName} ${p.lastName}`,
          email: p.email || "",
          phonePrefix: p.phonePrefix || "+1",
          phone: p.phone || "",
        });
      }
    }
    onConfirm(result);
    onClose();
  }

  if (!open) return null;

  const visibleAllPlayers = allPlayers.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
  const visibleAllParents = filteredParents.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
  const allPlayerKeys = selectablePlayerKeys(allPlayers);
  const allParentKeys = selectableParentKeys(filteredParents);
  const allPlayersChecked = allPlayerKeys.length > 0 && allPlayerKeys.every((k) => selected.has(k));
  const allParentsChecked = allParentKeys.length > 0 && allParentKeys.every((k) => selected.has(k));

  function renderPlayerList(list, indent) {
    const visible = list.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
    return (
      <div className={`${indent} space-y-0.5`}>
        {visible.map((p) => (
          <PersonRow key={p._id} person={p} personType="player"
            checked={selected.has(mk("player", p._id))}
            canCheck={hasContact(p, "player")}
            onCheck={() => toggle(mk("player", p._id))}
            onUpdate={(updates) => updatePlayerField(p._id, updates)}
            isSms={isSms} t={t} />
        ))}
      </div>
    );
  }

  function renderParentList(list, indent) {
    const visible = list.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
    return (
      <div className={`${indent} space-y-0.5`}>
        {visible.map((p) => (
          <PersonRow key={p._id} person={p} personType="parent"
            checked={selected.has(mk("parent", p._id))}
            canCheck={hasContact(p, "parent")}
            onCheck={() => toggle(mk("parent", p._id))}
            onUpdate={(updates) => updateParentField(p._id, updates)}
            isSms={isSms} t={t} />
        ))}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t("addRecipients")}</h3>
            <p className="text-sm text-gray-500">{t("addRecipientsHint")}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

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

        <div className="flex-1 overflow-y-auto px-6 pb-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              <GroupRow label={t("players")} count={visibleAllPlayers.length}
                checked={allPlayersChecked} onCheck={() => toggleAll(allPlayerKeys)}
                isExpanded={expanded.has("allPlayers")} onExpand={() => toggleExp("allPlayers")} />
              {expanded.has("allPlayers") && renderPlayerList(allPlayers, "ml-4 mb-2")}

              <GroupRow label={t("parentGroup")} count={visibleAllParents.length}
                checked={allParentsChecked} onCheck={() => toggleAll(allParentKeys)}
                isExpanded={expanded.has("allParents")} onExpand={() => toggleExp("allParents")} />
              {expanded.has("allParents") && renderParentList(filteredParents, "ml-4 mb-2")}

              {filteredTeams.length > 0 && <div className="border-t my-3" />}

              {filteredTeams.map((team) => {
                const td = teamData[String(team._id)];
                if (!td || td.players.length === 0) return null;
                const tPlayersVis = td.players.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
                const tParentsVis = td.parents.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
                const totalCount = tPlayersVis.length + tParentsVis.length;
                if (totalCount === 0) return null;

                const allKeys = teamAllKeys(String(team._id));
                const allTeamChecked = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
                const teamGk = `team:${team._id}`;
                const pGk = `${teamGk}:players`;
                const parGk = `${teamGk}:parents`;

                const teamPlayerKeys = selectablePlayerKeys(td.players);
                const teamParentKeys = selectableParentKeys(td.parents);
                const teamPlayersChecked = teamPlayerKeys.length > 0 && teamPlayerKeys.every((k) => selected.has(k));
                const teamParentsChecked = teamParentKeys.length > 0 && teamParentKeys.every((k) => selected.has(k));

                return (
                  <div key={team._id}>
                    <GroupRow label={team.name} count={totalCount}
                      checked={allTeamChecked} onCheck={() => toggleAll(allKeys)}
                      isExpanded={expanded.has(teamGk)} onExpand={() => toggleExp(teamGk)} />

                    {expanded.has(teamGk) && (
                      <div className="ml-4 space-y-1 mt-1 mb-2">
                        {tPlayersVis.length > 0 && (
                          <>
                            <SubGroupRow label={t("players")} count={tPlayersVis.length}
                              checked={teamPlayersChecked} onCheck={() => toggleAll(teamPlayerKeys)}
                              isExpanded={expanded.has(pGk)} onExpand={() => toggleExp(pGk)} />
                            {expanded.has(pGk) && renderPlayerList(
                              td.players.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || "")),
                              "ml-6"
                            )}
                          </>
                        )}
                        {tParentsVis.length > 0 && (
                          <>
                            <SubGroupRow label={t("parentGroup")} count={tParentsVis.length}
                              checked={teamParentsChecked} onCheck={() => toggleAll(teamParentKeys)}
                              isExpanded={expanded.has(parGk)} onExpand={() => toggleExp(parGk)} />
                            {expanded.has(parGk) && renderParentList(
                              td.parents.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || "")),
                              "ml-6"
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {noTeamPlayers.length > 0 && (() => {
                const vis = noTeamPlayers.filter((p) => matches(`${p.firstName} ${p.lastName}`, p.email || ""));
                if (vis.length === 0) return null;
                const ntKeys = selectablePlayerKeys(vis);
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

function PersonRow({ person, personType, checked, canCheck, onCheck, onUpdate, isSms, t }) {
  const name = `${person.firstName} ${person.lastName}`;
  const phoneField = personType === "player" ? "phoneNumber" : "phone";
  const phone = person[phoneField] || "";
  const prefix = person.phonePrefix || "+1";
  const email = person.email || "";
  const hasPhone = !!phone;
  const hasEmail = !!email;

  const [editingPhone, setEditingPhone] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [phoneVal, setPhoneVal] = useState(phone);
  const [prefixVal, setPrefixVal] = useState(prefix);
  const [emailVal, setEmailVal] = useState(email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const initials = (person.firstName?.[0] || "?").toUpperCase();

  async function savePhone() {
    if (!phoneVal.trim()) { setError(t("phoneRequired")); return; }
    setSaving(true);
    setError("");
    try {
      const url = personType === "player" ? `/api/players/${person._id}` : `/api/parents/${person._id}`;
      const body = personType === "player"
        ? { phonePrefix: prefixVal, phoneNumber: phoneVal.trim() }
        : { phonePrefix: prefixVal, phone: phoneVal.trim() };
      const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        onUpdate(body);
        setEditingPhone(false);
      } else {
        const d = await res.json();
        setError(d.error || t("saveFailed"));
      }
    } catch { setError(t("saveFailed")); }
    setSaving(false);
  }

  async function saveEmail() {
    const em = emailVal.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError(t("invalidEmail")); return; }
    setSaving(true);
    setError("");
    try {
      const url = personType === "player" ? `/api/players/${person._id}` : `/api/parents/${person._id}`;
      const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) });
      if (res.ok) {
        onUpdate({ email: em });
        setEditingEmail(false);
      } else {
        const d = await res.json();
        setError(d.error || t("saveFailed"));
      }
    } catch { setError(t("saveFailed")); }
    setSaving(false);
  }

  if (editingPhone) {
    return (
      <div className="px-3 py-2 rounded bg-blue-50/50 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-900 font-medium flex-shrink-0">{name}</span>
        </div>
        <div className="flex items-center gap-1.5" dir="ltr">
          <select value={prefixVal} onChange={(e) => setPrefixVal(e.target.value)}
            className="w-[72px] shrink-0 border rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
            {PHONE_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="tel" value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); savePhone(); } if (e.key === "Escape") setEditingPhone(false); }}
            placeholder="5551234567" autoFocus
            className="flex-1 min-w-0 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <button onClick={savePhone} disabled={saving}
            className="text-xs font-medium text-white bg-blue-600 rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
            {saving ? "..." : t("saveBtn")}
          </button>
          <button onClick={() => setEditingPhone(false)}
            className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">&times;</button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (editingEmail) {
    return (
      <div className="px-3 py-2 rounded bg-blue-50/50 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-900 font-medium flex-shrink-0">{name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <input type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEmail(); } if (e.key === "Escape") setEditingEmail(false); }}
            placeholder="email@example.com" autoFocus
            className="flex-1 min-w-0 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <button onClick={saveEmail} disabled={saving}
            className="text-xs font-medium text-white bg-blue-600 rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
            {saving ? "..." : t("saveBtn")}
          </button>
          <button onClick={() => setEditingEmail(false)}
            className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">&times;</button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center px-3 py-2 rounded hover:bg-gray-50 gap-2">
      <input type="checkbox" checked={checked} disabled={!canCheck}
        onChange={onCheck}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0 disabled:opacity-30" />

      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
        personType === "parent" ? "bg-purple-500" : "bg-gray-800"
      }`}>
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900">{name}</span>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {/* Phone info */}
          {hasPhone ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <PhoneIcon />
              <span dir="ltr">{prefix} {phone}</span>
              <button onClick={() => { setPhoneVal(phone); setPrefixVal(prefix); setEditingPhone(true); }}
                className="text-gray-300 hover:text-blue-500 transition ml-0.5">
                <PencilIcon />
              </button>
            </span>
          ) : (
            <button onClick={() => { setPhoneVal(""); setPrefixVal("+1"); setEditingPhone(true); }}
              className="inline-flex items-center gap-1 text-xs text-blue-600 border border-dashed border-blue-300 rounded px-1.5 py-0.5 hover:bg-blue-50 transition">
              <PhoneIcon /> + {t("addPhone")}
            </button>
          )}

          {/* Email info */}
          {hasEmail ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate">
              <EmailIcon />
              <span className="truncate">{email}</span>
              <button onClick={() => { setEmailVal(email); setEditingEmail(true); }}
                className="text-gray-300 hover:text-blue-500 transition ml-0.5 flex-shrink-0">
                <PencilIcon />
              </button>
            </span>
          ) : (
            <button onClick={() => { setEmailVal(""); setEditingEmail(true); }}
              className="inline-flex items-center gap-1 text-xs text-blue-600 border border-dashed border-blue-300 rounded px-1.5 py-0.5 hover:bg-blue-50 transition">
              <EmailIcon /> + {t("addEmailBtn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
    </svg>
  );
}
