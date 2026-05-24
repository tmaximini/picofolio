/**
 * Mock OHLC generator. Seeded random walk anchored to the
 * symbol's current price so the series ends at exactly the
 * holding's priceCents. Same symbol = same walk across reloads.
 *
 * Real data will come from IBKR `iserver/marketdata/history` and
 * be cached in SQLite. The shape used by Lightweight Charts is
 * { time: "YYYY-MM-DD", value: number }.
 */

export type PricePoint = { time: string; value: number };
export type Range = "1W" | "1M" | "3M" | "1Y" | "All";

const RANGE_DAYS: Record<Range, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  All: 730,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Walk forward from a starting price using log returns, then
 * normalize so the series ends exactly at endPriceCents.
 * That keeps the chart and the table in sync.
 */
export function generateHistory(
  symbol: string,
  endPriceCents: number,
  days: number,
): PricePoint[] {
  const rand = mulberry32(hash(symbol));
  const dailyVol = 0.018; // ~1.8% daily move
  const drift = 0.0004;

  const closes: number[] = [];
  let p = 1; // start arbitrary, will rescale
  for (let i = 0; i < days; i++) {
    const z = boxMuller(rand);
    p *= Math.exp(drift + dailyVol * z);
    closes.push(p);
  }

  const scale = endPriceCents / 100 / closes[closes.length - 1]!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return closes.map((c, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return { time: isoDay(d), value: c * scale };
  });
}

function boxMuller(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function rangeDays(range: Range): number {
  return RANGE_DAYS[range];
}

export function sliceRange(history: PricePoint[], range: Range): PricePoint[] {
  const n = rangeDays(range);
  return history.slice(-n);
}
