import { useEffect, useRef, useState } from "react";

/**
 * Price input — text field that stores cents internally and shows two-decimal
 * dollars. Parent owns the cents value via the `value` prop and `onChange(cents)`.
 *
 * Domain-local because every consumer in the activities feature already deals
 * in cents via `centsToDisplay`/`displayToCents`. If a non-money decimal input
 * is needed elsewhere, that is a different primitive.
 */
export default function PriceInput({ value, onChange, className = "", placeholder = "0.00" }) {
  const [text, setText] = useState(() => {
    const n = (value || 0) / 100;
    return n === 0 ? "" : String(n);
  });
  const [focused, setFocused] = useState(false);
  const lastCents = useRef(value);

  useEffect(() => {
    if (!focused && value !== lastCents.current) {
      lastCents.current = value;
      const n = (value || 0) / 100;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preserve legacy two-way sync; refactor planned post-pilot
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

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
}
