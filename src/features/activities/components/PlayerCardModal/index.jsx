"use client";

import { useRef, useState } from "react";
import Modal from "@/shared/components/Modal";
import PhonePrefixInput from "@/components/PhonePrefixInput";
import { formatDob, dobToInputValue } from "@/lib/dob";

export default function PlayerCardModal({ player, activityId, onClose, onUpdated, tc, td }) {
  return (
    <Modal open onClose={onClose} size="lg" ariaLabel={td("playerCard")}>
      <Modal.Header title={td("playerCard")} onClose={onClose} />
      {/* Modal owns the chrome padding; PlayerCardContent itself is padding-free
          so the mobile card tab can render it edge-to-edge inside the card body. */}
      <div className="p-6">
        <PlayerCardContent
          player={player}
          activityId={activityId}
          onClose={onClose}
          onUpdated={onUpdated}
          tc={tc}
          td={td}
        />
      </div>
    </Modal>
  );
}

/**
 * Inline body of the player card UI: player details + parents (with edit / replace / link / create flows).
 *
 * Used in three surfaces:
 *  - `PlayerCardModal` (desktop modal, this file) — wraps this in a `<Modal>` and renders both sections (`section="all"`, default).
 *  - The mobile per-row **Player** tab inside `ParticipantsTab` — passes `section="player"` to render only the player details.
 *  - The mobile per-row **Parents** tab inside `ParticipantsTab` — passes `section="parents"` to render only the parents list.
 *
 * `onClose` is invoked after a successful save; the modal uses it to dismiss, the tabs pass a no-op so they stay open.
 */
