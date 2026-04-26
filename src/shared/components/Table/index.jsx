"use client";

/**
 * Responsive Table primitive — pairs a desktop <table> with a mobile-card list,
 * codifying the pattern in `.cursor/rules/mobile-design.md`.
 *
 * Usage:
 *
 *   <ResponsiveTable
 *     items={orders}
 *     getKey={(o) => o._id}
 *     columns={[
 *       { key: "name", header: "Name", cell: (o) => o.name },
 *       { key: "due",  header: "Due",  cell: (o) => fmtCents(o.due), align: "end" },
 *     ]}
 *     mobileCard={(o) => <OrderCard order={o} />}
 *   />
 *
 * If `mobileCard` is omitted, the desktop table is shown on every breakpoint.
 */
export function ResponsiveTable({
  items,
  columns,
  getKey,
  mobileCard,
  empty,
  loading,
  loadingRows = 3,
  className = "",
  rowClassName,
}) {
  if (loading) {
    return (
      <div className={className}>
        <DesktopTable
          columns={columns}
          rows={Array.from({ length: loadingRows }).map((_, i) => (
            <tr key={`skeleton-${i}`} className="border-t border-gray-100">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        />
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className={`p-8 text-center text-sm text-gray-500 ${className}`}>
        {empty ?? "No results"}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Desktop */}
      <DesktopTable
        columns={columns}
        rows={items.map((item) => {
          const key = getKey(item);
          return (
            <tr
              key={key}
              className={`border-t border-gray-100 hover:bg-gray-50/60 ${typeof rowClassName === "function" ? rowClassName(item) : rowClassName || ""}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2.5 text-sm text-gray-700 ${c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : ""} ${c.cellClassName || ""}`}
                >
                  {c.cell(item)}
                </td>
              ))}
            </tr>
          );
        })}
        wrapperClassName={mobileCard ? "hidden md:block" : ""}
      />

      {/* Mobile cards */}
      {mobileCard ? (
        <div className="md:hidden space-y-2.5">
          {items.map((item) => (
            <div key={getKey(item)}>{mobileCard(item)}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DesktopTable({ columns, rows, wrapperClassName = "" }) {
  return (
    <div className={`overflow-x-auto ${wrapperClassName}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-xs uppercase tracking-wider text-gray-500">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 text-start font-medium ${c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : ""} ${c.headerClassName || ""}`}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/**
 * Reusable mobile accordion card matching mobile-design.md spec.
 * Use when extracting per-row mobile rendering from a page.
 */
export function MobileAccordionCard({
  identifier,
  badge,
  summary,
  isOpen,
  onToggle,
  selectionSlot,
  children,
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="px-3 py-3 flex items-center gap-3">
        {selectionSlot ? <div className="flex-shrink-0">{selectionSlot}</div> : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex-1 min-w-0 flex items-center gap-3 text-start"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-medium truncate text-gray-900">{identifier}</div>
              {badge}
            </div>
            {summary ? (
              <div className="mt-0.5 text-xs text-gray-500">{summary}</div>
            ) : null}
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {isOpen ? (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">{children}</div>
      ) : null}
    </div>
  );
}

export default ResponsiveTable;
