import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { dismissToast, selectToasts } from "@/store/slices/uiSlice";

const TYPE_BG = {
  success: "bg-green-600",
  error: "bg-red-600",
  info: "bg-blue-600",
  warning: "bg-amber-600",
};

const TYPE_ICON = {
  success: "\u2713",
  error: "\u2717",
  info: "i",
  warning: "!",
};

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast.durationMs) return undefined;
    const t = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(t);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto ${TYPE_BG[toast.type] || TYPE_BG.info} text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-3 animate-[slideIn_0.2s_ease-out]`}
    >
      <span aria-hidden="true">{TYPE_ICON[toast.type] || ""}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="ms-2 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Global toast renderer. Mounted once in <Providers />.
 * Trigger toasts from anywhere via `dispatch(pushToast({ message, type }))`.
 */
export default function Toast() {
  const toasts = useSelector(selectToasts);
  const dispatch = useDispatch();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed top-4 end-4 z-[100] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={(id) => dispatch(dismissToast(id))} />
      ))}
    </div>
  );
}
