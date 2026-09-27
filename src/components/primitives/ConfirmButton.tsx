import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./Button";

type ConfirmButtonProps = {
  children: ReactNode;
  /** Label while armed, e.g. "Delete account?". */
  confirmLabel: ReactNode;
  onConfirm: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
};

/**
 * Two-step destructive button: the first click arms it (label changes, tinted
 * red), a second click within 4s runs the action. Esc, blur or the timeout
 * disarms. Replaces window.confirm — keyboard-friendly and in-context.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  danger,
  disabled,
  title,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <Button
      className={armed || danger ? "btn--danger" : undefined}
      disabled={disabled}
      title={title}
      aria-live="polite"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setArmed(false);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
