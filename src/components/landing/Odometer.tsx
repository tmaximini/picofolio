import type { CSSProperties } from "react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type OdometerProps = {
  /** The fully formatted value, e.g. "€164,919". Non-digits render static. */
  value: string;
  /** Digits sit at 0 until active, then roll to their targets. */
  active?: boolean;
  className?: string;
};

/**
 * Mechanical digit reels. Each digit is a 0–9 column translated to its
 * target, so later value changes roll from the current digit, not from zero.
 * Keyed from the right so a changing width doesn't re-mount every reel.
 */
export function Odometer({ value, active = true, className }: OdometerProps) {
  const chars = value.split("");
  return (
    <span className={["odo", "num", className].filter(Boolean).join(" ")} aria-label={value}>
      {chars.map((c, i) => {
        const key = chars.length - i;
        if (!/\d/.test(c)) {
          return (
            <span className="odo__static" key={key} aria-hidden>
              {c}
            </span>
          );
        }
        const style = { "--d": active ? Number(c) : 0, "--i": i } as CSSProperties;
        return (
          <span className="odo__digit" key={key} style={style} aria-hidden>
            <span className="odo__reel">
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
