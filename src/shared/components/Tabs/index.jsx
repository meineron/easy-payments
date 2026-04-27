import { useCallback, useMemo, useRef } from "react";

/**
 * Fully controlled Tabs primitive — no routing dependency.
 *
 * To sync tabs with the URL, manage the `value` / `onChange` in the parent
 * page using useUrlParam from shared/hooks/useUrlState.
 *
 * tabs prop shape:
 *   [{ value: "participants", label: "Participants", icon?: ReactNode, badge?: ReactNode }]
 */
export default function Tabs({
  tabs,
  value: active,
  onChange,
  defaultValue,
  className = "",
  tabClassName = "",
  variant = "underline",
}) {
  const listRef = useRef(null);
  const resolved = active ?? defaultValue ?? tabs?.[0]?.value;

  const setActive = useCallback(
    (next) => {
      if (onChange) onChange(next);
    },
    [onChange]
  );

  const onKeyDown = useCallback(
    (e) => {
      const idx = tabs.findIndex((t) => t.value === resolved);
      if (idx < 0) return;
      let nextIdx = null;
      if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
      else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = tabs.length - 1;
      if (nextIdx == null) return;
      e.preventDefault();
      setActive(tabs[nextIdx].value);
      const buttons = listRef.current?.querySelectorAll("[role='tab']");
      buttons?.[nextIdx]?.focus();
    },
    [tabs, resolved, setActive]
  );

  const styles = useMemo(() => {
    if (variant === "pill") {
      return {
        list: "inline-flex items-center gap-1 p-1 bg-gray-100 rounded-lg",
        tabBase: "px-3 py-1.5 rounded-md text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500/40",
        tabActive: "bg-white text-gray-900 shadow-sm",
        tabIdle: "text-gray-600 hover:text-gray-900",
      };
    }
    return {
      list: "flex items-center gap-1 border-b border-gray-200 overflow-x-auto",
      tabBase: "px-3 sm:px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded-t",
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
        const isActive = tab.value === resolved;
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
