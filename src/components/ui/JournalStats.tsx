import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { formatMoney, formatPct, toneOf } from "@/lib/money";
import { parseOccSymbol } from "@/lib/optionSymbol";
import { eachDayKey, rangeFor, todayKey, type DateRangeKey } from "@/lib/dateRange";
import { useAccountBaseCurrency, useJournalRange, useTradeStats } from "@/store/selectors";
import { PerformanceChart, type PerfPoint } from "./PerformanceChart";

/** Journal chart mode — daily P&L bars vs. the cumulative equity curve.
 *  Persisted so the choice survives reloads and range changes. */
type ChartMode = "daily" | "cumulative";
const CHART_MODE_KEY = "picofolio:journalChartMode";
const SHOW_EMPTY_KEY = "picofolio:journalShowEmptyDays";

/** Max per-trade rows in the hover summary before collapsing the tail. */
const MAX_TIP_ROWS = 6;

function loadChartMode(): ChartMode {
  try {
    return localStorage.getItem(CHART_MODE_KEY) === "cumulative"
      ? "cumulative"
      : "daily";
  } catch {
    return "daily";
  }
}

function loadShowEmpty(): boolean {
  try {
    return localStorage.getItem(SHOW_EMPTY_KEY) === "1";
  } catch {
    return false;
  }
}

/** Cap the per-day breakdown, folding any overflow into a "+N more" row whose
 *  value is the summed remainder (so the colour still reads net up/down). */
function capBreakdown(
  items: { label: string; valueCents: number }[],
): { label: string; valueCents: number }[] {
  if (items.length <= MAX_TIP_ROWS) return items;
  const head = items.slice(0, MAX_TIP_ROWS - 1);
  const rest = items.slice(MAX_TIP_ROWS - 1);
  const restSum = rest.reduce((a, b) => a + b.valueCents, 0);
  return [...head, { label: `+${rest.length} more`, valueCents: restSum }];
}

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
  /** Jump to the full journal at the current range — makes the Trades card clickable. */
  onOpenJournal?: (rangeKey: DateRangeKey) => void;
};

