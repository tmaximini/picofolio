import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Toast, ToastKind } from "@/store/index";
import { useDismissToast, useToasts } from "@/store/selectors";

/**
 * Global toast layer. Mount once at the App root; reads from the toasts
 * store slice and renders a stack in the bottom-right. Toasts with a
 * `duration` auto-dismiss after that many ms; toasts without a duration
 * (typically errors) stay until clicked.
 */
export function Toaster() {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toaster">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useDismissToast();

  useEffect(() => {
    if (toast.duration == null) return;
    const t = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <button
      type="button"
      className={`toast toast--${toast.kind}`}
      onClick={() => dismiss(toast.id)}
      title="Dismiss"
    >
      <span className="toast__icon">{iconFor(toast.kind)}</span>
      <span className="toast__body">
        <span className="toast__title">{toast.title}</span>
        {toast.body && <span className="toast__text">{toast.body}</span>}
      </span>
      <span className="toast__close">
        <X size={13} strokeWidth={1.75} />
      </span>
    </button>
  );
}

function iconFor(kind: ToastKind) {
  switch (kind) {
    case "success":
      return <CheckCircle2 size={16} strokeWidth={1.75} />;
    case "error":
      return <AlertCircle size={16} strokeWidth={1.75} />;
    case "warning":
      return <AlertTriangle size={16} strokeWidth={1.75} />;
    case "info":
    default:
      return <Info size={16} strokeWidth={1.75} />;
  }
}
