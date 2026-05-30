/**
 * Per-derived-value selectors. Each hook returns a primitive (or null
 * when data isn't ready), so Zustand's default Object.is equality
 * keeps re-renders surgical — a row only re-renders when its specific
 * value changes.
 *
 * `null` means "data not yet available". `0` means "computed and zero".
 * Components decide how to render the difference.
 */

import { useMemo } from "react";
import { useStore } from "./index";
import type { PricePoint } from "@/lib/priceHistory";
import type { Account, Holding } from "@/lib/mock";
import type { Trade, TradeSetup, TradeStatus } from "@/lib/trades";
import { deriveTotals, tradeDateKey } from "@/lib/tradeMath";
import { inRange, rangeFor, type DateRangeKey } from "@/lib/dateRange";

export type DeltaPeriod = "1D" | "1W" | "1M" | "YTD" | "1Y";

// ---------- raw lookups ----------

export const useHolding = (symbol: string): Holding | undefined =>
  useStore((s) => s.holdings.find((h) => h.symbol === symbol));

export const useHoldings = () => useStore((s) => s.holdings);
export const useAccounts = () => useStore((s) => s.accounts);
export const useAccountById = (id: string | undefined): Account | undefined =>
  useStore((s) => (id ? s.accounts.find((a) => a.id === id) : undefined));
export const useWeeklyPnl = () => useStore((s) => s.weeklyPnl);

export const usePriceStatus = (symbol: string) =>
  useStore((s) => s.prices[symbol]?.status ?? "idle");

export const usePricePoints = (symbol: string): PricePoint[] | null =>
  useStore((s) => s.prices[symbol]?.points ?? null);

// ---------- price-derived ----------

export const useLatestPrice = (symbol: string): number | null =>
  useStore((s) => {
    const pts = s.prices[symbol]?.points;
    return pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
  });

/** Returns dollars (not cents) for math; convert at the render boundary. */
function refPriceFor(points: PricePoint[], period: DeltaPeriod): number | null {
  if (points.length < 2) return null;
  switch (period) {
    case "1D":
      return points[points.length - 2]?.value ?? null;
    case "1W":
      return points[Math.max(0, points.length - 6)]?.value ?? null;
    case "1M":
      return points[Math.max(0, points.length - 22)]?.value ?? null;
    case "1Y":
      return points[Math.max(0, points.length - 252)]?.value ?? null;
    case "YTD": {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      return points.find((p) => p.time >= yearStart)?.value ?? null;
    }
  }
}

export const useHoldingDelta = (
  symbol: string,
  period: DeltaPeriod,
): number | null =>
  useStore((s) => {
    const pts = s.prices[symbol]?.points;
    if (!pts || pts.length < 2) return null;
    const last = pts[pts.length - 1]!.value;
    const ref = refPriceFor(pts, period);
    if (ref == null || ref === 0) return null;
    return (last - ref) / ref;
  });

/** Market value in integer cents (qty × latest price), or null if no price. */
export const useHoldingValueCents = (symbol: string): number | null =>
  useStore((s) => {
    const h = s.holdings.find((x) => x.symbol === symbol);
    const pts = s.prices[symbol]?.points;
    const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
    if (!h || last == null) return null;
    return Math.round(h.qty * last * 100);
  });

export const useUnrealizedCents = (symbol: string): number | null =>
  useStore((s) => {
    const h = s.holdings.find((x) => x.symbol === symbol);
    const pts = s.prices[symbol]?.points;
    const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
    if (!h || last == null) return null;
    const value = Math.round(h.qty * last * 100);
    const basis = h.qty * h.avgCostCents;
    return value - basis;
  });

// ---------- account aggregates ----------

/**
 * Account market value (sum of holding values for that account name + cash).
 * Returns null if any holding in the account is missing a price — we'd
 * rather show "—" than a misleading partial total.
 */
