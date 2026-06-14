/** Horizontal P&L / count bars for the Performance breakdowns. Each row's
 *  fill width is proportional to |amount| against the largest in the set; tone
 *  colours it gain/loss. Presentational only. */

export type BreakdownBar = {
  label: string;
  /** Drives the bar width (|amount| / max). */
  amount: number;
  tone: "gain" | "loss" | "neutral";
  /** Right-aligned headline (already formatted). */
  value: string;
  /** Optional muted second line under the value. */
  sub?: string;
};

export function BreakdownBars({ bars }: { bars: BreakdownBar[] }) {
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.amount)));
  return (
    <div className="breakdown">
      {bars.map((b, i) => (
        <div className="breakdownRow" key={`${b.label}-${i}`}>
          <span className="breakdownRow__label" title={b.label}>
            {b.label}
          </span>
          <span className="breakdownRow__track">
            <span
              className={`breakdownRow__fill breakdownRow__fill--${b.tone}`}
              style={{ width: `${(Math.abs(b.amount) / max) * 100}%` }}
            />
          </span>
          <span className="breakdownRow__value">
            <span className={`breakdownRow__amount breakdownRow__amount--${b.tone}`}>
              {b.value}
            </span>
            {b.sub && <span className="breakdownRow__sub">{b.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
