/**
 * Watchlist: symbols you follow but don't hold. Items store only identity +
 * when they were added; every figure derives from the shared daily price
 * cache, so a watched symbol costs one Yahoo series and nothing else.
 */

import type { PricePoint } from "./priceHistory";

export type WatchItem = {
  /** Yahoo-ready symbol ("NVDA", "0700.HK"). */
  symbol: string;
  /** Display name from search, when known. */
  name?: string;
  /** Day it was added (YYYY-MM-DD) — the base for "since added". */
  addedAt: string;
  source?: "demo" | "manual";
};

export type WatchMetrics = {
  /** Latest close, major units. */
  last: number;
  dayPct: number | null;
  monthPct: number | null;
  sinceAddedPct: number | null;
  low52: number;
  high52: number;
  /** 0 = at the 52-week low, 1 = at the high. */
  rangePos: number;
  /** ~3 months of closes for the sparkline. */
  spark: number[];
};

const DAY_MS = 86_400_000;

function isoDaysBefore(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

/** Last close on or before `key`, or null if the series starts after it. */
function closeOnOrBefore(points: PricePoint[], key: string): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.time > key) break;
    v = p.value;
  }
  return v;
}

/** Figures for one watched symbol; null until its series has ≥ 2 closes. */
export function watchMetrics(points: PricePoint[], addedAt: string): WatchMetrics | null {
  if (points.length < 2) return null;
  const lastPt = points[points.length - 1]!;
  const last = lastPt.value;
  const prev = points[points.length - 2]!.value;
  const pct = (base: number | null) => (base && base > 0 ? last / base - 1 : null);

  const monthBase = closeOnOrBefore(points, isoDaysBefore(lastPt.time, 30));
  // Added before the series starts → the first close is the best base we have;
  // added today → the prior close (so a fresh add doesn't read a flat 0%).
  const addedBase =
    addedAt >= lastPt.time ? prev : closeOnOrBefore(points, addedAt) ?? points[0]!.value;

  const yearAgo = isoDaysBefore(lastPt.time, 365);
  const year = points.filter((p) => p.time >= yearAgo).map((p) => p.value);
  const low52 = Math.min(...year);
  const high52 = Math.max(...year);

  const sparkFrom = isoDaysBefore(lastPt.time, 91);
  return {
    last,
    dayPct: pct(prev),
    monthPct: pct(monthBase),
    sinceAddedPct: pct(addedBase),
    low52,
    high52,
    rangePos: high52 > low52 ? (last - low52) / (high52 - low52) : 0.5,
    spark: points.filter((p) => p.time >= sparkFrom).map((p) => p.value),
  };
}