export const useAccountValueCents = (accountName: string): number | null =>
  useStore((s) => {
    const account = s.accounts.find((a) => a.name === accountName);
    if (!account) return null;
    const rows = s.holdings.filter((h) => h.account === accountName);
    let total = account.cashCents;
    for (const h of rows) {
      const pts = s.prices[h.symbol]?.points;
      const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
      if (last == null) return null;
      total += Math.round(h.qty * last * 100);
    }
    return total;
  });

export const useAccountDeltaCents = (
  accountName: string,
  period: DeltaPeriod,
): number | null =>
  useStore((s) => {
    const rows = s.holdings.filter((h) => h.account === accountName);
    let total = 0;
    for (const h of rows) {
      const pts = s.prices[h.symbol]?.points;
      if (!pts || pts.length < 2) return null;
      const last = pts[pts.length - 1]!.value;
      const ref = refPriceFor(pts, period);
      if (ref == null) return null;
      total += Math.round(h.qty * (last - ref) * 100);
    }
    return total;
  });

// ---------- portfolio totals ----------

export const usePortfolioValueCents = (): number | null =>
  useStore((s) => {
    let total = 0;
    for (const a of s.accounts) total += a.cashCents;
    for (const h of s.holdings) {
      const pts = s.prices[h.symbol]?.points;
      const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
      if (last == null) return null;
      total += Math.round(h.qty * last * 100);
    }
    return total;
  });

export const usePortfolioDeltaCents = (period: DeltaPeriod): number | null =>
  useStore((s) => {
    let total = 0;
    for (const h of s.holdings) {
      const pts = s.prices[h.symbol]?.points;
      if (!pts || pts.length < 2) return null;
      const last = pts[pts.length - 1]!.value;
      const ref = refPriceFor(pts, period);
      if (ref == null) return null;
      total += Math.round(h.qty * (last - ref) * 100);
    }
    return total;
  });

// ---------- actions (re-exported for ergonomic access) ----------

export const useLoadPrice = () => useStore((s) => s.loadPrice);
export const useLoadIntraday = () => useStore((s) => s.loadIntraday);
export const useRefreshAll = () => useStore((s) => s.refreshAll);
export const useSyncing = () => useStore((s) => s.syncing);
export const useLastSyncAt = () => useStore((s) => s.lastSyncAt);

export const useIntradayEntry = (
  symbol: string,
  startKey: string,
  endKey: string = startKey,
) => useStore((s) => s.intraday[`${symbol}|${startKey}|${endKey}`]);

// ---------- journal: raw lookups ----------

export const useTrades = (): Trade[] => useStore((s) => s.trades);
export const useSetups = (): TradeSetup[] => useStore((s) => s.setups);
export const useJournalRange = (): DateRangeKey => useStore((s) => s.journalRange);
export const useCalendarMonth = (): string => useStore((s) => s.calendarMonth);

export const useAddTrade = () => useStore((s) => s.addTrade);
export const useUpdateTrade = () => useStore((s) => s.updateTrade);
export const useDeleteTrade = () => useStore((s) => s.deleteTrade);
export const useAddSetup = () => useStore((s) => s.addSetup);
export const useDeleteSetup = () => useStore((s) => s.deleteSetup);
export const useSetJournalRange = () => useStore((s) => s.setJournalRange);
export const useSetCalendarMonth = () => useStore((s) => s.setCalendarMonth);
export const useClearDemoTrades = () => useStore((s) => s.clearDemoTrades);
export const useRestoreDemoTrades = () => useStore((s) => s.restoreDemoTrades);
export const useClearDemoPortfolio = () => useStore((s) => s.clearDemoPortfolio);
export const useRestoreDemoPortfolio = () => useStore((s) => s.restoreDemoPortfolio);

export const useDemoCounts = (): { demo: number; real: number } => {
  const trades = useStore((s) => s.trades);
  return useMemo(() => {
    let demo = 0;
    let real = 0;
    for (const t of trades) {
      if (t.source === "demo") demo++;
      else real++;
    }
    return { demo, real };
  }, [trades]);
};

