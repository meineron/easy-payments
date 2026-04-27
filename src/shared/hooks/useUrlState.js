import { useCallback } from "react";
import { usePaymentsRouter } from "../context/PaymentsHostContext";

/**
 * Read & write a single URL search param.
 *   const [tab, setTab] = useUrlParam("tab", "participants");
 *   setTab("teams");
 *
 * Uses the PaymentsHostContext router abstraction so this hook works
 * in both standalone Next.js (wired to next/router) and pl-football-web
 * (wired to react-router).
 */
export function useUrlParam(key, defaultValue) {
  const { searchParams, navigate, pathname } = usePaymentsRouter();
  const value = searchParams.get(key) ?? defaultValue ?? null;

  const set = useCallback(
    (next, options = {}) => {
      const { replace = true } = options;
      const params = new URLSearchParams(searchParams.toString());
      if (next == null || next === defaultValue || next === "") params.delete(key);
      else params.set(key, String(next));
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      navigate(url, { replace });
    },
    [key, defaultValue, searchParams, navigate, pathname]
  );

  return [value, set];
}

/**
 * Read multiple URL params at once (typed via the `parse` map).
 *   const { page, q } = useUrlParams({ page: Number, q: String });
 */
export function useUrlParams(schema) {
  const { searchParams } = usePaymentsRouter();
  const out = {};
  for (const [key, parse] of Object.entries(schema)) {
    const raw = searchParams.get(key);
    if (raw == null) { out[key] = undefined; continue; }
    out[key] = parse === Number ? Number(raw) : parse === Boolean ? raw === "true" : raw;
  }
  return out;
}

export default useUrlParam;
