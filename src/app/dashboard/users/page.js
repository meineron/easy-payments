"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

const PREDEFINED_ROLES = [
  "Coach", "Assistant Coach", "GK Coach", "Fitness Coach", "Scout",
  "Team Manager", "Doctor", "Physio Coach", "Analyst", "Nutritionist",
  "Organization Manager", "Mental Coach", "Association Admin",
];

const ROLE_I18N_MAP = {
  "Coach": "roleCoach",
  "Assistant Coach": "roleAssistantCoach",
  "GK Coach": "roleGKCoach",
  "Fitness Coach": "roleFitnessCoach",
  "Scout": "roleScout",
  "Team Manager": "roleTeamManager",
  "Doctor": "roleDoctor",
  "Physio Coach": "rolePhysioCoach",
  "Analyst": "roleAnalyst",
  "Nutritionist": "roleNutritionist",
  "Organization Manager": "roleOrgManager",
  "Mental Coach": "roleMentalCoach",
  "Association Admin": "roleAssociationAdmin",
  "custom": "roleCustom",
};

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-600",
  invited: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  disabled: "bg-red-100 text-red-600",
};

const STATUS_I18N = {
  draft: "statusDraft",
  invited: "statusInvited",
  active: "statusActive",
  disabled: "statusDisabled",
};

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phonePrefix: "+1",
  phone: "",
  mainRole: "",
  customRoleLabel: "",
  language: "en",
  teams: [],
};

