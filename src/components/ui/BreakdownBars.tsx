/** Diverging P&L / count bars for the Performance breakdowns. Each row fills
 *  out from a center axis — gains extend right, losses left — with width
 *  proportional to |amount| against the largest in the set. Tone (not the raw
 *  sign) picks the direction, so count-based sets like the R-multiple
 *  distribution still diverge correctly. Presentational only. */

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
      {bars.map((b, i) => {
        // Half-track fill: at |amount| === max the bar just reaches an edge.
        const half = (Math.abs(b.amount) / max) * 50;
        const isLoss = b.tone === "loss";
        const fillStyle = isLoss
          ? { right: "50%", width: `${half}%` }
          : { left: "50%", width: `${half}%` };
        return (
          <div className="breakdownRow" key={`${b.label}-${i}`}>
            <span className="breakdownRow__label" title={b.label}>
              {b.label}
            </span>
            <span className="breakdownRow__track">
              <span className="breakdownRow__axis" aria-hidden />
              <span
                className={`breakdownRow__fill breakdownRow__fill--${b.tone}`}
                style={fillStyle}
              />
            </span>
            <span className="breakdownRow__value">
              <span className={`breakdownRow__amount breakdownRow__amount--${b.tone}`}>
                {b.value}
              </span>
              {b.sub && <span className="breakdownRow__sub">{b.sub}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
