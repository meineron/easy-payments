/**
 * Generic, framework-free formatting helpers shared across features.
 * Money is always cents (integers) — see AGENTS.md.
 */

export function centsToDisplay(c) {
  return ((c || 0) / 100).toFixed(2);
}

export function displayToCents(v) {
  return Math.round(parseFloat(v || 0) * 100);
}

export function fmtDate(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString();
}

export function fmtDateTime(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleString();
}

export function fmtMoney(c, currency = "USD", locale) {
  const n = (c || 0) / 100;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
