import PhonePrefixInput from "@/components/PhonePrefixInput";

export default function ParentDetailsStep({ parent1, setParent1, parent2, setParent2, onContinue, t, tc }) {
  const canContinue =
    !!parent1.firstName && !!parent1.lastName && !!parent1.phone && !!parent1.email;

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-gray-900">{t("parentGuardian")}</h3>
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-1">{t("parent1Required")}</h4>
        <p className="text-xs text-gray-400 mb-3">{t("parent1FillsHint")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("firstNameRequired")}</label>
            <input
              value={parent1.firstName}
              onChange={(e) => setParent1({ ...parent1, firstName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("lastNameRequired")}</label>
            <input
              value={parent1.lastName}
              onChange={(e) => setParent1({ ...parent1, lastName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("phoneRequired")}</label>
            <PhonePrefixInput
              prefix={parent1.phonePrefix}
              phone={parent1.phone}
              onPrefixChange={(v) => setParent1({ ...parent1, phonePrefix: v })}
              onPhoneChange={(v) => setParent1({ ...parent1, phone: v })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("emailRequired")}</label>
            <input
              type="email"
              value={parent1.email}
              onChange={(e) => setParent1({ ...parent1, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
      <hr />
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          {t("parent2Optional")} <span className="text-gray-400">({tc("optional")})</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("firstName")}</label>
            <input
              value={parent2.firstName}
              onChange={(e) => setParent2({ ...parent2, firstName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("lastName")}</label>
            <input
              value={parent2.lastName}
              onChange={(e) => setParent2({ ...parent2, lastName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("phone")}</label>
            <PhonePrefixInput
              prefix={parent2.phonePrefix}
              phone={parent2.phone}
              onPrefixChange={(v) => setParent2({ ...parent2, phonePrefix: v })}
              onPhoneChange={(v) => setParent2({ ...parent2, phone: v })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 text-start">{t("email")}</label>
            <input
              type="email"
              value={parent2.email}
              onChange={(e) => setParent2({ ...parent2, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {tc("continue")}
        </button>
      </div>
    </div>
  );
}
