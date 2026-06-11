/**
 * Per-derived-value selectors. Each hook returns a primitive (or null
 * when data isn't ready), so Zustand's default Object.is equality
 * keeps re-renders surgical — a row only re-renders when its specific
 * value changes.
 *
 * `null` means "data not yet available". `0` means "computed and zero".
 * Components decide how to render the difference.
 */

import { useEffect, useMemo } from "react";
import { ALL_ACCOUNTS, useStore, type IntradayEntry } from "./index";
import { intradayCacheKey } from "@/lib/yahoo";
import type { PricePoint } from "@/lib/priceHistory";
import type { Account, Holding } from "@/lib/mock";
import type { Trade, TradeSetup, TradeStatus } from "@/lib/trades";
import { deriveTotals, tradeDateKey } from "@/lib/tradeMath";
import { contractMultiplier, parseOccSymbol } from "@/lib/optionSymbol";
import { inRange, rangeFor, type DateRangeKey } from "@/lib/dateRange";
import type { PctPoint, PerfRange } from "@/lib/perf";

export type DeltaPeriod = "1D" | "1W" | "1M" | "YTD" | "1Y";

// ---------- raw lookups ----------

export const useHolding = (symbol: string): Holding | undefined =>
  useStore((s) => s.holdings.find((h) => h.symbol === symbol));

export const useHoldings = () => useStore((s) => s.holdings);

/** A holding plus its price-derived metrics — precomputed at the table level
 *  so the data table can sort by value / day / unrealized P&L. */
export type HoldingMetrics = {
  holding: Holding;
  /** Per-unit price in cents (live Yahoo, else broker mark). null = no price. */
  priceCents: number | null;
  valueCents: number | null;
  dayPct: number | null;
  unrealCents: number | null;
  unrealPct: number | null;
};

export const useHoldingsMetrics = (accountId?: string): HoldingMetrics[] => {
  const holdings = useStore((s) => s.holdings);
  const prices = useStore((s) => s.prices);
  const optionPrices = useStore((s) => s.optionPrices);
  return useMemo(() => {
    const rows = accountId
      ? holdings.filter((h) => h.accountId === accountId)
      : holdings;
    return rows.map((h) => {
      const priceCents = unitPriceCentsFor(h, prices, optionPrices);
      const valueCents =
        priceCents == null
          ? null
          : Math.round(h.qty * priceCents * contractMultiplier(h.symbol));
      const basis = holdingBasisCents(h);
      const unrealCents = valueCents == null ? null : valueCents - basis;
      const unrealPct =
        unrealCents != null && basis > 0 ? unrealCents / basis : null;
      // 1-day change from the daily series (options use the MarketData series;
      // null when history is too short).
      const pts = parseOccSymbol(h.symbol)
        ? optionPrices[h.symbol]?.points
        : prices[h.symbol]?.points;
      let dayPct: number | null = null;
      if (pts && pts.length >= 2) {
        const last = pts[pts.length - 1]!.value;
        const prev = pts[pts.length - 2]!.value;
        if (prev !== 0) dayPct = (last - prev) / prev;
      }
      return { holding: h, priceCents, valueCents, dayPct, unrealCents, unrealPct };
    });
  }, [holdings, prices, optionPrices, accountId]);
};
export const useAccounts = () => useStore((s) => s.accounts);
export const useAccountById = (id: string | undefined): Account | undefined =>
  useStore((s) => (id ? s.accounts.find((a) => a.id === id) : undefined));
export const useWeeklyPnl = () => useStore((s) => s.weeklyPnl);

// ---------- account scope + CRUD ----------

export const useSelectedAccountId = (): string =>
  useStore((s) => s.selectedAccountId);
export const useSetSelectedAccount = () => useStore((s) => s.setSelectedAccount);
export const useAddAccount = () => useStore((s) => s.addAccount);
export const useUpdateAccount = () => useStore((s) => s.updateAccount);
export const useRemoveAccount = () => useStore((s) => s.removeAccount);
export const useResetAccount = () => useStore((s) => s.resetAccount);
export const useAddHolding = () => useStore((s) => s.addHolding);
export const useUpdateHolding = () => useStore((s) => s.updateHolding);
export const useRemoveHolding = () => useStore((s) => s.removeHolding);

