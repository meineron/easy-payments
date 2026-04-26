/**
 * Status pill backgrounds + text colors.
 *
 * Mirrors the legacy STATUS_COLORS map from `activities/[id]/page.js`.
 * Tokens for these are also defined in `globals.css` (`--color-status-*-{bg,fg}`)
 * so future migrations can swap to inline styles or arbitrary Tailwind values
 * without changing the source of truth.
 */
export const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700",
  partial: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  refunded: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-600",
  expected: "bg-orange-100 text-orange-700",
};

export function getStatusClasses(status) {
  return STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
}
