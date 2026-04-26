"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * URL-driven pagination. Reads `?<pageKey>` (default `page`) and
 * `?<pageSizeKey>` (default `pageSize`).
 *
 * For controlled use, pass `value`, `onChange`, and `pageSize` directly.
 */
export default function Pagination({
  total,
  pageSize: pageSizeProp,
  pageSizeOptions = [10, 20, 50, 100],
  value,
  onChange,
  pageKey = "page",
  pageSizeKey = "pageSize",
  className = "",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlPage = Number(searchParams.get(pageKey)) || 1;
  const urlPageSize = Number(searchParams.get(pageSizeKey)) || pageSizeProp || pageSizeOptions[0];

  const page = value ?? urlPage;
  const pageSize = pageSizeProp ?? urlPageSize;
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));

  const setParams = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.page != null) {
        if (next.page === 1) params.delete(pageKey);
        else params.set(pageKey, String(next.page));
      }
      if (next.pageSize != null) {
        if (next.pageSize === pageSizeOptions[0]) params.delete(pageSizeKey);
        else params.set(pageSizeKey, String(next.pageSize));
        params.delete(pageKey);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, pageKey, pageSizeKey, pageSizeOptions]
  );

  const goTo = useCallback(
    (next) => {
      const clamped = Math.max(1, Math.min(totalPages, next));
      if (onChange) onChange(clamped);
      else setParams({ page: clamped });
    },
    [onChange, setParams, totalPages]
  );

  const setSize = useCallback(
    (size) => {
      if (onChange) onChange(1);
      setParams({ pageSize: size });
    },
    [onChange, setParams]
  );

  const range = useMemo(() => {
    const result = new Set([1, totalPages, page, page - 1, page + 1]);
    return Array.from(result)
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  if (total === 0) return null;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>
          Showing {(page - 1) * pageSize + 1}-{Math.min(total, page * pageSize)} of {total}
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
        <PageBtn disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label="Previous page">‹</PageBtn>
        {range.map((n, i) => {
          const prev = range[i - 1];
          const showEllipsis = prev != null && n - prev > 1;
          return (
            <span key={n} className="flex items-center">
              {showEllipsis ? <span className="px-1 text-gray-400">…</span> : null}
              <PageBtn active={n === page} onClick={() => goTo(n)}>{n}</PageBtn>
            </span>
          );
        })}
        <PageBtn disabled={page >= totalPages} onClick={() => goTo(page + 1)} aria-label="Next page">›</PageBtn>
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