export const usePriceStatus = (symbol: string) =>
  useStore((s) => s.prices[symbol]?.status ?? "idle");

export const usePricePoints = (symbol: string): PricePoint[] | null =>
  useStore((s) => s.prices[symbol]?.points ?? null);

// ---------- option pricing (MarketData.app, open positions only) ----------

export const useOptionPriceStatus = (symbol: string) =>
  useStore((s) => s.optionPrices[symbol]?.status ?? "idle");

export const useOptionPricePoints = (symbol: string): PricePoint[] | null =>
  useStore((s) => s.optionPrices[symbol]?.points ?? null);

export const useOptionPriceError = (symbol: string) =>
  useStore((s) => s.optionPrices[symbol]?.errorKind ?? null);

export const useLoadOptionPrice = () => useStore((s) => s.loadOptionPrice);

export const useMarketDataToken = (): string | null =>
  useStore((s) => s.marketDataToken);

export const useSetMarketDataToken = () => useStore((s) => s.setMarketDataToken);

// ---------- price-derived ----------

export const useLatestPrice = (symbol: string): number | null =>
  useStore((s) => {
    const pts = s.prices[symbol]?.points;
    return pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
  });

/**
 * Per-unit price for a holding, in cents. Options use the MarketData.app live
 * mark (latest point in `optionPrices`) when available, else the broker's last
 * mark (`lastPriceCents`). Equities use the live Yahoo close, else `lastPriceCents`.
 * null when neither is available.
 */
function unitPriceCentsFor(
  h: Holding,
  prices: Record<string, { points?: PricePoint[] }>,
  optionPrices?: Record<string, { points?: PricePoint[] }>,
): number | null {
  if (parseOccSymbol(h.symbol)) {
    const opts = optionPrices?.[h.symbol]?.points;
    const live = opts && opts.length > 0 ? opts[opts.length - 1]!.value : null;
    if (live != null) return Math.round(live * 100);
    return h.lastPriceCents ?? null;
  }
  const pts = prices[h.symbol]?.points;
  const live = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
  if (live != null) return Math.round(live * 100);
  return h.lastPriceCents ?? null;
}

/** Market value of a holding in cents: qty × price × contract multiplier
 *  (options settle ×100). null when the holding has no price yet. */
function holdingValueCents(
  h: Holding,
  prices: Record<string, { points?: PricePoint[] }>,
  optionPrices?: Record<string, { points?: PricePoint[] }>,
): number | null {
  const unit = unitPriceCentsFor(h, prices, optionPrices);
  if (unit == null) return null;
  return Math.round(h.qty * unit * contractMultiplier(h.symbol));
}

/** Cost basis of a holding in cents: qty × avg cost × contract multiplier. */
function holdingBasisCents(h: Holding): number {
  return Math.round(h.qty * h.avgCostCents * contractMultiplier(h.symbol));
}

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
    // Options pull their series from the MarketData cache; equities from Yahoo.
    // Delta is a ratio so the ×100 contract multiplier cancels out.
    const pts = parseOccSymbol(symbol)
      ? s.optionPrices[symbol]?.points
      : s.prices[symbol]?.points;
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
    if (!h) return null;
    return holdingValueCents(h, s.prices, s.optionPrices);
  });

export const useUnrealizedCents = (symbol: string): number | null =>
  useStore((s) => {
    const h = s.holdings.find((x) => x.symbol === symbol);
    if (!h) return null;
    const value = holdingValueCents(h, s.prices, s.optionPrices);
    if (value == null) return null;
    return value - holdingBasisCents(h);
  });

// ---------- account aggregates ----------

/** Cash + sum of holding values, or null while any holding lacks a price —
 *  we'd rather show "—" than a misleading partial total. */
