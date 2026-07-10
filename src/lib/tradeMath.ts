/**
 * Derived calculations for a Trade. All inputs and outputs in integer cents
 * where applicable. These are pure functions — call freely from selectors,
 * tables, modals, stats. Single source of truth.
 */

import type { Side, Trade, TradeExecution, TradeStatus } from "./trades";
import { contractMultiplier } from "./optionSymbol";
import { fxRateOnOrBefore, latestFxRate, type FxSeriesSource } from "./fx";

/**
 * Planned risk:reward ratio for an entry/target/stop triple. Returns null
 * when any leg is missing or the risk side is zero/inverted (stop on the
 * wrong side of entry). Shared by the trade form and setup terminal.
 */
export function riskReward(
  entryCents: number | null | undefined,
  targetCents: number | null | undefined,
  stopCents: number | null | undefined,
  side: Side,
): number | null {
  if (entryCents == null || targetCents == null || stopCents == null) return null;
  const sign = side === "LONG" ? 1 : -1;
  const reward = sign * (targetCents - entryCents);
  const risk = sign * (entryCents - stopCents);
  if (risk <= 0) return null;
  return reward / risk;
}

export type TradeTotals = {
  /** Sum of opening-side executions (BUY for LONG, SELL for SHORT), priceCents × qty. */
  entryTotalCents: number;
  /** Sum of closing-side executions (SELL for LONG, BUY for SHORT). 0 if still open. */
  exitTotalCents: number;
  /** Total fees across all executions. */
  feeCents: number;
  /** Realized P/L (signed cents). 0 while OPEN. */
  returnCents: number;
  /** Realized return as a decimal ratio (0.0467 = 4.67%). null while OPEN. */
  returnPct: number | null;
  /** Net qty still open (opening qty − closing qty). 0 = closed. */
  positionQty: number;
  /** Weighted-avg entry price in cents. null if no opening execs. */
  avgEntryCents: number | null;
  /** Weighted-avg exit price in cents. null if no closing execs. */
  avgExitCents: number | null;
  /** ms between first opening and last closing exec; null if open. */
  holdMs: number | null;
  /** ISO timestamp of the first opening execution; null if none. Lets the
   *  UI show a live hold duration (now − openedAt) for OPEN positions. */
  openedAt: string | null;
  /** R = return / risk-per-share-from-stop × initial size. null if no stop. */
  rMultiple: number | null;
  /** Derived: OPEN | WIN | LOSS. */
  status: TradeStatus;
};

