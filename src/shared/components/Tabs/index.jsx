"use client";

import { useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * URL-synced Tabs primitive.
 *
 * Reads/writes `?<paramKey>=<value>` so deep-links and back/forward navigation
 * preserve the active tab. Falls back to controlled mode when `value`/`onChange`
 * are passed instead of `paramKey`.
 *
 * tabs prop shape:
 *   [{ value: "participants", label: "Participants", icon?: ReactNode, badge?: ReactNode }]
 */
export default function Tabs({
  tabs,
  paramKey,
  value: controlledValue,
  onChange: controlledOnChange,
  defaultValue,
  className = "",
  tabClassName = "",
  variant = "underline",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listRef = useRef(null);

  const urlValue = paramKey ? searchParams.get(paramKey) : null;
  const fallback = defaultValue ?? tabs?.[0]?.value;
  const active = controlledValue ?? urlValue ?? fallback;

  const setActive = useCallback(
    (next) => {
      if (controlledOnChange) {
        controlledOnChange(next);
        return;
      }
      if (!paramKey) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next == null || next === fallback) params.delete(paramKey);
      else params.set(paramKey, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [controlledOnChange, paramKey, searchParams, router, pathname, fallback]
  );

  const onKeyDown = useCallback(
    (e) => {
      const idx = tabs.findIndex((t) => t.value === active);
      if (idx < 0) return;
      let nextIdx = null;
      if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
      else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = tabs.length - 1;
      if (nextIdx == null) return;
      e.preventDefault();
      const nextTab = tabs[nextIdx];
      setActive(nextTab.value);
      const buttons = listRef.current?.querySelectorAll("[role='tab']");
      buttons?.[nextIdx]?.focus();
    },
    [tabs, active, setActive]
  );

  const styles = useMemo(() => {
    if (variant === "pill") {
      return {
        list: "inline-flex items-center gap-1 p-1 bg-gray-100 rounded-lg",
        tabBase:
          "px-3 py-1.5 rounded-md text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500/40",
        tabActive: "bg-white text-gray-900 shadow-sm",
        tabIdle: "text-gray-600 hover:text-gray-900",
      };
    }
    return {
      list: "flex items-center gap-1 border-b border-gray-200 overflow-x-auto",
      tabBase:
        "px-3 sm:px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded-t",
      tabActive: "border-blue-600 text-blue-600",
      tabIdle: "border-transparent text-gray-500 hover:text-gray-900",
    };
  }, [variant]);

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={`${styles.list} ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActive(tab.value)}
            className={`${styles.tabBase} ${isActive ? styles.tabActive : styles.tabIdle} ${tabClassName}`}
          >
            <span className="inline-flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.badge != null ? (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                  {tab.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Convenience helper: a tab panel.
 * Usage:
 *   <TabPanel value="participants" active={current}><ParticipantsTab/></TabPanel>
 */
export function TabPanel({ value, active, children }) {
  if (value !== active) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${value}`}>
      {children}
    </div>
  );
}
