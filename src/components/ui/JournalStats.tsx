import { useMemo } from "react";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { useTradeStats } from "@/store/selectors";
import { PerformanceChart } from "./PerformanceChart";

const TIPS = {
  winRate: "Share of closed trades that were profitable.",
  wins: "Closed trades with positive realized P/L.",
  losses: "Closed trades with negative realized P/L.",
  avgWin: "Average realized profit across winning trades.",
  avgLoss: "Average realized loss across losing trades.",
  pnl: "Sum of realized P/L across all closed trades in the selected range.",
} as const;

export function JournalStats() {
  const stats = useTradeStats();
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

      <div className="journalStrip">
        <Stat
          label="Win rate"
          tip={TIPS.winRate}
          value={closed > 0 ? `${Math.round(stats.winRate * 100)}%` : "—"}
        />
        <Stat label="Wins" tip={TIPS.wins} value={String(stats.wins)} />
        <Stat label="Losses" tip={TIPS.losses} value={String(stats.losses)} />
        <Stat
          label="Avg W"
          tip={TIPS.avgWin}
          value={stats.avgWinCents > 0 ? formatCents(stats.avgWinCents, true) : "—"}
          tone="gain"
        />
        <Stat
          label="Avg L"
          tip={TIPS.avgLoss}
          value={stats.avgLossCents < 0 ? formatCents(stats.avgLossCents, true) : "—"}
          tone="loss"
        />
        <Stat
          label="PnL"
          tip={TIPS.pnl}
          value={stats.pnlCents !== 0 ? formatCents(stats.pnlCents, true) : "—"}
          sub={stats.returnPct !== 0 ? formatPct(stats.returnPct) : undefined}
          tone={pnlTone === "neutral" ? undefined : pnlTone}
          hero
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

type StatProps = {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "gain" | "loss";
  tip?: string;
  hero?: boolean;
};

function Stat({ label, value, sub, tone, tip, hero }: StatProps) {
  const valueClass = [
    "journalStat__value",
    hero && "journalStat__value--hero",
    tone && `journalStat__value--${tone}`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={hero ? "journalStat journalStat--hero" : "journalStat"} title={tip}>
      <div className="journalStat__label">{label}</div>
      <div className={valueClass}>{value}</div>
      {sub && (
        <div className={`journalStat__sub journalStat__sub--${tone ?? "neutral"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}
