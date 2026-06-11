/**
 * Yahoo Finance fetchers. Hits the unofficial v8 chart endpoint via the
 * Vite dev proxy (/api/yahoo/*). Two flavors:
 *   - fetchYahooDaily — daily closes for swing-trade context charts
 *   - fetchYahooIntraday — minute/5-minute bars for sub-24h trade charts
 *
 * When Tauri lands these move to Rust commands and the proxy goes away.
 */

import type { PricePoint } from "./priceHistory";

/** Intraday close point with sub-day timestamp (Unix seconds, UTC). */
export type IntradayPoint = { time: number; value: number };

const SYMBOL_OVERRIDES: Record<string, string> = {
  // Share-class symbols use a dash on Yahoo, not a dot.
  "BRK.B": "BRK-B",
  "BRK.A": "BRK-A",
};

export function toYahooSymbol(s: string): string {
  return SYMBOL_OVERRIDES[s] ?? s;
}

type YahooResponse = {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{ close: Array<number | null> }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
};

export async function fetchYahooDaily(
  symbol: string,
  range: "1y" | "2y" | "5y" | "max" = "2y",
): Promise<PricePoint[]> {
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(
    toYahooSymbol(symbol),
  )}?range=${range}&interval=1d`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Yahoo ${res.status} for ${symbol}`);
  }

  const json = (await res.json()) as YahooResponse;
  if (json.chart.error) {
    throw new Error(json.chart.error.description ?? "Yahoo error");
  }

  const result = json.chart.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const times = result.timestamp;
  const closes = result.indicators.quote[0]?.close ?? [];
  const out: PricePoint[] = [];

  for (let i = 0; i < times.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const d = new Date(times[i]! * 1000);
    out.push({ time: d.toISOString().slice(0, 10), value: c });
  }

  return out;
}

/**
 * Yahoo retention for intraday is tight: 1m candles ~7 days, 5m ~60 days.
 * We pick the finest interval that still covers the oldest requested date
 * AND request the widest range that interval allows — gives the chart
 * material to show on zoom-out before the entry.
 */
export type IntradayInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m";

type IntradayParams = { interval: IntradayInterval; range: string };

function pickIntradayParams(daysAgo: number): IntradayParams | null {
  if (daysAgo < 0) return null;
  // 1m bars cap out near 7 days of retention. Request 5d (Yahoo's
  // closest token) — gives ~4 trading days of pre-entry context for
  // same-day trades.
  if (daysAgo <= 5) return { interval: "1m", range: "5d" };
  // 5m bars within Yahoo's retention. NOTE: `5m` + `range=3mo` is rejected by
  // Yahoo ("must be within the last 60 days"), and there's no range token
  // between 1mo and 3mo, so `1mo` (~30 trading days) is the widest valid 5m
  // window. Beyond that we fall back to daily (caller handles null).
  if (daysAgo <= 30) return { interval: "5m", range: "1mo" };
  return null;
}

/** Resolve the Yahoo request a window starting at `startKey` maps to. */
export function intradayParamsFor(startKey: string): IntradayParams | null {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const startMs = new Date(`${startKey}T00:00:00Z`).getTime();
  const oldestDaysAgo = Math.max(0, Math.round((Date.now() - startMs) / DAY_MS));
  return pickIntradayParams(oldestDaysAgo);
}

/**
 * Cache key for an intraday window — keyed by the *resolved request*
 * (interval + range token), not the requested dates. Different windows that
 * map to the same Yahoo call (e.g. 7D and MTD mid-month) share one entry,
 * so toggling between them never refetches or flashes a fallback chart.
 */
export function intradayCacheKey(symbol: string, startKey: string): string {
  const p = intradayParamsFor(startKey);
  return p ? `${symbol}|${p.interval}|${p.range}` : `${symbol}|daily`;
}

/**
 * Returns intraday close points for [startKey, endKey] (inclusive,
 * YYYY-MM-DD strings, defaults to single-day when endKey is omitted).
 *
 * Picks the finest interval Yahoo retention allows — 1m bars within the
 * last 7 days, 5m bars within 60 days. Returns null when neither
 * interval can cover the requested window; caller should fall back to
 * daily.
 */
export async function fetchYahooIntraday(
  symbol: string,
  startKey: string,
  endKey: string = startKey,
): Promise<IntradayPoint[] | null> {
  const params = intradayParamsFor(startKey);
  if (!params) return null;
  const { interval, range } = params;

  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(
    toYahooSymbol(symbol),
  )}?range=${range}&interval=${interval}&includePrePost=false`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Yahoo ${res.status} for ${symbol} intraday`);
  }

  const json = (await res.json()) as YahooResponse;
  if (json.chart.error) {
    throw new Error(json.chart.error.description ?? "Yahoo intraday error");
  }

  const result = json.chart.result?.[0];
  if (!result) throw new Error(`No intraday data for ${symbol}`);

  const times = result.timestamp;
  const closes = result.indicators.quote[0]?.close ?? [];

  // Return the full Yahoo response — the chart sets its visible range
  // to the trade window but keeps the rest available for zoom-out.
  // (endKey is no longer used; kept on the signature so callers don't
  // have to change. The interval picker uses startKey's age to choose
  // the finest resolution that covers the oldest date in the window.)
  void endKey;
  const out: IntradayPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const t = times[i]!;
    out.push({ time: t, value: c });
  }

  return out;
}
