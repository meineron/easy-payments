import { useCallback, useMemo } from "react";

/**
 * Fully controlled Pagination primitive — no routing dependency.
 *
 * To sync pagination with the URL, manage `value` / `onChange` in the parent
 * page using useUrlParam from shared/hooks/useUrlState.
 */
export default function Pagination({
  total,
  pageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  value = 1,
  onChange,
  onPageSizeChange,
  className = "",
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));

  const goTo = useCallback(
    (next) => {
      const clamped = Math.max(1, Math.min(totalPages, next));
      if (onChange) onChange(clamped);
    },
    [onChange, totalPages]
  );

  const setSize = useCallback(
    (size) => {
      if (onPageSizeChange) onPageSizeChange(size);
      if (onChange) onChange(1);
    },
    [onPageSizeChange, onChange]
  );

  const range = useMemo(() => {
    const result = new Set([1, totalPages, value, value - 1, value + 1]);
    return Array.from(result)
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
  }, [value, totalPages]);

  if (total === 0) return null;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>
          Showing {(value - 1) * pageSize + 1}–{Math.min(total, value * pageSize)} of {total}
        </span>
        <select
          value={pageSize}
          onChange={(e) => setSize(Number(e.target.value))}
          className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>{opt} / page</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <PageBtn disabled={value <= 1} onClick={() => goTo(value - 1)} aria-label="Previous page">‹</PageBtn>
        {range.map((n, i) => {
          const prev = range[i - 1];
          const showEllipsis = prev != null && n - prev > 1;
          return (
            <span key={n} className="flex items-center">
              {showEllipsis ? <span className="px-1 text-gray-400">…</span> : null}
              <PageBtn active={n === value} onClick={() => goTo(n)}>{n}</PageBtn>
            </span>
          );
        })}
        <PageBtn disabled={value >= totalPages} onClick={() => goTo(value + 1)} aria-label="Next page">›</PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ active, disabled, children, ...rest }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`min-w-[2rem] h-8 px-2 rounded-md text-sm border transition ${
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-white"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