export const usePortfolioDemoCounts = (): {
  demoAccounts: number;
  realAccounts: number;
  demoHoldings: number;
  realHoldings: number;
} => {
  const accounts = useStore((s) => s.accounts);
  const holdings = useStore((s) => s.holdings);
  return useMemo(() => {
    let demoA = 0;
    let realA = 0;
    let demoH = 0;
    let realH = 0;
    for (const a of accounts) {
      if (a.source === "demo") demoA++;
      else realA++;
    }
    for (const h of holdings) {
      if (h.source === "demo") demoH++;
      else realH++;
    }
    return {
      demoAccounts: demoA,
      realAccounts: realA,
      demoHoldings: demoH,
      realHoldings: realH,
    };
  }, [accounts, holdings]);
};

// ---------- IBKR ----------

export const useIbkrToken = () => useStore((s) => s.ibkrToken);
export const useIbkrQueryId = () => useStore((s) => s.ibkrQueryId);
export const useIbkrStatus = () => useStore((s) => s.ibkrStatus);
export const useIbkrError = () => useStore((s) => s.ibkrError);
export const useIbkrLastSyncAt = () => useStore((s) => s.ibkrLastSyncAt);
export const useIbkrLastSummary = () => useStore((s) => s.ibkrLastSummary);
export const useSetIbkrToken = () => useStore((s) => s.setIbkrToken);
export const useSetIbkrQueryId = () => useStore((s) => s.setIbkrQueryId);
export const useClearIbkrCredentials = () => useStore((s) => s.clearIbkrCredentials);
export const useSyncIbkr = () => useStore((s) => s.syncIbkr);
export const useImportIbkrXml = () => useStore((s) => s.importIbkrXml);

// ---------- toasts ----------

export const useToasts = () => useStore((s) => s.toasts);
export const usePushToast = () => useStore((s) => s.pushToast);
export const useDismissToast = () => useStore((s) => s.dismissToast);

export const useTrade = (id: string | null): Trade | null =>
  useStore((s) => (id ? s.trades.find((t) => t.id === id) ?? null : null));

// ---------- journal: derived ----------

/** Trades whose closing (or only) execution date falls in the active range. */
export const useFilteredTrades = (): Trade[] => {
  const trades = useStore((s) => s.trades);
  const journalRange = useStore((s) => s.journalRange);
  return useMemo(() => {
    const range = rangeFor(journalRange);
    return trades.filter((t) => {
      const key = tradeDateKey(t);
      return key === "" ? false : inRange(key, range);
    });
  }, [trades, journalRange]);
};

export type JournalStats = {
  wins: number;
  losses: number;
  open: number;
  avgWinCents: number;
  avgLossCents: number;
  /** Avg % gain per winning trade (positive). */
  avgWinPct: number;
  /** Avg % loss per losing trade (negative). */
  avgLossPct: number;
  pnlCents: number;
  /** Win-rate ratio over closed (non-OPEN) trades. */
  winRate: number;
  /** Net pnl as a ratio of total entry capital deployed (closed trades only). */
  returnPct: number;
  /** P/L series, one bucket per trade (for sparkline). */
  cumulativeSeries: { at: string; cumulativeCents: number }[];
};

export const useTradeStats = (): JournalStats => {
  const trades = useFilteredTrades();
  return useMemo(() => computeStats(trades), [trades]);
};

