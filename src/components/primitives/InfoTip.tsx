import { useId, type ReactNode } from "react";

type InfoTipProps = {
  /** The explanation shown on hover / keyboard focus. */
  children: ReactNode;
  /** Accessible name for the trigger. */
  label?: string;
};

/**
 * A quiet "?" beside a metric label that explains it on hover or focus.
 * Keyboard-reachable (it's a button) and announced via aria-describedby.
 */
export function InfoTip({ children, label = "What does this mean?" }: InfoTipProps) {
  const id = useId();
  return (
    <span className="infoTip">
      <button type="button" className="infoTip__btn" aria-label={label} aria-describedby={id}>
        ?
      </button>
      <span role="tooltip" id={id} className="infoTip__pop">
        {children}
      </span>
    </span>
  );
}
