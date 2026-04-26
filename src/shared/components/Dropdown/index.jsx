"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Accessible dropdown menu.
 *
 * - Click outside / ESC closes
 * - Keyboard nav: ArrowUp/ArrowDown/Home/End
 * - Items can be { label, onSelect, disabled, danger, icon } or a divider { divider: true }
 * - RTL-aware via document direction
 *
 * For a controlled select (value-bound), prefer a native <select> wrapped in
 * <Input> until we add a SearchableSelect primitive.
 */
export default function Dropdown({
  trigger,
  items,
  align = "end",
  className = "",
  menuClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef(null);
  const itemsRef = useRef([]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIdx(-1);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const interactiveIndices = items
    .map((it, i) => ((!it || it.divider || it.disabled) ? -1 : i))
    .filter((i) => i >= 0);

  const move = useCallback(
    (delta) => {
      if (!interactiveIndices.length) return;
      const cur = interactiveIndices.indexOf(activeIdx);
      const nextPos =
        cur === -1
          ? delta > 0
            ? 0
            : interactiveIndices.length - 1
          : (cur + delta + interactiveIndices.length) % interactiveIndices.length;
      const nextIdx = interactiveIndices[nextPos];
      setActiveIdx(nextIdx);
      itemsRef.current[nextIdx]?.focus?.();
    },
    [interactiveIndices, activeIdx]
  );

  function onMenuKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActiveIdx(interactiveIndices[0] ?? -1); itemsRef.current[interactiveIndices[0]]?.focus?.(); }
    else if (e.key === "End") { e.preventDefault(); const last = interactiveIndices[interactiveIndices.length - 1] ?? -1; setActiveIdx(last); itemsRef.current[last]?.focus?.(); }
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <span onClick={() => setOpen((v) => !v)}>
        {typeof trigger === "function"
          ? trigger({ open, toggle: () => setOpen((v) => !v) })
          : trigger}
      </span>
      {open ? (
        <div
          role="menu"
          onKeyDown={onMenuKey}
          className={`absolute z-[40] mt-1 min-w-[10rem] bg-white rounded-lg border border-gray-200 shadow-lg py-1 ${align === "start" ? "start-0" : "end-0"} ${menuClassName}`}
        >
          {items.map((it, i) => {
            if (!it) return null;
            if (it.divider) return <div key={`div-${i}`} className="my-1 border-t border-gray-100" />;
            const baseCls = "w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition";
            const stateCls = it.disabled
              ? "text-gray-400 cursor-not-allowed"
              : it.danger
              ? "text-red-600 hover:bg-red-50 focus:bg-red-50"
              : "text-gray-700 hover:bg-gray-50 focus:bg-gray-50";
            return (
              <button
                key={it.key ?? i}
                ref={(el) => { itemsRef.current[i] = el; }}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  if (it.disabled) return;
                  it.onSelect?.();
                  close();
                }}
                className={`${baseCls} ${stateCls} focus:outline-none`}
              >
                {it.icon ? <span className="flex-shrink-0">{it.icon}</span> : null}
                <span className="flex-1 truncate">{it.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
