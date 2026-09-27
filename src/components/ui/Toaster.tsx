import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Toast, ToastKind } from "@/store/index";
import { useDismissToast, useToasts } from "@/store/selectors";

/**
 * Global toast layer. Mount once at the App root; reads from the toasts
 * store slice and renders a stack in the bottom-right. Toasts with a
 * `duration` auto-dismiss after that many ms; toasts without a duration
 * (typically errors) stay until clicked. Hovering or focusing a toast
 * pauses its dismiss timer so it can be read in full. Repeats of the same
 * toast merge into one (×N) and restart its timer — see pushToast.
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
  // Pause the countdown while hovered/focused. `remaining` carries the unused
  // time across pauses so resuming doesn't restart the full duration.
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration ?? Infinity);

  // A repeat (seq bump) earns the full duration again.
  useEffect(() => {
    remainingRef.current = toast.duration ?? Infinity;
  }, [toast.seq, toast.duration]);

  useEffect(() => {
    if (toast.duration == null || paused) return;
    const start = Date.now();
    const t = window.setTimeout(() => dismiss(toast.id), remainingRef.current);
    return () => {
      window.clearTimeout(t);
      remainingRef.current -= Date.now() - start;
    };
  }, [toast.id, toast.duration, toast.seq, dismiss, paused]);

  return (
    <button
      type="button"
      className={`toast toast--${toast.kind}`}
      onClick={() => dismiss(toast.id)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      title="Dismiss"
    >
      <span className="toast__icon">{iconFor(toast.kind)}</span>
      <span className="toast__body">
        <span className="toast__title">
          {toast.title}
          {(toast.count ?? 1) > 1 && (
            // Re-keyed so the pulse replays on each repeat.
            <span className="toast__count num" key={toast.count}>×{toast.count}</span>
          )}
        </span>
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
