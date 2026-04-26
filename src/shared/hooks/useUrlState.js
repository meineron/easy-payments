"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Read & write a single URL search param.
 *   const [tab, setTab] = useUrlParam("tab", "participants");
 *   setTab("teams");
 *
 * `replace: true` (default) avoids polluting browser history for filter changes.
 */
export function useUrlParam(key, defaultValue) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue ?? null;

  const set = useCallback(
    (next, options = {}) => {
      const { replace = true, scroll = false } = options;
      const params = new URLSearchParams(searchParams.toString());
      if (next == null || next === defaultValue || next === "") params.delete(key);
      else params.set(key, String(next));
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (replace) router.replace(url, { scroll });
      else router.push(url, { scroll });
    },
    [key, defaultValue, searchParams, router, pathname]
  );

  return [value, set];
}

/**
 * Read multiple URL params at once (typed via the `parse` map).
 *   const { page, q } = useUrlParams({ page: Number, q: String });
 */
export function useUrlParams(schema) {
  const searchParams = useSearchParams();
  const out = {};
  for (const [key, parse] of Object.entries(schema)) {
    const raw = searchParams.get(key);
    if (raw == null) { out[key] = undefined; continue; }
    out[key] = parse === Number ? Number(raw) : parse === Boolean ? raw === "true" : raw;
  }
  return out;
}

export default useUrlParam;
