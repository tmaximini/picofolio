import { formatCents, formatPct } from "@/lib/money";
import { useWeeklyPnl } from "@/store/selectors";

const weekFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function fmtWeek(iso: string): string {
  return `Week of ${weekFmt.format(new Date(iso))}`;
}

export function WeeklyPLSparks() {
  const data = useWeeklyPnl();

  const maxGain = data.reduce((m, d) => (d.pnlCents > m ? d.pnlCents : m), 0);
  const maxLoss = data.reduce((m, d) => (d.pnlCents < -m ? -d.pnlCents : m), 0);
  const range = maxGain + maxLoss || 1;
  const baselinePct = (maxGain / range) * 100;

  return (
    <div
      className="sparkRow"
      style={{ ["--baseline" as string]: `${baselinePct}%` }}
      role="img"
      aria-label="Weekly P&L last 14 weeks"
    >
      <div className="sparkBaseline" aria-hidden />
      {data.map((d) => {
        const isLoss = d.pnlCents < 0;
        const heightPct = (Math.abs(d.pnlCents) / range) * 100;
        return (
          <div key={d.weekOf} className="sparkCol">
            <div
              className={isLoss ? "sparkBar sparkBar--loss" : "sparkBar sparkBar--gain"}
              style={{ height: `${heightPct}%` }}
            >
              <div className="sparkTip" role="tooltip">
                <div className="sparkTip__date">{fmtWeek(d.weekOf)}</div>
                <div
                  className={`sparkTip__pnl sparkTip__pnl--${isLoss ? "loss" : "gain"}`}
                >
                  {isLoss ? "−" : "+"}
                  {formatCents(Math.abs(d.pnlCents))}
                </div>
                <div className="sparkTip__meta">
                  <span>{d.trades} trades</span>
                  <span className="sparkTip__sep" />
                  <span>{formatPct(d.winRate).replace("+", "")} win</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
