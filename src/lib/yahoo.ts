/**
 * Yahoo Finance daily-close fetcher. Hits the unofficial v8 chart
 * endpoint via the Vite dev proxy (/api/yahoo/*). Returns a normalized
 * PricePoint[]. When Tauri lands, this same function moves to a Rust
 * command and the proxy goes away.
 */

import type { PricePoint } from "./priceHistory";

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