function accountValueCentsOf(
  account: Account,
  rows: Holding[],
  prices: Record<string, { points?: PricePoint[] }>,
  optionPrices: Record<string, { points?: PricePoint[] }>,
): number | null {
  let total = account.cashCents;
  for (const h of rows) {
    const v = holdingValueCents(h, prices, optionPrices);
    if (v == null) return null;
    total += v;
  }
  return total;
}

/**
 * Account market value (sum of holding values for that account + cash).
 * Returns null if any holding in the account is missing a price.
 */
export const useAccountValueCents = (accountId: string): number | null =>
  useStore((s) => {
    const account = s.accounts.find((a) => a.id === accountId);
    if (!account) return null;
    const rows = s.holdings.filter((h) => h.accountId === accountId);
    return accountValueCentsOf(account, rows, s.prices, s.optionPrices);
  });

/**
 * Sum of qty × price-change over the period for a set of holdings, in cents.
 * Options use their MarketData series (×100 contract multiplier) when
 * available, else contribute 0 — a flat broker mark shouldn't blank the
 * whole account's delta. Stocks with no series yet return null (loading).
 */
function holdingsDeltaCents(
  rows: Holding[],
  period: DeltaPeriod,
  prices: Record<string, { points?: PricePoint[] }>,
  optionPrices: Record<string, { points?: PricePoint[] }>,
): number | null {
  let total = 0;
  for (const h of rows) {
    if (parseOccSymbol(h.symbol)) {
      const pts = optionPrices[h.symbol]?.points;
      if (pts && pts.length >= 2) {
        const last = pts[pts.length - 1]!.value;
        const ref = refPriceFor(pts, period);
        if (ref != null) {
          total += Math.round(
            h.qty * (last - ref) * contractMultiplier(h.symbol) * 100,
          );
        }
      }
      continue;
    }
    const pts = prices[h.symbol]?.points;
    if (!pts || pts.length < 2) return null;
    const last = pts[pts.length - 1]!.value;
    const ref = refPriceFor(pts, period);
    if (ref == null) return null;
    total += Math.round(h.qty * (last - ref) * 100);
  }
  return total;
}

export const useAccountDeltaCents = (
  accountId: string,
  period: DeltaPeriod,
): number | null =>
  useStore((s) =>
    holdingsDeltaCents(
      s.holdings.filter((h) => h.accountId === accountId),
      period,
      s.prices,
      s.optionPrices,
    ),
  );

/**
 * Rate-of-return headline: derived value vs. net contributions.
 * `gainCents = value − contributions`; `returnPct = gain / contributions`.
 * Returns null until the account's value is fully priced. This — NOT the
 * sum of realized closed trades — is the account's headline number.
 */
export type ReturnStat = { gainCents: number; returnPct: number | null };

// NOTE: build the return object via useMemo over primitive selectors — never
// inside a useStore selector. Returning a fresh object from the store selector
// breaks useSyncExternalStore's identity check and infinite-loops.
export const useAccountReturn = (accountId: string): ReturnStat | null => {
  const value = useAccountValueCents(accountId);
  const account = useAccountById(accountId);
  return useMemo(() => {
    if (account == null || value == null) return null;
    const contrib = account.netContributionsCents;
    return {
      gainCents: value - contrib,
      returnPct: contrib > 0 ? (value - contrib) / contrib : null,
    };
  }, [value, account]);
};

// ---------- portfolio totals ----------

export const usePortfolioValueCents = (): number | null =>
  useStore((s) => {
    let total = 0;
    for (const a of s.accounts) total += a.cashCents;
    for (const h of s.holdings) {
      const v = holdingValueCents(h, s.prices, s.optionPrices);
      if (v == null) return null;
      total += v;
    }
    return total;
  });

export const usePortfolioDeltaCents = (period: DeltaPeriod): number | null =>
  useStore((s) => holdingsDeltaCents(s.holdings, period, s.prices, s.optionPrices));

