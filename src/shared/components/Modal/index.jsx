"use client";

import { useEffect, useRef } from "react";

/**
 * Shared Modal primitive — backdrop + centered card.
 *
 * Behavior:
 *   - ESC closes (set `closeOnEsc={false}` to opt out)
 *   - Backdrop click closes (set `closeOnBackdrop={false}` to opt out)
 *   - Focus is moved into the dialog on open and restored on close
 *   - Body scroll is locked while open
 *   - RTL-aware via document direction (no extra props needed)
 *
 * Compose with `Modal.Header`, `Modal.Body`, `Modal.Footer` for layout, or
 * pass arbitrary children for a custom layout.
 */
const SIZE_MAP = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  full: "max-w-[95vw]",
};

export default function Modal({
  open,
  onClose,
  size = "lg",
  closeOnEsc = true,
  closeOnBackdrop = true,
  initialFocusRef,
  ariaLabel,
  ariaLabelledBy,
  className = "",
  children,
}) {
  const dialogRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousActiveElement.current = document.activeElement;

    const focusTarget =
      initialFocusRef?.current ||
      dialogRef.current?.querySelector(
        "[data-autofocus], input, textarea, select, button, [tabindex]:not([tabindex='-1'])"
      ) ||
      dialogRef.current;
    focusTarget?.focus?.();

    function onKey(e) {
      if (closeOnEsc && e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    }
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousActiveElement.current?.focus?.();
    };
  }, [open, closeOnEsc, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
    >
      <div
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative w-full ${SIZE_MAP[size] || SIZE_MAP.lg} max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-xl shadow-xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

function Header({ title, onClose, className = "", children }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100 ${className}`}>
      {title ? (
        <h3 className="text-lg font-semibold text-gray-900 truncate">{title}</h3>
      ) : (
        children
      )}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1 -m-1"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function Body({ className = "", children }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

function Footer({ className = "", children }) {
  return (
    <div className={`px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 ${className}`}>
      {children}
    </div>
  );
}

Modal.Header = Header;
Modal.Body = Body;
Modal.Footer = Footer;