export function deriveTotals(trade: Trade): TradeTotals {
  const openingAction = trade.side === "LONG" ? "BUY" : "SELL";

  let openingQty = 0;
  let openingNotionalCents = 0;
  let closingQty = 0;
  let closingNotionalCents = 0;
  let feeCents = 0;
  let firstOpeningAt: string | null = null;
  let lastClosingAt: string | null = null;

  for (const ex of trade.executions) {
    feeCents += ex.feeCents;
    const notional = ex.qty * ex.priceCents;
    if (ex.action === openingAction) {
      openingQty += ex.qty;
      openingNotionalCents += notional;
      if (firstOpeningAt == null || ex.at < firstOpeningAt) firstOpeningAt = ex.at;
    } else {
      closingQty += ex.qty;
      closingNotionalCents += notional;
      if (lastClosingAt == null || ex.at > lastClosingAt) lastClosingAt = ex.at;
    }
  }

  const positionQty = openingQty - closingQty;
  const matchedQty = Math.min(openingQty, closingQty);

  // Options settle per 100-share contract: monetary totals scale by the
  // contract multiplier while the per-share price (avgEntry/avgExit) does not.
  const mult = contractMultiplier(trade.symbol);

  const avgEntryCents = openingQty > 0 ? Math.round(openingNotionalCents / openingQty) : null;
  const avgExitCents = closingQty > 0 ? Math.round(closingNotionalCents / closingQty) : null;

  // Cost basis of the matched (closed) portion only — open shares don't count
  // toward realized P/L.
  const matchedEntryCents = avgEntryCents != null ? matchedQty * avgEntryCents * mult : 0;
  const matchedExitCents = avgExitCents != null ? matchedQty * avgExitCents * mult : 0;

  let returnCents = 0;
  if (matchedQty > 0) {
    const sideSign = trade.side === "LONG" ? 1 : -1;
    returnCents = sideSign * (matchedExitCents - matchedEntryCents) - feeCents;
  }

  const returnPct =
    matchedQty > 0 && matchedEntryCents > 0
      ? returnCents / matchedEntryCents
      : null;

  const holdMs =
    firstOpeningAt && lastClosingAt && positionQty === 0
      ? new Date(lastClosingAt).getTime() - new Date(firstOpeningAt).getTime()
      : null;

  let rMultiple: number | null = null;
  if (
    trade.stopCents != null &&
    avgEntryCents != null &&
    matchedQty > 0
  ) {
    const riskPerShare =
      trade.side === "LONG"
        ? avgEntryCents - trade.stopCents
        : trade.stopCents - avgEntryCents;
    const initialRisk = riskPerShare * matchedQty * mult;
    if (initialRisk > 0) {
      rMultiple = returnCents / initialRisk;
    }
  }

  let status: TradeStatus;
  if (positionQty > 0) status = "OPEN";
  else if (returnCents > 0) status = "WIN";
  else status = "LOSS";

  return {
    entryTotalCents: openingNotionalCents * mult,
    exitTotalCents: closingNotionalCents * mult,
    feeCents,
    returnCents,
    returnPct,
    positionQty,
    avgEntryCents,
    avgExitCents,
    holdMs,
    openedAt: firstOpeningAt,
    rMultiple,
    status,
  };
}

/**
 * Rate for converting a trade's native-currency cents into `base` cents,
 * preferring the FX close on the trade's (close) date, else the latest
 * rate, else 1. The `?? 1` is a documented transient: on first render
 * before the FX series lands, journal aggregates briefly show
 * native-summed numbers — same class as an unpriced holding.
 */
export function tradeFxRate(
  trade: Trade,
  base: string,
  prices: FxSeriesSource,
): number {
  const cur = trade.currency ?? "USD";
  if (cur === base) return 1;
  return (
    fxRateOnOrBefore(cur, base, tradeDateKey(trade), prices) ??
    latestFxRate(cur, base, prices) ??
    1
  );
}

/** ISO date (YYYY-MM-DD) of the trade's last execution — used for calendar bucketing. */
export function tradeDateKey(trade: Trade): string {
  if (trade.executions.length === 0) return "";
  const last = trade.executions.reduce((a, b) => (b.at > a.at ? b : a));
  return last.at.slice(0, 10);
}

/** ISO date of the trade's *first* execution — used for sort-by-date in the journal table. */
export function tradeOpenedKey(trade: Trade): string {
  if (trade.executions.length === 0) return "";
  const first = trade.executions.reduce((a, b) => (b.at < a.at ? b : a));
  return first.at.slice(0, 10);
}

/**
 * Merge executions that share action + timestamp + price. IBKR commonly
 * splits a single order into multiple "slot" fills at the same instant
 * and same price; downstream display should treat them as one line.
 * Quantities and fees are summed. Returns a chronologically-sorted copy
 * — does not mutate the input. Underlying Trade.executions is left
 * untouched so editing / re-syncing keeps the original granularity.
 */
export function coalesceExecutions(execs: TradeExecution[]): TradeExecution[] {
  const groups = new Map<string, TradeExecution>();
  for (const ex of execs) {
    const key = `${ex.action}|${ex.at}|${ex.priceCents}`;
    const existing = groups.get(key);
    if (existing) {
      existing.qty += ex.qty;
      existing.feeCents += ex.feeCents;
    } else {
      groups.set(key, { ...ex });
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.at.localeCompare(b.at));
}

/** Format hold duration as "2 MIN" / "1 HR" / "3 D" — short labels per Stonk Journal style. */
export function formatHold(ms: number | null): string {
  if (ms == null) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} MIN`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} HR`;
  const d = Math.round(hr / 24);
  return `${d} D`;
}