function computeStats(trades: Trade[]): JournalStats {
  let wins = 0;
  let losses = 0;
  let open = 0;
  let winSumCents = 0;
  let lossSumCents = 0;
  let winPctSum = 0;
  let lossPctSum = 0;
  let pnlCents = 0;
  let entryCapitalCents = 0;

  const closed: { at: string; returnCents: number }[] = [];

  for (const t of trades) {
    const tot = deriveTotals(t);
    const status: TradeStatus = tot.status;
    if (status === "OPEN") {
      open++;
      continue;
    }
    pnlCents += tot.returnCents;
    entryCapitalCents += tot.entryTotalCents;
    closed.push({ at: tradeDateKey(t), returnCents: tot.returnCents });
    if (status === "WIN") {
      wins++;
      winSumCents += tot.returnCents;
      if (tot.returnPct != null) winPctSum += tot.returnPct;
    } else {
      losses++;
      lossSumCents += tot.returnCents;
      if (tot.returnPct != null) lossPctSum += tot.returnPct;
    }
  }

  closed.sort((a, b) => a.at.localeCompare(b.at));
  let running = 0;
  const cumulativeSeries = closed.map((c) => {
    running += c.returnCents;
    return { at: c.at, cumulativeCents: running };
  });

  const totalClosed = wins + losses;
  return {
    wins,
    losses,
    open,
    avgWinCents: wins > 0 ? Math.round(winSumCents / wins) : 0,
    avgLossCents: losses > 0 ? Math.round(lossSumCents / losses) : 0,
    avgWinPct: wins > 0 ? winPctSum / wins : 0,
    avgLossPct: losses > 0 ? lossPctSum / losses : 0,
    pnlCents,
    winRate: totalClosed > 0 ? wins / totalClosed : 0,
    returnPct: entryCapitalCents > 0 ? pnlCents / entryCapitalCents : 0,
    cumulativeSeries,
  };
}

/** All trades whose closing date matches the given ISO date (YYYY-MM-DD). */
export const useDayTrades = (dateKey: string): Trade[] => {
  const trades = useStore((s) => s.trades);
  return useMemo(
    () => trades.filter((t) => tradeDateKey(t) === dateKey),
    [trades, dateKey],
  );
};

export type DaySummary = {
  dateKey: string;
  pnlCents: number;
  count: number;
  wins: number;
  losses: number;
  returnPct: number;
};

export type MonthStats = {
  pnlCents: number;
  returnPct: number;
  wins: number;
  losses: number;
  open: number;
  trades: number;
};

/**
 * Aggregate stats for a given month (YYYY-MM). Trades are bucketed by
 * their close-date (or only execution date if still open). Return % is
 * capital-weighted: sum of realized P/L divided by sum of entry capital.
 */
export const useMonthStats = (monthIso: string): MonthStats => {
  const trades = useStore((s) => s.trades);
  return useMemo(() => {
    const yyyymm = monthIso.slice(0, 7);
    let pnlCents = 0;
    let capitalCents = 0;
    let wins = 0;
    let losses = 0;
    let open = 0;
    let count = 0;
    for (const t of trades) {
      const key = tradeDateKey(t);
      if (key === "" || !key.startsWith(yyyymm)) continue;
      count++;
      const tot = deriveTotals(t);
      if (tot.status === "OPEN") {
        open++;
        continue;
      }
      pnlCents += tot.returnCents;
      capitalCents += tot.entryTotalCents;
      if (tot.status === "WIN") wins++;
      else losses++;
    }
    return {
      pnlCents,
      returnPct: capitalCents > 0 ? pnlCents / capitalCents : 0,
      wins,
      losses,
      open,
      trades: count,
    };
  }, [trades, monthIso]);
};

/** Per-day P/L summary keyed by ISO date — for the calendar grid. */
export const useTradesByDay = (): Map<string, DaySummary> => {
  const trades = useStore((s) => s.trades);
  return useMemo(() => {
    const out = new Map<string, DaySummary>();
    for (const t of trades) {
      const key = tradeDateKey(t);
      if (key === "") continue;
      const tot = deriveTotals(t);
      if (tot.status === "OPEN") continue;
      const cur = out.get(key) ?? {
        dateKey: key,
        pnlCents: 0,
        count: 0,
        wins: 0,
        losses: 0,
        returnPct: 0,
      };
      cur.pnlCents += tot.returnCents;
      cur.count += 1;
      if (tot.status === "WIN") cur.wins += 1;
      else cur.losses += 1;
      if (tot.returnPct != null) {
        cur.returnPct = cur.returnPct + tot.returnPct;
      }
      out.set(key, cur);
    }
    return out;
  }, [trades]);
};