export default function UsersPage() {
  const t = useTranslations("users");
  const tc = useTranslations("common");

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const [allTeams, setAllTeams] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formLoading, setFormLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [openActionMenu, setOpenActionMenu] = useState(null);
  const actionMenuRef = useRef(null);

  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setOpenActionMenu(null);
      }
    }
    if (openActionMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openActionMenu]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/club-users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  async function fetchTeams() {
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      setAllTeams(data.teams || []);
    } catch {
      /* ignore */
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  function getRoleLabel(user) {
    if (user.mainRole === "custom") return user.customRoleLabel || t("roleCustom");
    const key = ROLE_I18N_MAP[user.mainRole];
    return key ? t(key) : user.mainRole;
  }

  function openAddModal() {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEditModal(user) {
    setEditingUser(user);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phonePrefix: user.phonePrefix || "+1",
      phone: user.phone || "",
      mainRole: user.mainRole,
      customRoleLabel: user.customRoleLabel || "",
      language: user.language || "en",
      teams: (user.teams || []).map((t) => ({
        teamId: t.teamId?._id || t.teamId,
        role: t.role || "",
      })),
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingUser(null);
    setForm({ ...EMPTY_FORM });
  }

  async function handleSave(andInvite = false) {
    if (!form.firstName || !form.lastName || !form.email || !form.mainRole) return;
    setFormLoading(true);
    try {
      const url = editingUser ? `/api/club-users/${editingUser._id}` : "/api/club-users";
      const method = editingUser ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setToast({ message: err.error || t("failedToCreate"), type: "error" });
        setFormLoading(false);
        return;
      }
      const data = await res.json();
      const userId = editingUser ? editingUser._id : data.user?._id;

      if (andInvite && userId) {
        const invRes = await fetch(`/api/club-users/${userId}/invite`, { method: "POST" });
        if (invRes.ok) {
          setToast({ message: t("inviteSent"), type: "success" });
        } else {
          setToast({ message: t("inviteFailed"), type: "error" });
        }
      } else {
        setToast({ message: editingUser ? t("userSaved") : t("userCreated"), type: "success" });
      }

      closeModal();
      fetchUsers();
    } catch {
      setToast({ message: t("failedToCreate"), type: "error" });
    } finally {
      setFormLoading(false);
    }
  }

  async function handleInvite(userId) {
    try {
      const res = await fetch(`/api/club-users/${userId}/invite`, { method: "POST" });
      if (res.ok) {
        setToast({ message: t("inviteSent"), type: "success" });
        fetchUsers();
      } else {
        setToast({ message: t("inviteFailed"), type: "error" });
      }
    } catch {
      setToast({ message: t("inviteFailed"), type: "error" });
    }
    setConfirmAction(null);
  }

  async function handleResetPassword(userId) {
    try {
      const res = await fetch(`/api/club-users/${userId}/reset-password`, { method: "POST" });
      if (res.ok) {
        setToast({ message: t("resetSent"), type: "success" });
        fetchUsers();
      } else {
        setToast({ message: t("resetFailed"), type: "error" });
      }
    } catch {
      setToast({ message: t("resetFailed"), type: "error" });
    }
    setConfirmAction(null);
  }

  async function handleDelete(userId) {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/club-users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        fetchUsers();
      } else {
        setToast({ message: t("failedToDelete"), type: "error" });
      }
    } catch {
      setToast({ message: t("failedToDelete"), type: "error" });
    }
  }

  // Team assignment helpers
  function isTeamChecked(teamId) {
    return form.teams.some((t) => t.teamId === teamId);
  }

  function toggleTeam(teamId) {
    if (isTeamChecked(teamId)) {
      setForm((f) => ({ ...f, teams: f.teams.filter((t) => t.teamId !== teamId) }));
    } else {
      const defaultRole = form.mainRole === "custom" ? form.customRoleLabel : form.mainRole;
      setForm((f) => ({ ...f, teams: [...f.teams, { teamId, role: defaultRole || "" }] }));
    }
  }

  function setTeamRole(teamId, role) {
    setForm((f) => ({
      ...f,
      teams: f.teams.map((t) => (t.teamId === teamId ? { ...t, role } : t)),
    }));
  }

  function toggleAllTeams(checked) {
    if (checked) {
      const defaultRole = form.mainRole === "custom" ? form.customRoleLabel : form.mainRole;
      setForm((f) => ({
        ...f,
        teams: allTeams.map((t) => ({
          teamId: t._id,
          role: f.teams.find((ft) => ft.teamId === t._id)?.role || defaultRole || "",
        })),
      }));
    } else {
      setForm((f) => ({ ...f, teams: [] }));
    }
  }

  function setRoleForAllChecked(role) {
    setForm((f) => ({
      ...f,
      teams: f.teams.map((t) => ({ ...t, role })),
    }));
  }

  const allChecked = allTeams.length > 0 && form.teams.length === allTeams.length;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">{t("title")}</h2>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          {t("addUser")}
        </button>
      </div>

      {/* Search */}
      {users.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <p className="text-center text-gray-500 py-12">{t("loadingUsers")}</p>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">{t("noUsers")}</p>
          <p className="text-sm mt-1">{t("noUsersDesc")}</p>
        </div>
      ) : (
        /* Table */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-start py-3 px-4">{tc("name")}</th>
                <th className="text-start py-3 px-4">{tc("email")}</th>
                <th className="text-start py-3 px-4">{tc("phone")}</th>
                <th className="text-start py-3 px-4">{t("mainRole")}</th>
                <th className="text-start py-3 px-4">{t("teamsCount")}</th>
                <th className="text-start py-3 px-4">{tc("status")}</th>
                <th className="text-start py-3 px-4">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 transition">
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{u.email}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {u.phone ? `${u.phonePrefix || ""}${u.phone}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-gray-700">{getRoleLabel(u)}</td>
                  <td className="py-3 px-4 text-gray-600">{u.teams?.length || 0}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[u.status] || STATUS_COLORS.draft}`}>
                      {t(STATUS_I18N[u.status] || "statusDraft")}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="relative" ref={openActionMenu === u._id ? actionMenuRef : undefined}>
                      <button
                        onClick={() => setOpenActionMenu(openActionMenu === u._id ? null : u._id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                      >
                        {tc("actions")}
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {openActionMenu === u._id && (
                        <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                          <button
                            onClick={() => { openEditModal(u); setOpenActionMenu(null); }}
                            className="w-full text-start px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                          >
                            {tc("edit")}
                          </button>
                          <button
                            onClick={() => { setConfirmAction({ type: "invite", userId: u._id, name: `${u.firstName} ${u.lastName}` }); setOpenActionMenu(null); }}
                            className="w-full text-start px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                          >
                            {u.status === "invited" || u.status === "active" ? t("resendInvite") : t("invite")}
                          </button>
                          {(u.status === "invited" || u.status === "active") && (
                            <button
                              onClick={() => { setConfirmAction({ type: "reset", userId: u._id, name: `${u.firstName} ${u.lastName}` }); setOpenActionMenu(null); }}
                              className="w-full text-start px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                            >
                              {t("resetPassword")}
                            </button>
                          )}
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            onClick={() => { handleDelete(u._id); setOpenActionMenu(null); }}
                            className="w-full text-start px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                          >
                            {tc("delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm Action Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <p className="text-sm text-gray-700 mb-4">
              {confirmAction.type === "reset"
                ? t("resetConfirm")
                : `${t("invite")} ${confirmAction.name}?`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={() =>
                  confirmAction.type === "reset"
                    ? handleResetPassword(confirmAction.userId)
                    : handleInvite(confirmAction.userId)
                }
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                {confirmAction.type === "reset" ? t("resetPassword") : t("invite")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingUser ? t("editUserTitle") : t("addUserTitle")}
            </h3>

            <div className="space-y-4">
              {/* Main Role */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("mainRole")} *</label>
                <select
                  value={form.mainRole}
                  onChange={(e) => setForm((f) => ({ ...f, mainRole: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t("selectRole")}</option>
                  {PREDEFINED_ROLES.map((r) => (
                    <option key={r} value={r}>{t(ROLE_I18N_MAP[r])}</option>
                  ))}
                  <option value="custom">{t("roleCustom")}</option>
                </select>
              </div>

              {form.mainRole === "custom" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("customRoleLabel")} *</label>
                  <input
                    type="text"
                    value={form.customRoleLabel}
                    onChange={(e) => setForm((f) => ({ ...f, customRoleLabel: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t("customRolePlaceholder")}
                  />
                </div>
              )}

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{tc("firstName")} *</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{tc("lastName")} *</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">{tc("email")} *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">{tc("phone")}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.phonePrefix}
                    onChange={(e) => setForm((f) => ({ ...f, phonePrefix: e.target.value }))}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+1"
                  />
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("defaultLanguage")}</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="en">{t("english")}</option>
                  <option value="he">{t("hebrew")}</option>
                </select>
              </div>

              {/* Team Assignments */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">{t("teamAssignments")}</label>
                {allTeams.length === 0 ? (
                  <p className="text-xs text-gray-400">{t("noTeamsAvailable")}</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Header row */}
                    <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={(e) => toggleAllTeams(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        {allChecked ? t("deselectAll") : t("selectAll")}
                      </label>
                      <div className="flex-1" />
                      <div className="w-44">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) setRoleForAllChecked(e.target.value);
                          }}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none"
                        >
                          <option value="">{t("setRoleForAll")}</option>
                          {PREDEFINED_ROLES.map((r) => (
                            <option key={r} value={r}>{t(ROLE_I18N_MAP[r])}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {/* Team rows */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                      {allTeams.map((team) => {
                        const checked = isTeamChecked(team._id);
                        const teamEntry = form.teams.find((t) => t.teamId === team._id);
                        return (
                          <div key={team._id} className={`flex items-center gap-3 px-3 py-2 text-sm ${checked ? "bg-blue-50/50" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTeam(team._id)}
                              className="rounded border-gray-300"
                            />
                            <div className="flex-1 text-gray-800">
                              {team.name} <span className="text-xs text-gray-400">({team.season})</span>
                            </div>
                            <div className="w-44">
                              <select
                                value={teamEntry?.role || ""}
                                onChange={(e) => {
                                  if (!checked) toggleTeam(team._id);
                                  setTeamRole(team._id, e.target.value);
                                }}
                                disabled={!checked}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none disabled:opacity-40"
                              >
                                <option value="">{t("noRole")}</option>
                                {PREDEFINED_ROLES.map((r) => (
                                  <option key={r} value={r}>{t(ROLE_I18N_MAP[r])}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={closeModal}
                disabled={formLoading}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={formLoading || !form.firstName || !form.lastName || !form.email || !form.mainRole}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >
                {tc("save")}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={formLoading || !form.firstName || !form.lastName || !form.email || !form.mainRole}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {formLoading ? tc("saving") : t("saveAndInvite")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