export function JournalStats({ scope, onOpenTrade, onOpenJournal }: JournalStatsProps) {
  const stats = useTradeStats(scope);
  const baseCurrency = useAccountBaseCurrency(scope);
  const rangeKey = useJournalRange();
  const pnlTone = toneOf(stats.pnlCents);
  const closed = stats.wins + stats.losses;
  const [mode, setMode] = useState<ChartMode>(loadChartMode);
  const [showEmpty, setShowEmpty] = useState<boolean>(loadShowEmpty);

  const persist = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore write failures (private mode, etc.) */
    }
  };
  const selectMode = (m: ChartMode) => {
    setMode(m);
    persist(CHART_MODE_KEY, m);
  };
  const toggleEmpty = () => {
    setShowEmpty((v) => {
      persist(SHOW_EMPTY_KEY, v ? "0" : "1");
      return !v;
    });
  };

  // Per-day buckets, collapsed from the per-trade running total. Lightweight
  // Charts needs ascending, unique times. With `showEmpty` we fill every
  // calendar day in the selected range so the bars/curve reflect real spacing;
  // otherwise only days with activity are plotted (compact).
  const { daily, equity } = useMemo(() => {
    const cumByDay = new Map<string, number>();
    for (const p of stats.cumulativeSeries) cumByDay.set(p.at, p.cumulativeCents);
    const dayKeys = [...cumByDay.keys()].sort((a, b) => a.localeCompare(b));
    if (dayKeys.length === 0) return { daily: [], equity: [] };

    // Per-day P&L = diff of the cumulative across day boundaries.
    const pnlByDay = new Map<string, number>();
    let prev = 0;
    for (const day of dayKeys) {
      const cum = cumByDay.get(day)!;
      pnlByDay.set(day, cum - prev);
      prev = cum;
    }

    // Per-day trade breakdown for the hover summary (biggest movers first).
    const breakdownByDay = new Map<string, { label: string; valueCents: number }[]>();
    for (const c of stats.closedTrades) {
      const arr = breakdownByDay.get(c.at) ?? [];
      arr.push({ label: symLabel(c.symbol), valueCents: c.returnCents });
      breakdownByDay.set(c.at, arr);
    }
    for (const arr of breakdownByDay.values()) {
      arr.sort((a, b) => Math.abs(b.valueCents) - Math.abs(a.valueCents));
    }

    const firstDay = dayKeys[0]!;
    const lastDay = dayKeys[dayKeys.length - 1]!;

    const buildDaily = (days: string[]): PerfPoint[] =>
      days.map((day) => {
        const cents = pnlByDay.get(day) ?? 0;
        const breakdown = breakdownByDay.get(day);
        return {
          time: day,
          value: cents / 100,
          valueCents: cents,
          ...(breakdown ? { breakdown: capBreakdown(breakdown) } : {}),
        };
      });

    // Days to plot: the selected range when showing empties, else only the
    // active days. Anchor the cumulative curve at $0 the day before the start.
    let days = dayKeys;
    if (showEmpty) {
      const { fromKey, toKey } = rangeFor(rangeKey);
      const tk = todayKey();
      const startKey = fromKey && fromKey < firstDay ? fromKey : firstDay;
      let endKey = toKey && toKey < tk ? toKey : tk;
      if (endKey < lastDay) endKey = lastDay;
      days = eachDayKey(startKey, endKey);
    }

    let carry = 0;
    const equity: PerfPoint[] = [{ time: dayBefore(days[0]!), value: 0 }];
    for (const day of days) {
      if (cumByDay.has(day)) carry = cumByDay.get(day)!;
      equity.push({ time: day, value: carry / 100 });
    }

    return { daily: buildDaily(days), equity };
  }, [stats.cumulativeSeries, stats.closedTrades, showEmpty, rangeKey]);

  const hasData = daily.length > 0;

  return (
    <div className="journalStats">
      <div className="journalStats__chartWrap">
        <div className="journalStats__chartHead">
          <span className="journalStats__chartLabel">
            {mode === "daily" ? "Daily P&L" : "Cumulative P&L"}
          </span>
          <div className="journalStats__chartHeadRight">
            <button
              type="button"
              className={
                showEmpty
                  ? "journalStats__iconToggle journalStats__iconToggle--active"
                  : "journalStats__iconToggle"
              }
              aria-pressed={showEmpty}
              title={showEmpty ? "Hide empty days" : "Show empty days"}
              onClick={toggleEmpty}
            >
              <CalendarDays size={14} strokeWidth={1.75} />
            </button>
            <div className="chartSource" role="tablist" aria-label="Chart mode">
              {(["daily", "cumulative"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={
                    mode === m
                      ? "chartSource__seg chartSource__seg--active"
                      : "chartSource__seg"
                  }
                  onClick={() => selectMode(m)}
                >
                  {m === "daily" ? "Daily" : "Cumulative"}
                </button>
              ))}
            </div>
            <span className="journalStats__chartCount">
              {closed} closed{stats.open > 0 ? ` · ${stats.open} open` : ""}
            </span>
          </div>
        </div>
        {!hasData ? (
          <div className="journalSpark__empty">No closed trades in range</div>
        ) : mode === "daily" ? (
          <PerformanceChart data={daily} height={200} format="currency" kind="bars" currency={baseCurrency} />
        ) : (
          <PerformanceChart data={equity} height={200} format="currency" step currency={baseCurrency} />
        )}
      </div>

      <div className="journalCards">
        <StatCard
          label="P&L"
          tip={TIPS.pnl}
          value={stats.pnlCents !== 0 ? formatMoney(stats.pnlCents, baseCurrency, true) : "—"}
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
          value={stats.best ? formatMoney(stats.best.returnCents, baseCurrency, true) : "—"}
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
          onClick={onOpenJournal ? () => onOpenJournal(rangeKey) : undefined}
        />
        <StatCard
          label="Avg win / loss"
          tip={TIPS.avg}
          value={
            <span className="journalCard__pair">
              <span className="journalCard__pairItem journalCard__pairItem--gain">
                {stats.avgWinCents > 0 ? formatMoney(stats.avgWinCents, baseCurrency, true) : "—"}
              </span>
              <span className="journalCard__pairSep" />
              <span className="journalCard__pairItem journalCard__pairItem--loss">
                {stats.avgLossCents < 0 ? formatMoney(stats.avgLossCents, baseCurrency, true) : "—"}
              </span>
            </span>
          }
        />
        <StatCard
          label="Worst trade"
          tip={TIPS.worst}
          value={stats.worst ? formatMoney(stats.worst.returnCents, baseCurrency, true) : "—"}
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
