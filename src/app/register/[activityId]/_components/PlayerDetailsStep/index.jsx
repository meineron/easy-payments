import PhonePrefixInput from "@/components/PhonePrefixInput";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import { centsToDisplay } from "@/shared/utils/formatting";

export default function PlayerDetailsStep({
  player,
  setPlayer,
  formData,
  setFormData,
  playerCustomFields,
  teams,
  initialOrder,
  activity,
  teamId,
  onTeamChange,
  subscriptionId,
  onSubChange,
  availableSubs,
  savingDraft,
  onBack,
  onContinue,
  t,
  tc,
}) {
  const continueDisabled =
    savingDraft ||
    !player.firstName ||
    !player.lastName ||
    !player.gender ||
    !player.dob ||
    playerCustomFields.some((f) => f.required && !formData[f.key]);

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-gray-900">{t("playerDetails")}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("firstNameRequired")}</label>
          <input
            value={player.firstName}
            onChange={(e) => setPlayer({ ...player, firstName: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("lastNameRequired")}</label>
          <input
            value={player.lastName}
            onChange={(e) => setPlayer({ ...player, lastName: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("dobRequired")}</label>
          <input
            type="date"
            value={player.dob}
            onChange={(e) => setPlayer({ ...player, dob: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("genderRequired")}</label>
          <select
            value={player.gender}
            onChange={(e) => setPlayer({ ...player, gender: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">{t("select")}</option>
            <option value="Male">{t("male")}</option>
            <option value="Female">{t("female")}</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("phone")}</label>
          <PhonePrefixInput
            prefix={player.phonePrefix}
            phone={player.phone}
            onPrefixChange={(v) => setPlayer({ ...player, phonePrefix: v })}
            onPhoneChange={(v) => setPlayer({ ...player, phone: v })}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("email")}</label>
          <input
            type="email"
            value={player.email}
            onChange={(e) => setPlayer({ ...player, email: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {playerCustomFields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs text-gray-500 mb-1 text-start">
            {field.label}{field.required ? " *" : ""}
          </label>
          {field.type === "textarea" ? (
            <textarea
              value={formData[field.key] || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px]"
              placeholder={field.description || ""}
            />
          ) : field.type === "dropdown_single" ? (
            <select
              value={formData[field.key] || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t("select")}</option>
              {(field.options || []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.type === "multichoice_checkbox" ? (
            <div className="space-y-1.5">
              {(field.options || []).map((opt) => {
                const vals = formData[field.key] || [];
                const checked = Array.isArray(vals) ? vals.includes(opt) : false;
                return (
                  <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setFormData((prev) => {
                          const cur = Array.isArray(prev[field.key]) ? [...prev[field.key]] : [];
                          if (e.target.checked) cur.push(opt);
                          else {
                            const idx = cur.indexOf(opt);
                            if (idx !== -1) cur.splice(idx, 1);
                          }
                          return { ...prev, [field.key]: cur };
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          ) : (
            <input
              type={field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
              value={formData[field.key] || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder={field.description || ""}
            />
          )}
        </div>
      ))}

      {teams.length > 0 && !initialOrder?.teamId && (
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("teamRequired")}</label>
          <select value={teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">{t("selectTeam")}</option>
            {teams.map((tm, idx) => {
              const id = tm.teamId?._id || tm.teamId;
              if (!id) return null;
              return (
                <option key={activityTeamSlotKey({ teamId: id }, idx)} value={String(id)}>
                  {tm.name} ({tm.season})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {activity?.hasPayment && availableSubs.length > 1 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1 text-start">{t("subscriptionRequired")}</label>
          <select value={subscriptionId} onChange={(e) => onSubChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">{t("selectSubscription")}</option>
            {availableSubs.map((s) => (
              <option key={s._id} value={s._id}>
                {s.title}
                {s.priceCents ? ` — $${centsToDisplay(s.priceCents)}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
          {tc("back")}
        </button>
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {savingDraft ? tc("saving") : tc("continue")}
        </button>
      </div>
    </div>
  );
}
