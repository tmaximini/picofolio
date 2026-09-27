/**
 * Deterministic sample data for the landing page's live illustrations.
 * Seeded so the page renders identically on every visit (and in the og
 * screenshot) — the numbers are illustrative, not the user's.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A year-ish of daily returns: rally, drawdown, recovery — then a strong close. */
export function equityCurve(points = 180, seed = 7): number[] {
  const rand = mulberry32(seed);
  const out: number[] = [];
  let v = 0;
  for (let i = 0; i < points; i++) {
    const t = i / points;
    const drift =
      t < 0.35 ? 0.24 : t < 0.55 ? -0.3 : t < 0.8 ? 0.02 : 0.32;
    v += drift + (rand() - 0.5) * 2.1;
    out.push(v);
  }
  return out;
}

/** Twelve weeks of realized P&L, integer cents. */
export const WEEKLY_PNL: number[] = [
  84120, -31250, 126340, 45210, -58730, 97400, 152880, -12600, 68950, 110230,
  -40310, 181430,
];

export type Allocation = { label: string; weight: number };

export const ALLOC_BY_SYMBOL: Allocation[] = [
  { label: "VWCE", weight: 0.34 },
  { label: "MSFT", weight: 0.14 },
  { label: "ASML", weight: 0.12 },
  { label: "0700.HK", weight: 0.09 },
  { label: "BRK.B", weight: 0.08 },
  { label: "Other", weight: 0.23 },
];

export const ALLOC_BY_SECTOR: Allocation[] = [
  { label: "Global equity", weight: 0.34 },
  { label: "Technology", weight: 0.29 },
  { label: "Financials", weight: 0.13 },
  { label: "Comm. services", weight: 0.1 },
  { label: "Healthcare", weight: 0.07 },
  { label: "Cash", weight: 0.07 },
];

/** A trading month: 22 sessions of realized P&L (cents); 0 = flat day. */
export function calendarMonth(seed = 11): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: 22 }, () => {
    const r = rand();
    if (r < 0.12) return 0;
    const mag = Math.round((rand() ** 1.6) * 240000);
    return r < 0.62 ? mag : -Math.round(mag * 0.7);
  });
}

export type DemoHolding = {
  symbol: string;
  name: string;
  qty: number;
  /** Price in cents (native currency). */
  price: number;
  currency: string;
  dayPct: number;
};

export const HOLDINGS: DemoHolding[] = [
  { symbol: "NVDA", name: "NVIDIA", qty: 120, price: 18342, currency: "USD", dayPct: 0.0212 },
  { symbol: "ASML", name: "ASML Holding", qty: 18, price: 71460, currency: "EUR", dayPct: -0.0064 },
  { symbol: "0700.HK", name: "Tencent", qty: 300, price: 43660, currency: "HKD", dayPct: 0.0138 },
  { symbol: "MSFT", name: "Microsoft", qty: 40, price: 50112, currency: "USD", dayPct: 0.0041 },
];