/** Sum of every account's net contributions — the portfolio cost basis. */
export const usePortfolioContributionsCents = (): number =>
  useStore((s) => s.accounts.reduce((a, acc) => a + acc.netContributionsCents, 0));

/** Portfolio rate-of-return: total derived value vs. total contributions.
 *  Reconciles by construction — value is Σ per-account derived values. */
export const usePortfolioReturn = (): ReturnStat | null => {
  const value = usePortfolioValueCents();
  const contrib = usePortfolioContributionsCents();
  return useMemo(() => {
    if (value == null) return null;
    return {
      gainCents: value - contrib,
      returnPct: contrib > 0 ? (value - contrib) / contrib : null,
    };
  }, [value, contrib]);
};

export type ValuePoint = { time: string; valueCents: number };

/**
 * Daily market-value series for a set of holdings + a constant cash balance.
 * Current positions are valued back through the available price history
 * (assumes today's holdings were held over the window — the right model for
 * a "how is this book performing" curve).
 *
 * Date axis = the union of every leg's dates, starting where all legs have
 * data. A leg missing a date (exchange holiday, lagging fetch) carries its
 * last known close forward instead of dropping the date for the whole
 * portfolio — a strict intersection used to truncate the curve's most recent
 * days whenever one symbol lagged. Returns [] until all holdings have prices.
 */
function buildValueSeries(
  rows: Holding[],
  cashCents: number,
  prices: Record<string, { points?: PricePoint[] }>,
  optionPrices?: Record<string, { points?: PricePoint[] }>,
): ValuePoint[] {
  if (rows.length === 0) return [];
  const legs: { qty: number; times: string[]; values: number[] }[] = [];
  // Holdings with no equity price history (options/futures) get a constant
  // contribution across the curve — we don't fold their series into the legs
  // (the leg sum has no contract multiplier). The constant uses the live
  // option mark when available, else the broker mark.
  let flatCents = 0;
  for (const h of rows) {
    const pts = prices[h.symbol]?.points;
    if (pts && pts.length > 0) {
      legs.push({
        qty: h.qty,
        times: pts.map((p) => p.time),
        values: pts.map((p) => p.value),
      });
    } else {
      const unit = unitPriceCentsFor(h, prices, optionPrices);
      if (unit == null) return []; // still loading a price — wait for coverage
      flatCents += Math.round(h.qty * unit * contractMultiplier(h.symbol));
    }
  }
  // No history at all (e.g. an options-only account) — no date axis to draw on.
  if (legs.length === 0) return [];
  // Start where the shortest history begins so the total never jumps when
  // one symbol's series starts mid-window.
  let start = legs[0]!.times[0]!;
  for (const leg of legs) if (leg.times[0]! > start) start = leg.times[0]!;
  const dates = [...new Set(legs.flatMap((l) => l.times))]
    .filter((d) => d >= start)
    .sort();

  // Walk all legs in lockstep with per-leg cursors (dates are ascending).
  const cursors = legs.map(() => 0);
  return dates.map((date) => {
    let dollars = 0;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!;
      let c = cursors[i]!;
      while (c + 1 < leg.times.length && leg.times[c + 1]! <= date) c++;
      cursors[i] = c;
      dollars += leg.qty * leg.values[c]!;
    }
    return {
      time: date,
      valueCents: Math.round(dollars * 100) + cashCents + flatCents,
    };
  });
}

/**
 * Broker NAV series + a live "today" point. NAV is end-of-day, so during the
 * session the curve would lag behind the headline value — append (or replace)
 * today's point with the live computed value when it's fully priced.
 */
function withLiveToday(nav: ValuePoint[], liveCents: number | null): ValuePoint[] {
  if (liveCents == null) return nav;
  const today = new Date().toISOString().slice(0, 10);
  const last = nav[nav.length - 1]!;
  if (last.time >= today) {
    return [...nav.slice(0, -1), { time: last.time, valueCents: liveCents }];
  }
  return [...nav, { time: today, valueCents: liveCents }];
}

