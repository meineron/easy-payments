const PHONE_PREFIXES = ["+1", "+44", "+972", "+61", "+49", "+33", "+34", "+39", "+81", "+86"];

export default function PhonePrefixInput({ prefix, phone, onPrefixChange, onPhoneChange, disabled, className = "", placeholder = "", required = false }) {
  return (
    <div className={`flex gap-1.5 ${className}`} dir="ltr">
      <select
        value={prefix || "+1"}
        onChange={(e) => onPrefixChange(e.target.value)}
        disabled={disabled}
        className="w-[76px] shrink-0 px-1.5 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
      >
        {PHONE_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input
        type="tel"
        value={phone || ""}
        onChange={(e) => onPhoneChange(e.target.value)}
        disabled={disabled}
        required={required}
        className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        placeholder={placeholder}
      />
    </div>
  );
}

export { PHONE_PREFIXES };
