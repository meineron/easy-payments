import { useState } from "react";
import Modal from "@/shared/components/Modal";
import PhonePrefixInput from "@/components/PhonePrefixInput";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import PriceInput from "@/features/activities/components/PriceInput";

export default function CreateOrderModal({ activityTeams, activitySubs, saving, onCreate, onClose, prefill, tc, td }) {
  const [tab, setTab] = useState("registration");
  const [form, setForm] = useState(() => {
    const defaults = {
      playerFirstName: "", playerLastName: "", playerDob: "", playerGender: "",
      playerPhonePrefix: "+1", playerPhone: "", playerEmail: "",
      parent1FirstName: "", parent1LastName: "", parent1PhonePrefix: "+1", parent1Phone: "", parent1Email: "",
      parent2FirstName: "", parent2LastName: "", parent2PhonePrefix: "+1", parent2Phone: "", parent2Email: "",
      teamId: "", subscriptionId: "", subscriptionTitle: "", subscriptionPriceCents: 0,
      items: [], paidCents: 0, status: "pending", playerId: null,
    };
    return prefill ? { ...defaults, ...prefill } : defaults;
  });

  function update(field, value) { setForm((p) => ({ ...p, [field]: value })); }
  function onTeamChange(teamId) {
    setForm((p) => {
      const sub = activitySubs.find((s) => s.id === p.subscriptionId);
      return { ...p, teamId, subscriptionPriceCents: sub?.priceCents || p.subscriptionPriceCents };
    });
  }
  function onSubChange(subId) {
    const sub = activitySubs.find((s) => s.id === subId);
    if (!sub) { setForm((p) => ({ ...p, subscriptionId: "", subscriptionTitle: "", subscriptionPriceCents: 0 })); return; }
    setForm((p) => ({ ...p, subscriptionId: subId, subscriptionTitle: sub.title, subscriptionPriceCents: sub.priceCents || 0 }));
  }

  const TABS = [
    { key: "registration", label: td("registration") },
    { key: "parents", label: td("parents") },
    { key: "invoice", label: td("invoice") },
  ];

  return (
    <Modal open onClose={onClose} size="2xl" ariaLabel={td("addRegistrationTitle")}>
      <Modal.Header title={td("addRegistrationTitle")} onClose={onClose} />
      <div className="border-b flex">
        {TABS.map((tabItem) => (
          <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === tabItem.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tabItem.label}
          </button>
        ))}
      </div>
      <div className="p-6">
        {tab === "registration" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")} *</label>
                <input value={form.playerFirstName} onChange={(e) => update("playerFirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")} *</label>
                <input value={form.playerLastName} onChange={(e) => update("playerLastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("dateOfBirth")}</label>
                <input type="date" value={form.playerDob} onChange={(e) => update("playerDob", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("gender")}</label>
                <select value={form.playerGender} onChange={(e) => update("playerGender", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">—</option><option value="Male">{td("male")}</option><option value="Female">{td("female")}</option>
                </select></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label>
                <PhonePrefixInput prefix={form.playerPhonePrefix} phone={form.playerPhone} onPrefixChange={(v) => update("playerPhonePrefix", v)} onPhoneChange={(v) => update("playerPhone", v)} /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label>
                <input value={form.playerEmail} onChange={(e) => update("playerEmail", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("team")}</label>
              <select value={form.teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">{td("noTeam")}</option>
                {activityTeams.map((team) => (
                  <option key={activityTeamSlotKey(team, team.slotIndex)} value={String(team.teamId)}>{team.name}</option>
                ))}
              </select></div>
          </div>
        )}
        {tab === "parents" && (
          <div className="space-y-5">
            <div><h4 className="text-sm font-semibold text-gray-700 mb-3">{td("parent1Title")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")}</label><input value={form.parent1FirstName} onChange={(e) => update("parent1FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")}</label><input value={form.parent1LastName} onChange={(e) => update("parent1LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label>
                  <PhonePrefixInput prefix={form.parent1PhonePrefix} phone={form.parent1Phone} onPrefixChange={(v) => update("parent1PhonePrefix", v)} onPhoneChange={(v) => update("parent1Phone", v)} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label><input value={form.parent1Email} onChange={(e) => update("parent1Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
            </div>
            <hr />
            <div><h4 className="text-sm font-semibold text-gray-700 mb-3">{td("parent2Title")} <span className="font-normal text-gray-400">{td("parent2Optional")}</span></h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")}</label><input value={form.parent2FirstName} onChange={(e) => update("parent2FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")}</label><input value={form.parent2LastName} onChange={(e) => update("parent2LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label>
                  <PhonePrefixInput prefix={form.parent2PhonePrefix} phone={form.parent2Phone} onPrefixChange={(v) => update("parent2PhonePrefix", v)} onPhoneChange={(v) => update("parent2Phone", v)} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label><input value={form.parent2Email} onChange={(e) => update("parent2Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
            </div>
          </div>
        )}
        {tab === "invoice" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("subscription")}</label>
                <select value={form.subscriptionId} onChange={(e) => onSubChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">{td("noSubscription")}</option>
                  {activitySubs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("subscriptionPrice")}</label>
                <PriceInput value={form.subscriptionPriceCents} onChange={(cents) => update("subscriptionPriceCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
          </div>
        )}
      </div>
      <Modal.Footer>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
        <button onClick={() => onCreate(form)} disabled={saving || !form.playerFirstName.trim() || !form.playerLastName.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? tc("creating") : tc("create")}</button>
      </Modal.Footer>
    </Modal>
  );
}