/** Daily value curve for one account: broker-reported NAV when imported
 *  (authoritative — matches IBKR exactly), else reconstructed from price
 *  history. [] while prices are still loading (NAV needs no prices). */
function accountValueCurve(
  account: Account,
  rows: Holding[],
  nav: ValuePoint[] | undefined,
  prices: Record<string, { points?: PricePoint[] }>,
  optionPrices: Record<string, { points?: PricePoint[] }>,
): ValuePoint[] {
  if (nav && nav.length >= 2) {
    return withLiveToday(nav, accountValueCentsOf(account, rows, prices, optionPrices));
  }
  return buildValueSeries(rows, account.cashCents, prices, optionPrices);
}

/** Sum per-account curves with carry-forward alignment, starting where every
 *  curve has data. `flatCents` adds curve-less contributions (cash-only accounts). */
function sumValueCurves(curves: ValuePoint[][], flatCents: number): ValuePoint[] {
  if (curves.length === 0) return [];
  let start = curves[0]![0]!.time;
  for (const c of curves) if (c[0]!.time > start) start = c[0]!.time;
  const dates = [...new Set(curves.flatMap((c) => c.map((p) => p.time)))]
    .filter((d) => d >= start)
    .sort();
  const cursors = curves.map(() => 0);
  return dates.map((date) => {
    let cents = flatCents;
    for (let i = 0; i < curves.length; i++) {
      const c = curves[i]!;
      let k = cursors[i]!;
      while (k + 1 < c.length && c[k + 1]!.time <= date) k++;
      cursors[i] = k;
      cents += c[k]!.valueCents;
    }
    return { time: date, valueCents: cents };
  });
}

/** Portfolio-wide daily value series — the sum of every account's curve
 *  (broker NAV where available, price reconstruction elsewhere). */
export const usePortfolioValueSeries = (): ValuePoint[] => {
  const holdings = useStore((s) => s.holdings);
  const accounts = useStore((s) => s.accounts);
  const prices = useStore((s) => s.prices);
  const optionPrices = useStore((s) => s.optionPrices);
  const navHistory = useStore((s) => s.navHistory);
  return useMemo(() => {
    const curves: ValuePoint[][] = [];
    let flatCents = 0;
    for (const account of accounts) {
      const rows = holdings.filter((h) => h.accountId === account.id);
      if (rows.length === 0 && !(navHistory[account.id]?.length)) {
        flatCents += account.cashCents; // cash-only account, no curve to draw
        continue;
      }
      const curve = accountValueCurve(
        account,
        rows,
        navHistory[account.id],
        prices,
        optionPrices,
      );
      if (curve.length === 0) {
        // No drawable curve: with holdings that means prices are still
        // loading — wait. Without holdings (e.g. a one-point NAV record)
        // the account just contributes its cash flat.
        if (rows.length > 0) return [];
        flatCents += account.cashCents;
        continue;
      }
      curves.push(curve);
    }
    return sumValueCurves(curves, flatCents);
  }, [holdings, accounts, prices, optionPrices, navHistory]);
};

/** Daily value series for a single account (its holdings + its cash). */
export const useAccountValueSeries = (accountId: string): ValuePoint[] => {
  const holdings = useStore((s) => s.holdings);
  const accounts = useStore((s) => s.accounts);
  const prices = useStore((s) => s.prices);
  const optionPrices = useStore((s) => s.optionPrices);
  const nav = useStore((s) => s.navHistory[accountId]);
  return useMemo(() => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return [];
    const rows = holdings.filter((h) => h.accountId === accountId);
    return accountValueCurve(account, rows, nav, prices, optionPrices);
  }, [holdings, accounts, nav, prices, optionPrices, accountId]);
};

// ---------- intraday value reconstruction (short ranges) ----------

export type IntradayValuePoint = { time: number; valueCents: number };

