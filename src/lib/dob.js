// DOB is a plain civil date — no time, no timezone. We store it as a
// "YYYY-MM-DD" string in MongoDB and keep it as a string throughout the
// app so that rendering never drifts by a day between runtimes with
// different timezones (e.g. Heroku running UTC vs a browser in US/Eastern).
//
// Historically DOBs were stored as `Date` objects — some saved at UTC
// midnight and some at "Israel-local midnight expressed in UTC" (21:00Z or
// 22:00Z). The `toDobString` helper accepts both shapes and, when asked
// for a legacy migration, interprets them in the Israel timezone so the
// intended calendar day is preserved.

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize any DOB input to a `"YYYY-MM-DD"` string (or `null`).
 *
 * - `null` / `undefined` / `""` → `null`
 * - already a `"YYYY-MM-DD"` string → returned as-is
 * - `Date` / ISO string / epoch millis → formatted in `timeZone`
 *
 * `timeZone` defaults to `"UTC"` so new data coming through `<input type="date">`
 * (which is already a bare date string) passes through untouched. For the
 * legacy migration, call with `"Asia/Jerusalem"` to recover the day from
 * timestamps that were saved at Israel-local midnight.
 */
export function toDobString(input, timeZone = "UTC") {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return null;
    if (YMD_RE.test(trimmed)) return trimmed;
  }

  let d;
  if (input instanceof Date) d = input;
  else if (typeof input === "string" || typeof input === "number") d = new Date(input);
  else return null;

  if (!d || Number.isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

/**
 * Format a DOB as a locale-aware display string (e.g. "Apr 18, 2020").
 * Always renders in UTC so the day never drifts across runtime timezones.
 */
export function formatDob(value, locale = undefined, options = { year: "numeric", month: "short", day: "numeric" }) {
  const s = toDobString(value);
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

/**
 * Integer age in years from a DOB, using the user's local wall-clock.
 * Accepts either a `"YYYY-MM-DD"` string or a legacy `Date`/ISO input.
 */
export function dobAge(value) {
  const s = toDobString(value);
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  const mm = now.getMonth() + 1;
  const dd = now.getDate();
  if (mm < m || (mm === m && dd < d)) age--;
  return age;
}

/**
 * Value for an `<input type="date">` — a `"YYYY-MM-DD"` string or `""`.
 */
export function dobToInputValue(value) {
  return toDobString(value) || "";
}
