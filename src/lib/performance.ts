/**
 * Trading-edge & risk analytics — the aggregate "where does my edge come from"
 * layer behind the Performance page. All-time (range-independent), pure, in
 * integer cents. Operates on closed trades only; OPEN positions are ignored
 * since they carry no realized result yet.
 */

import { parseOccSymbol } from "./optionSymbol";
import { deriveTotals } from "./tradeMath";
import type { Market, Side, Trade } from "./trades";
import { tradeDateKey } from "./tradeMath";

/** One closed trade, flattened to the fields the breakdowns slice on. */
export type ClosedRow = {
  id: string;
  /** Display symbol — option contracts collapse to their underlying. */
  symbol: string;
  side: Side;
  market: Market;
  tags: string[];
  returnCents: number;
  rMultiple: number | null;
  holdMs: number | null;
  /** Exit day (YYYY-MM-DD). */
  dateKey: string;
};

export type EdgeSummary = {
  netCents: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Net P/L per closed trade. */
  expectancyCents: number;
  /** Gross profit ÷ gross loss. null when there are no losses (or no trades). */
  profitFactor: number | null;
  avgWinCents: number;
  /** Signed (negative). */
  avgLossCents: number;
  /** Avg win ÷ |avg loss|. null without both sides. */
  payoffRatio: number | null;
  /** Mean R across trades that have a stop-defined R. null if none. */
  avgR: number | null;
  /** Signed run length ending at the latest trade: +3 = 3 wins, −2 = 2 losses. */
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  greenDays: number;
  redDays: number;
  pctGreenDays: number;
  avgUpDayCents: number;
  avgDownDayCents: number;
  /** Largest peak-to-trough drop on the cumulative equity curve (positive cents). */
  maxDrawdownCents: number;
  /** Max drawdown relative to the peak it fell from. null if peak ≤ 0. */
  maxDrawdownPct: number | null;
  /** Drop from the all-time peak to the latest equity (positive cents). */
  currentDrawdownCents: number;
};

export type EquityPoint = { at: string; value: number; valueCents: number };

export type RBucket = { label: string; count: number; pnlCents: number; positive: boolean };

export type BreakdownRow = {
  label: string;
  pnlCents: number;
  count: number;
  wins: number;
  winRate: number;
};

export type Performance = {
  summary: EdgeSummary;
  rows: ClosedRow[];
  /** Cumulative equity per closed trade, chronological. Anchored at $0. */
  equity: EquityPoint[];
  rBuckets: RBucket[];
};

function displaySymbol(symbol: string): string {
  return parseOccSymbol(symbol)?.underlying ?? symbol;
}

/** R-multiple histogram bins, low → high. */
const R_BINS: { label: string; lo: number; hi: number; positive: boolean }[] = [
  { label: "≤ −2R", lo: -Infinity, hi: -2, positive: false },
  { label: "−2…−1R", lo: -2, hi: -1, positive: false },
  { label: "−1…0R", lo: -1, hi: 0, positive: false },
  { label: "0…1R", lo: 0, hi: 1, positive: true },
  { label: "1…2R", lo: 1, hi: 2, positive: true },
  { label: "2…3R", lo: 2, hi: 3, positive: true },
  { label: "≥ 3R", lo: 3, hi: Infinity, positive: true },
];