/**
 * Intraday portfolio-value reconstruction. Same model as buildValueSeries but
 * over Yahoo intraday bars: each stock leg is a sorted timestamp series;
 * options + cash are a flat contribution at their current mark (there's no
 * intraday options feed). A stock whose intraday fetch settled empty (outside
 * Yahoo retention, or an error) joins the flat bucket at its latest known
 * price instead of failing the whole reconstruction — one odd symbol used to
 * force the entire chart back to daily points.
 *
 * `ready: false` + `loading: true`  → bars still in flight (caller may hold
 * the previous chart); `loading: false` → no intraday coverage at all (daily
 * is the right chart).
 */
function buildIntradayValueSeries(
  rows: Holding[],
  cashCents: number,
  intraday: Record<string, IntradayEntry | undefined>,
  prices: Record<string, { points?: PricePoint[] }>,
  optionPrices: Record<string, { points?: PricePoint[] }>,
  startKey: string,
): { points: IntradayValuePoint[]; ready: boolean; loading: boolean } {
  const legs: { qty: number; times: number[]; values: number[] }[] = [];
  let flatCents = 0;
  const addFlat = (h: Holding): boolean => {
    const unit = unitPriceCentsFor(h, prices, optionPrices);
    if (unit == null) return false;
    flatCents += Math.round(h.qty * unit * contractMultiplier(h.symbol));
    return true;
  };
  for (const h of rows) {
    if (parseOccSymbol(h.symbol)) {
      addFlat(h);
      continue;
    }
    const entry = intraday[intradayCacheKey(h.symbol, startKey)];
    if (entry?.points && entry.points.length > 0) {
      legs.push({
        qty: h.qty,
        times: entry.points.map((p) => p.time),
        values: entry.points.map((p) => p.value),
      });
    } else if (entry && entry.status !== "loading" && entry.status !== "idle") {
      // Settled without bars (no coverage / error) — hold it flat.
      if (!addFlat(h)) return { points: [], ready: false, loading: true };
    } else {
      return { points: [], ready: false, loading: true }; // still in flight
    }
  }
  if (legs.length === 0) return { points: [], ready: false, loading: false };
  // Yahoo returns its full retained intraday range (often wider than the
  // requested window), so clip to the window start; also start no earlier
  // than the latest-starting leg so the total never jumps mid-curve.
  let startSec = Date.parse(`${startKey}T00:00:00Z`) / 1000;
  for (const leg of legs) if (leg.times[0]! > startSec) startSec = leg.times[0]!;
  // Anchor the time axis on the densest leg; other legs carry their last
  // known price forward — bar timestamps rarely align exactly across symbols.
  let anchor = legs[0]!;
  for (const leg of legs) if (leg.times.length > anchor.times.length) anchor = leg;
  const cursors = legs.map(() => 0);
  const out: IntradayValuePoint[] = [];
  for (const t of anchor.times) {
    if (t < startSec) continue;
    let dollars = 0;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!;
      let c = cursors[i]!;
      while (c + 1 < leg.times.length && leg.times[c + 1]! <= t) c++;
      cursors[i] = c;
      dollars += leg.qty * leg.values[c]!;
    }
    out.push({ time: t, valueCents: Math.round(dollars * 100) + cashCents + flatCents });
  }
  return { points: out, ready: true, loading: false };
}

/**
 * Rebased percent series reconstructed from intraday bars, for short ranges
 * (7D / MTD) on a scope (an accountId, or ALL_ACCOUNTS). `active` is false for
 * long ranges or until intraday data is ready — callers then use the daily
 * series. `pending` is true while an intraday series is expected but its bars
 * are still in flight — callers may hold the current chart instead of
 * flashing the daily fallback. Triggers the per-symbol loads as a side effect.
 */
