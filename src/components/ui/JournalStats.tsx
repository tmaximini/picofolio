import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { parseOccSymbol } from "@/lib/optionSymbol";
import { useTradeStats } from "@/store/selectors";
import { PerformanceChart } from "./PerformanceChart";

const TIPS = {
  pnl: "Sum of realized P/L across all closed trades in the selected range.",
  winRate: "Share of closed trades that were profitable.",
  trades: "Trades with activity in the selected range.",
  avg: "Average realized profit per winning trade / loss per losing trade.",
  best: "Largest realized gain on a single trade in the selected range. Click to open.",
  worst: "Largest realized loss on a single trade in the selected range. Click to open.",
} as const;

/** Options show as their underlying — the cards have no room for OCC strings. */
function symLabel(symbol: string): string {
  return parseOccSymbol(symbol)?.underlying ?? symbol;
}

type JournalStatsProps = {
  scope?: string;
  /** Open a trade's detail modal — makes the Best/Worst cards clickable. */
  onOpenTrade?: (id: string) => void;
};

export function JournalStats({ scope, onOpenTrade }: JournalStatsProps) {
  const stats = useTradeStats(scope);
  const pnlTone = toneOf(stats.pnlCents);
  const closed = stats.wins + stats.losses;

  // Collapse the per-trade running total to one point per day (last value of
  // the day) — Lightweight Charts needs ascending, unique times. Prepend a
  // zero anchor the day before the first close so the curve grows from $0
  // rather than starting mid-air.
  const equity = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const p of stats.cumulativeSeries) byDay.set(p.at, p.cumulativeCents);
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (days.length === 0) return [];
    const points = days.map(([time, cents]) => ({ time, value: cents / 100 }));
    return [{ time: dayBefore(days[0]![0]), value: 0 }, ...points];
  }, [stats.cumulativeSeries]);

  return (
    <div className="journalStats">
      <div className="journalStats__chartWrap">
        <div className="journalStats__chartHead">
          <span className="journalStats__chartLabel">Cumulative P&amp;L</span>
          <span className="journalStats__chartCount">
            {closed} closed{stats.open > 0 ? ` · ${stats.open} open` : ""}
          </span>
        </div>
        {equity.length < 2 ? (
          <div className="journalSpark__empty">No closed trades in range</div>
        ) : (
          <PerformanceChart data={equity} height={200} format="currency" />
        )}
      </div>

      <div className="journalCards">
        <StatCard
          label="P&L"
          tip={TIPS.pnl}
          value={stats.pnlCents !== 0 ? formatCents(stats.pnlCents, true) : "—"}
          sub={stats.returnPct !== 0 ? formatPct(stats.returnPct) : undefined}
          tone={pnlTone === "neutral" ? undefined : pnlTone}
          subTone={pnlTone === "neutral" ? undefined : pnlTone}
          className={
            pnlTone === "neutral"
              ? "journalCard--pnl"
              : `journalCard--pnl journalCard--${pnlTone}`
          }
          hero
        />
        <StatCard
          label="Win rate"
          tip={TIPS.winRate}
          value={closed > 0 ? `${Math.round(stats.winRate * 100)}%` : "—"}
          sub={closed > 0 ? `${stats.wins}W · ${stats.losses}L` : undefined}
        />
        <StatCard
          label="Best trade"
          tip={TIPS.best}
          value={stats.best ? formatCents(stats.best.returnCents, true) : "—"}
          sub={
            stats.best
              ? `${symLabel(stats.best.symbol)}${
                  stats.best.returnPct != null ? ` · ${formatPct(stats.best.returnPct)}` : ""
                }`
              : undefined
          }
          tone={stats.best ? "gain" : undefined}
          onClick={
            stats.best && onOpenTrade
              ? () => onOpenTrade(stats.best!.tradeId)
              : undefined
          }
        />
        <StatCard
          label="Trades"
          tip={TIPS.trades}
          value={String(closed + stats.open)}
          sub={`${closed} closed${stats.open > 0 ? ` · ${stats.open} open` : ""}`}
        />
        <StatCard
          label="Avg win / loss"
          tip={TIPS.avg}
          value={
            <span className="journalCard__pair">
              <span className="journalCard__pairItem journalCard__pairItem--gain">
                {stats.avgWinCents > 0 ? formatCents(stats.avgWinCents, true) : "—"}
              </span>
              <span className="journalCard__pairSep" />
              <span className="journalCard__pairItem journalCard__pairItem--loss">
                {stats.avgLossCents < 0 ? formatCents(stats.avgLossCents, true) : "—"}
              </span>
            </span>
          }
        />
        <StatCard
          label="Worst trade"
          tip={TIPS.worst}
          value={stats.worst ? formatCents(stats.worst.returnCents, true) : "—"}
          sub={
            stats.worst
              ? `${symLabel(stats.worst.symbol)}${
                  stats.worst.returnPct != null ? ` · ${formatPct(stats.worst.returnPct)}` : ""
                }`
              : undefined
          }
          tone={stats.worst ? "loss" : undefined}
          onClick={
            stats.worst && onOpenTrade
              ? () => onOpenTrade(stats.worst!.tradeId)
              : undefined
          }
        />
      </div>
    </div>
  );
}

/** ISO date one day before the given YYYY-MM-DD key. */
function dayBefore(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "gain" | "loss";
  /** Color for the sub line; defaults to neutral. */
  subTone?: "gain" | "loss";
  tip?: string;
  hero?: boolean;
  className?: string;
  /** When present the card becomes a button with a chevron affordance. */
  onClick?: () => void;
};

function StatCard({
  label,
  value,
  sub,
  tone,
  subTone,
  tip,
  hero,
  className,
  onClick,
}: StatCardProps) {
  const valueClass = [
    "journalCard__value",
    hero && "journalCard__value--hero",
    tone && `journalCard__value--${tone}`,
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <div className="journalCard__label">{label}</div>
      <div className={valueClass}>{value}</div>
      {sub && (
        <div className={`journalCard__sub journalCard__sub--${subTone ?? "neutral"}`}>
          {sub}
        </div>
      )}
      {onClick && (
        <ChevronRight size={13} strokeWidth={1.5} className="journalCard__chevron" />
      )}
    </>
  );

  const classes = ["journalCard", className].filter(Boolean).join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        className={`${classes} journalCard--clickable`}
        title={tip}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={classes} title={tip}>
      {body}
    </div>
  );
}