export function PlayerCardContent({ player, activityId, onClose, onUpdated, tc, td, section = "all" }) {
  const showPlayerSection = section === "all" || section === "player";
  const showParentsSection = section === "all" || section === "parents";
  const isFromOrder = player._fromOrder;
  const [editingParentIdx, setEditingParentIdx] = useState(null);
  const [parentForm, setParentForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(false);
  const [playerForm, setPlayerForm] = useState(null);

  const [addingParent, setAddingParent] = useState(false);
  const [parentSearchQuery, setParentSearchQuery] = useState("");
  const [parentSearchResults, setParentSearchResults] = useState([]);
  const [parentSearchLoading, setParentSearchLoading] = useState(false);
  const [newParentMode, setNewParentMode] = useState(false);
  const [newParentForm, setNewParentForm] = useState({ firstName: "", lastName: "", email: "", phonePrefix: "+1", phone: "" });

  function startEditPlayer() {
    if (isFromOrder) {
      setPlayerForm({
        firstName: player.playerFirstName || "",
        lastName: player.playerLastName || "",
        dateOfBirth: dobToInputValue(player.playerDob),
        gender: player.playerGender || "",
        phonePrefix: player.playerPhonePrefix || "+1",
        phoneNumber: player.playerPhone || "",
        email: player.playerEmail || "",
      });
    } else {
      setPlayerForm({
        firstName: player.firstName || "",
        lastName: player.lastName || "",
        dateOfBirth: dobToInputValue(player.dateOfBirth),
        gender: player.gender || "",
        phonePrefix: player.phonePrefix || "+1",
        phoneNumber: player.phoneNumber || "",
        email: player.email || "",
      });
    }
    setEditingPlayer(true);
    setError("");
  }

  async function savePlayerEdit() {
    setSaving(true);
    setError("");
    try {
      if (isFromOrder) {
        const res = await fetch(`/api/activities/${activityId}/orders/${player.orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerFirstName: playerForm.firstName,
            playerLastName: playerForm.lastName,
            playerDob: playerForm.dateOfBirth || null,
            playerGender: playerForm.gender,
            playerPhonePrefix: playerForm.phonePrefix,
            playerPhone: playerForm.phoneNumber,
            playerEmail: playerForm.email,
          }),
        });
        if (!res.ok) { setError(tc("failedToSave")); return; }
      } else {
        const res = await fetch(`/api/players/${player._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(playerForm),
        });
        if (!res.ok) { setError(tc("failedToSave")); return; }
      }
      setEditingPlayer(false);
      onUpdated();
      onClose();
    } catch {
      setError(tc("somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  function startEditParent(idx) {
    const p = isFromOrder ? player.parents[idx] : player.parents[idx];
    if (!p) return;
    setParentForm({
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      email: p.email || "",
      phonePrefix: p.phonePrefix || "+1",
      phone: p.phone || "",
    });
    setEditingParentIdx(idx);
    setError("");
    setConfirmAction(null);
  }

  async function saveParentEdit(action) {
    if (!parentForm) return;
    setSaving(true);
    setError("");
    try {
      if (isFromOrder) {
        const field = editingParentIdx === 0 ? "parent1" : "parent2";
        const body = {};
        body[`${field}FirstName`] = parentForm.firstName;
        body[`${field}LastName`] = parentForm.lastName;
        body[`${field}Email`] = parentForm.email;
        body[`${field}PhonePrefix`] = parentForm.phonePrefix;
        body[`${field}Phone`] = parentForm.phone;
        const res = await fetch(`/api/activities/${activityId}/orders/${player.orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
      } else {
        const parentDoc = player.parents[editingParentIdx];
        if (!parentDoc?._id) { setError(tc("failedToSave")); setSaving(false); return; }

        if (action === "edit") {
          const res = await fetch(`/api/parents/${parentDoc._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parentForm),
          });
          if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
        } else if (action === "replace") {
          const res = await fetch(`/api/parents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...parentForm,
              phone: parentForm.phone || "0000000000",
            }),
          });
          const data = await res.json();
          if (!res.ok) { setError(data.error || tc("failedToSave")); setSaving(false); return; }
          const newParentId = data.parent._id;
          const newParentIds = player.parents.map((p, i) =>
            i === editingParentIdx ? newParentId : (p._id || p)
          );
          await fetch(`/api/players/${player._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parentIds: newParentIds }),
          });
        }
      }
      setEditingParentIdx(null);
      setParentForm(null);
      setConfirmAction(null);
      onUpdated();
      onClose();
    } catch {
      setError(tc("somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  function handleSaveParentClick() {
    if (isFromOrder) {
      saveParentEdit("edit");
      return;
    }
    setConfirmAction(true);
  }

  const searchTimerRef = useRef(null);
  function handleParentSearch(q) {
    setParentSearchQuery(q);
    setNewParentMode(false);
    clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setParentSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setParentSearchLoading(true);
      try {
        const res = await fetch(`/api/parents?search=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        const existingIds = (player.parents || []).map((p) => p._id?.toString?.() || p.toString());
        setParentSearchResults((data.parents || []).filter((p) => !existingIds.includes(p._id)));
      } catch { setParentSearchResults([]); }
      setParentSearchLoading(false);
    }, 300);
  }

  async function linkExistingParent(parentDoc) {
    setSaving(true);
    setError("");
    try {
      if (isFromOrder) {
        const slot = !player.parents?.length ? "parent1" : "parent2";
        const body = {};
        body[`${slot}FirstName`] = parentDoc.firstName;
        body[`${slot}LastName`] = parentDoc.lastName;
        body[`${slot}Email`] = parentDoc.email;
        body[`${slot}PhonePrefix`] = parentDoc.phonePrefix || "+1";
        body[`${slot}Phone`] = parentDoc.phone;
        const res = await fetch(`/api/activities/${activityId}/orders/${player.orderId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
      } else {
        const newIds = [...(player.parents || []).map((p) => p._id || p), parentDoc._id];
        const res = await fetch(`/api/players/${player._id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentIds: newIds }),
        });
        if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
      }
      setAddingParent(false);
      setParentSearchQuery("");
      setParentSearchResults([]);
      onUpdated();
      onClose();
    } catch { setError(tc("somethingWentWrong")); }
    setSaving(false);
  }

  async function createAndLinkParent() {
    if (!newParentForm.firstName || !newParentForm.lastName || !newParentForm.email || !newParentForm.phone) {
      setError(tc("required")); return;
    }
    setSaving(true);
    setError("");
    try {
      const createRes = await fetch("/api/parents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newParentForm),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setError(createData.error || tc("failedToSave")); setSaving(false); return; }
      await linkExistingParent(createData.parent);
    } catch { setError(tc("somethingWentWrong")); setSaving(false); }
  }

  const pName = isFromOrder
    ? `${player.playerFirstName} ${player.playerLastName}`
    : `${player.firstName} ${player.lastName}`;
  const pDob = isFromOrder ? player.playerDob : player.dateOfBirth;
  const pGender = isFromOrder ? player.playerGender : player.gender;
  const pPhone = isFromOrder ? player.playerPhone : player.phoneNumber;
  const pPhonePrefix = isFromOrder ? player.playerPhonePrefix : player.phonePrefix;
  const pEmail = isFromOrder ? player.playerEmail : player.email;
  const parents = player.parents || [];

  return (
    <div className="space-y-5">
          {/* Player Details — gated on `section` prop so the mobile Player tab can show only this block. */}
          {showPlayerSection && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">{td("playerDetails")}</h4>
              {!editingPlayer && (
                <button onClick={startEditPlayer} className="text-gray-400 hover:text-blue-600 transition" title={tc("edit")}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </div>
            {editingPlayer && playerForm ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("firstName")}</label>
                    <input value={playerForm.firstName} onChange={(e) => setPlayerForm((p) => ({ ...p, firstName: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("lastName")}</label>
                    <input value={playerForm.lastName} onChange={(e) => setPlayerForm((p) => ({ ...p, lastName: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{td("dateOfBirth")}</label>
                    <input type="date" value={playerForm.dateOfBirth} onChange={(e) => setPlayerForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{td("gender")}</label>
                    <select value={playerForm.gender} onChange={(e) => setPlayerForm((p) => ({ ...p, gender: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">—</option><option value="Male">{td("male")}</option><option value="Female">{td("female")}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("phone")}</label>
                    <PhonePrefixInput prefix={playerForm.phonePrefix} phone={playerForm.phoneNumber}
                      onPrefixChange={(v) => setPlayerForm((p) => ({ ...p, phonePrefix: v }))}
                      onPhoneChange={(v) => setPlayerForm((p) => ({ ...p, phoneNumber: v }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("email")}</label>
                    <input type="email" value={playerForm.email} onChange={(e) => setPlayerForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEditingPlayer(false); setPlayerForm(null); }}
                    className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("cancel")}</button>
                  <button onClick={savePlayerEdit} disabled={saving}
                    className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? tc("saving") : tc("save")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-gray-900 text-base">{pName}</p>
                {pDob && <p className="text-gray-500">{td("dateOfBirth")}: {formatDob(pDob)}</p>}
                {pGender && <p className="text-gray-500">{td("gender")}: {pGender}</p>}
                {pPhone && <p className="text-gray-500" dir="ltr">{tc("phone")}: {pPhonePrefix} {pPhone}</p>}
                {pEmail && <p className="text-gray-500">{tc("email")}: {pEmail}</p>}
              </div>
            )}
          </div>
          )}

          {/* Parents — gated on `section` prop so the mobile Parents tab can show only this block.
              All editing flows (edit existing, search & link, replace, create new) live in here. */}
          {showParentsSection && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">{td("parents")} ({parents.length})</h4>
              {parents.length < 2 && !addingParent && editingParentIdx === null && (
                <button onClick={() => { setAddingParent(true); setNewParentMode(false); setParentSearchQuery(""); setParentSearchResults([]); setError(""); }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800">+ {td("addParent")}</button>
              )}
            </div>
            {parents.length === 0 && !addingParent ? (
              <p className="text-sm text-gray-400">{td("noParentsOnRecord")}</p>
            ) : (
              <div className="space-y-3">
                {parents.map((parent, idx) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        {idx === 0 ? td("parent1Title") : td("parent2Title")}
                      </span>
                      {editingParentIdx !== idx && (
                        <button onClick={() => startEditParent(idx)} className="text-gray-400 hover:text-blue-600 transition" title={tc("edit")}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      )}
                    </div>
                    {editingParentIdx === idx && parentForm ? (
                      <div className="space-y-3 mt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("firstName")}</label>
                            <input value={parentForm.firstName} onChange={(e) => setParentForm((p) => ({ ...p, firstName: e.target.value }))}
                              className="w-full border rounded-lg px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("lastName")}</label>
                            <input value={parentForm.lastName} onChange={(e) => setParentForm((p) => ({ ...p, lastName: e.target.value }))}
                              className="w-full border rounded-lg px-3 py-2 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("phone")}</label>
                            <PhonePrefixInput prefix={parentForm.phonePrefix} phone={parentForm.phone}
                              onPrefixChange={(v) => setParentForm((p) => ({ ...p, phonePrefix: v }))}
                              onPhoneChange={(v) => setParentForm((p) => ({ ...p, phone: v }))} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("email")}</label>
                            <input type="email" value={parentForm.email} onChange={(e) => setParentForm((p) => ({ ...p, email: e.target.value }))}
                              className="w-full border rounded-lg px-3 py-2 text-sm" />
                          </div>
                        </div>

                        {confirmAction ? (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-gray-900 mb-2">{td("parentEditConfirm")}</p>
                            <div className="flex flex-col gap-2">
                              <button onClick={() => saveParentEdit("edit")} disabled={saving}
                                className="w-full px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                {td("editCurrentParent")}
                              </button>
                              <button onClick={() => saveParentEdit("replace")} disabled={saving}
                                className="w-full px-3 py-2 text-sm text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                                {td("replaceWithNewParent")}
                              </button>
                              <button onClick={() => { setConfirmAction(null); }}
                                className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">{tc("cancel")}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => { setEditingParentIdx(null); setParentForm(null); setConfirmAction(null); }}
                              className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("cancel")}</button>
                            <button onClick={handleSaveParentClick} disabled={saving}
                              className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                              {saving ? tc("saving") : tc("save")}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{parent.firstName} {parent.lastName}</p>
                        {parent.email && <p className="text-xs text-gray-500 mt-0.5">{parent.email}</p>}
                        {parent.phone && <p className="text-xs text-gray-500" dir="ltr">{parent.phonePrefix || "+1"} {parent.phone}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {addingParent && (
              <div className="mt-3 border rounded-lg p-3 bg-blue-50/50">
                {!newParentMode ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={parentSearchQuery}
                        onChange={(e) => handleParentSearch(e.target.value)}
                        placeholder={td("searchParentPlaceholder")}
                        className="w-full border rounded-lg px-3 py-2 text-sm pr-8"
                        autoFocus
                      />
                      {parentSearchLoading && (
                        <span className="absolute right-3 top-2.5 text-xs text-gray-400">...</span>
                      )}
                    </div>

                    {parentSearchQuery.trim() && parentSearchResults.length > 0 && (
                      <div className="border rounded-lg bg-white max-h-48 overflow-y-auto divide-y">
                        {parentSearchResults.map((p) => (
                          <div key={p._id} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                            <div className="text-sm min-w-0">
                              <p className="font-medium text-gray-900 truncate">{p.firstName} {p.lastName}</p>
                              <p className="text-xs text-gray-500 truncate">{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                            </div>
                            <button onClick={() => linkExistingParent(p)} disabled={saving}
                              className="shrink-0 ml-2 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                              {td("linkParent")}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {parentSearchQuery.trim() && !parentSearchLoading && parentSearchResults.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">{td("noParentsFound")}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setAddingParent(false); setParentSearchQuery(""); setParentSearchResults([]); }}
                        className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("cancel")}</button>
                      <button onClick={() => { setNewParentMode(true); setNewParentForm({ firstName: "", lastName: "", email: "", phonePrefix: "+1", phone: "" }); }}
                        className="flex-1 px-3 py-1.5 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">
                        + {td("createNewParent")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-600 uppercase">{td("createNewParent")}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("firstName")} *</label>
                        <input value={newParentForm.firstName} onChange={(e) => setNewParentForm((p) => ({ ...p, firstName: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("lastName")} *</label>
                        <input value={newParentForm.lastName} onChange={(e) => setNewParentForm((p) => ({ ...p, lastName: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("phone")} *</label>
                        <PhonePrefixInput prefix={newParentForm.phonePrefix} phone={newParentForm.phone}
                          onPrefixChange={(v) => setNewParentForm((p) => ({ ...p, phonePrefix: v }))}
                          onPhoneChange={(v) => setNewParentForm((p) => ({ ...p, phone: v }))} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("email")} *</label>
                        <input type="email" value={newParentForm.email} onChange={(e) => setNewParentForm((p) => ({ ...p, email: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setNewParentMode(false)}
                        className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("back")}</button>
                      <button onClick={createAndLinkParent} disabled={saving}
                        className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {saving ? tc("saving") : tc("save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">{error}</div>}
    </div>
  );
}