export function useIntradayPctSeries(
  scope: string | null,
  range: PerfRange,
): { active: boolean; pending: boolean; points: PctPoint[] } {
  const isShort = scope != null && (range === "7D" || range === "MTD");
  const holdings = useStore((s) => s.holdings);
  const accounts = useStore((s) => s.accounts);
  const intraday = useStore((s) => s.intraday);
  const prices = useStore((s) => s.prices);
  const optionPrices = useStore((s) => s.optionPrices);
  const loadIntraday = useStore((s) => s.loadIntraday);
  const lastSyncAt = useStore((s) => s.lastSyncAt);

  const { startKey, endKey } = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (range === "MTD") return { startKey: `${todayKey.slice(0, 7)}-01`, endKey: todayKey };
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { startKey: d.toISOString().slice(0, 10), endKey: todayKey };
  }, [range]);

  const rows = useMemo(() => {
    if (scope == null) return [];
    return scope === ALL_ACCOUNTS ? holdings : holdings.filter((h) => h.accountId === scope);
  }, [scope, holdings]);

  const cashCents = useMemo(() => {
    if (scope == null) return 0;
    if (scope === ALL_ACCOUNTS) return accounts.reduce((a, acc) => a + acc.cashCents, 0);
    return accounts.find((a) => a.id === scope)?.cashCents ?? 0;
  }, [scope, accounts]);

  const stockSymbols = useMemo(
    () => [
      ...new Set(rows.filter((h) => parseOccSymbol(h.symbol) == null).map((h) => h.symbol)),
    ],
    [rows],
  );

  // lastSyncAt in the deps re-runs the loads after a sync; per-entry
  // staleness inside loadIntraday keeps that from spamming Yahoo.
  useEffect(() => {
    if (!isShort) return;
    for (const sym of stockSymbols) loadIntraday(sym, startKey, endKey);
  }, [isShort, stockSymbols, startKey, endKey, loadIntraday, lastSyncAt]);

  return useMemo(() => {
    if (!isShort) return { active: false, pending: false, points: [] };
    const built = buildIntradayValueSeries(
      rows,
      cashCents,
      intraday,
      prices,
      optionPrices,
      startKey,
    );
    if (!built.ready || built.points.length < 2) {
      return { active: false, pending: built.loading, points: [] };
    }
    const base = built.points[0]!.valueCents;
    if (base === 0) return { active: false, pending: false, points: [] };
    const points: PctPoint[] = built.points.map((p) => ({
      time: p.time,
      value: ((p.valueCents - base) / base) * 100,
      valueCents: p.valueCents,
    }));
    return { active: true, pending: false, points };
  }, [isShort, rows, cashCents, intraday, prices, optionPrices, startKey]);
}

// ---------- actions (re-exported for ergonomic access) ----------

export const useLoadPrice = () => useStore((s) => s.loadPrice);
export const useLoadIntraday = () => useStore((s) => s.loadIntraday);
export const useRefreshAll = () => useStore((s) => s.refreshAll);
export const useSyncing = () => useStore((s) => s.syncing);
export const useLastSyncAt = () => useStore((s) => s.lastSyncAt);

// endKey kept on the signature for callers; the cache key only depends on
// the resolved request, which startKey determines (see intradayCacheKey).
export const useIntradayEntry = (
  symbol: string,
  startKey: string,
  _endKey?: string,
) => useStore((s) => s.intraday[intradayCacheKey(symbol, startKey)]);

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
export const useClearDemoForAccount = () => useStore((s) => s.clearDemoForAccount);
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

// ---------- IBKR (multi-connection) ----------

export const useIbkrConnections = () => useStore((s) => s.ibkrConnections);
export const useIbkrConnection = (id: string | null | undefined) =>
  useStore((s) =>
    id ? s.ibkrConnections.find((c) => c.id === id) ?? null : null,
  );
export const useAddIbkrConnection = () => useStore((s) => s.addIbkrConnection);
export const useUpdateIbkrConnection = () => useStore((s) => s.updateIbkrConnection);
export const useRemoveIbkrConnection = () => useStore((s) => s.removeIbkrConnection);
export const useSyncIbkrConnection = () => useStore((s) => s.syncIbkrConnection);
export const useResyncIbkrConnection = () => useStore((s) => s.resyncIbkrConnection);
export const useImportIbkrXml = () => useStore((s) => s.importIbkrXml);