export function computePerformance(trades: Trade[]): Performance {
  const rows: ClosedRow[] = [];
  for (const t of trades) {
    const tot = deriveTotals(t);
    if (tot.status === "OPEN") continue;
    rows.push({
      id: t.id,
      symbol: displaySymbol(t.symbol),
      side: t.side,
      market: t.market,
      tags: t.tags,
      returnCents: tot.returnCents,
      rMultiple: tot.rMultiple,
      holdMs: tot.holdMs,
      dateKey: tradeDateKey(t),
    });
  }
  // Chronological — equity, streaks and drawdown all read in trade order.
  rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  let netCents = 0;
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0; // positive magnitude
  let rSum = 0;
  let rCount = 0;

  for (const r of rows) {
    netCents += r.returnCents;
    if (r.returnCents > 0) {
      wins++;
      grossProfit += r.returnCents;
    } else {
      losses++;
      grossLoss += -r.returnCents;
    }
    if (r.rMultiple != null) {
      rSum += r.rMultiple;
      rCount++;
    }
  }

  const trades_ = rows.length;
  const winRate = trades_ > 0 ? wins / trades_ : 0;
  const avgWinCents = wins > 0 ? Math.round(grossProfit / wins) : 0;
  const avgLossCents = losses > 0 ? -Math.round(grossLoss / losses) : 0;

  // Streaks (chronological).
  let currentStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let run = 0; // signed running streak
  for (const r of rows) {
    const win = r.returnCents > 0;
    if (win) run = run > 0 ? run + 1 : 1;
    else run = run < 0 ? run - 1 : -1;
    longestWinStreak = Math.max(longestWinStreak, run);
    longestLossStreak = Math.min(longestLossStreak, run);
    currentStreak = run;
  }

  // Per-day consistency.
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.dateKey, (byDay.get(r.dateKey) ?? 0) + r.returnCents);
  let greenDays = 0;
  let redDays = 0;
  let upSum = 0;
  let downSum = 0;
  for (const cents of byDay.values()) {
    if (cents > 0) {
      greenDays++;
      upSum += cents;
    } else if (cents < 0) {
      redDays++;
      downSum += cents;
    }
  }
  const tradedDays = greenDays + redDays;

  // Equity curve + drawdown.
  const equity: EquityPoint[] = [];
  let running = 0;
  let peak = 0;
  let maxDrawdownCents = 0;
  let maxDrawdownPct: number | null = null;
  for (const r of rows) {
    running += r.returnCents;
    equity.push({ at: r.dateKey, value: running / 100, valueCents: running });
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdownCents) {
      maxDrawdownCents = dd;
      maxDrawdownPct = peak > 0 ? dd / peak : null;
    }
  }
  const currentDrawdownCents = peak - running;

  // R-multiple distribution.
  const rBuckets: RBucket[] = R_BINS.map((b) => ({
    label: b.label,
    count: 0,
    pnlCents: 0,
    positive: b.positive,
  }));
  for (const r of rows) {
    if (r.rMultiple == null) continue;
    const idx = R_BINS.findIndex((b) => r.rMultiple! >= b.lo && r.rMultiple! < b.hi);
    if (idx >= 0) {
      rBuckets[idx]!.count++;
      rBuckets[idx]!.pnlCents += r.returnCents;
    }
  }

  const summary: EdgeSummary = {
    netCents,
    trades: trades_,
    wins,
    losses,
    winRate,
    expectancyCents: trades_ > 0 ? Math.round(netCents / trades_) : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgWinCents,
    avgLossCents,
    payoffRatio: avgLossCents < 0 ? avgWinCents / -avgLossCents : null,
    avgR: rCount > 0 ? rSum / rCount : null,
    currentStreak,
    longestWinStreak,
    longestLossStreak: Math.abs(longestLossStreak),
    greenDays,
    redDays,
    pctGreenDays: tradedDays > 0 ? greenDays / tradedDays : 0,
    avgUpDayCents: greenDays > 0 ? Math.round(upSum / greenDays) : 0,
    avgDownDayCents: redDays > 0 ? Math.round(downSum / redDays) : 0,
    maxDrawdownCents,
    maxDrawdownPct,
    currentDrawdownCents,
  };

  return { summary, rows, equity, rBuckets };
}

/** Segmentation dimensions the Performance page can slice P&L by. */
export type BreakdownDimension =
  | "tag"
  | "symbol"
  | "side"
  | "market"
  | "weekday"
  | "hold";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Bucket a hold duration (ms) into a coarse band. */
function holdBucket(ms: number | null): string {
  if (ms == null) return "Unknown";
  const days = ms / 86_400_000;
  if (days < 1) return "Intraday";
  if (days < 3) return "1–3 days";
  if (days < 10) return "3–10 days";
  return "10+ days";
}

/** Keys a row contributes to for a dimension. Most dimensions yield one key;
 *  tags yield many (or "Untagged"). */
function keysFor(row: ClosedRow, dim: BreakdownDimension): string[] {
  switch (dim) {
    case "tag":
      return row.tags.length > 0 ? row.tags : ["Untagged"];
    case "symbol":
      return [row.symbol];
    case "side":
      return [row.side === "LONG" ? "Long" : "Short"];
    case "market":
      return [row.market];
    case "weekday":
      return [WEEKDAYS[new Date(`${row.dateKey}T00:00:00`).getDay()] ?? "—"];
    case "hold":
      return [holdBucket(row.holdMs)];
  }
}

/**
 * P&L breakdown of closed rows by a dimension, sorted by net P&L descending.
 * A trade with N tags counts toward N tag groups (the only multi-key case).
 */
export function breakdownBy(rows: ClosedRow[], dim: BreakdownDimension): BreakdownRow[] {
  const map = new Map<string, { pnlCents: number; count: number; wins: number }>();
  for (const row of rows) {
    for (const key of keysFor(row, dim)) {
      const cur = map.get(key) ?? { pnlCents: 0, count: 0, wins: 0 };
      cur.pnlCents += row.returnCents;
      cur.count++;
      if (row.returnCents > 0) cur.wins++;
      map.set(key, cur);
    }
  }
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      pnlCents: v.pnlCents,
      count: v.count,
      wins: v.wins,
      winRate: v.count > 0 ? v.wins / v.count : 0,
    }))
    .sort((a, b) => b.pnlCents - a.pnlCents);
}