// ---------- toasts ----------

export const useToasts = () => useStore((s) => s.toasts);
export const usePushToast = () => useStore((s) => s.pushToast);
export const useDismissToast = () => useStore((s) => s.dismissToast);

export const useTrade = (id: string | null): Trade | null =>
  useStore((s) => (id ? s.trades.find((t) => t.id === id) ?? null : null));

// ---------- journal: derived ----------

/** Filter trades to an account scope. ALL (or omitted) = every account. */
function scopeTrades(trades: Trade[], scope: string): Trade[] {
  return scope === ALL_ACCOUNTS
    ? trades
    : trades.filter((t) => t.accountId === scope);
}

/** Trades whose closing (or only) execution date falls in the active range,
 *  optionally scoped to a single account. */
export const useFilteredTrades = (scope: string = ALL_ACCOUNTS): Trade[] => {
  const trades = useStore((s) => s.trades);
  const journalRange = useStore((s) => s.journalRange);
  return useMemo(() => {
    const range = rangeFor(journalRange);
    return scopeTrades(trades, scope).filter((t) => {
      const key = tradeDateKey(t);
      return key === "" ? false : inRange(key, range);
    });
  }, [trades, journalRange, scope]);
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

export const useTradeStats = (scope: string = ALL_ACCOUNTS): JournalStats => {
  const trades = useFilteredTrades(scope);
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

/** All trades whose closing date matches the given ISO date (YYYY-MM-DD),
 *  optionally scoped to a single account. */
export const useDayTrades = (
  dateKey: string,
  scope: string = ALL_ACCOUNTS,
): Trade[] => {
  const trades = useStore((s) => s.trades);
  return useMemo(
    () =>
      scopeTrades(trades, scope).filter((t) => tradeDateKey(t) === dateKey),
    [trades, dateKey, scope],
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

export type MonthExtreme = {
  symbol: string;
  returnCents: number;
  returnPct: number | null;
} | null;

export type MonthStats = {
  pnlCents: number;
  returnPct: number;
  wins: number;
  losses: number;
  open: number;
  trades: number;
  /** Closed trade with the highest / lowest realized P/L this month. */
  best: MonthExtreme;
  worst: MonthExtreme;
};

/**
 * Aggregate stats for a given month (YYYY-MM). Trades are bucketed by
 * their close-date (or only execution date if still open). Return % is
 * capital-weighted: sum of realized P/L divided by sum of entry capital.
 */
export const useMonthStats = (
  monthIso: string,
  scope: string = ALL_ACCOUNTS,
): MonthStats => {
  const trades = useStore((s) => s.trades);
  return useMemo(() => {
    const yyyymm = monthIso.slice(0, 7);
    let pnlCents = 0;
    let capitalCents = 0;
    let wins = 0;
    let losses = 0;
    let open = 0;
    let count = 0;
    let best: MonthExtreme = null;
    let worst: MonthExtreme = null;
    for (const t of scopeTrades(trades, scope)) {
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
      const extreme = { symbol: t.symbol, returnCents: tot.returnCents, returnPct: tot.returnPct };
      if (best == null || tot.returnCents > best.returnCents) best = extreme;
      if (worst == null || tot.returnCents < worst.returnCents) worst = extreme;
    }
    return {
      pnlCents,
      returnPct: capitalCents > 0 ? pnlCents / capitalCents : 0,
      wins,
      losses,
      open,
      trades: count,
      best,
      worst,
    };
  }, [trades, monthIso, scope]);
};

/** Per-day P/L summary keyed by ISO date — for the calendar grid,
 *  optionally scoped to a single account. */
export const useTradesByDay = (
  scope: string = ALL_ACCOUNTS,
): Map<string, DaySummary> => {
  const trades = useStore((s) => s.trades);
  return useMemo(() => {
    const out = new Map<string, DaySummary>();
    for (const t of scopeTrades(trades, scope)) {
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
  }, [trades, scope]);
};
