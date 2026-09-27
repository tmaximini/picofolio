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

export type DemoAccountId = "all" | "trading" | "long";

export const DEMO_ACCOUNTS: { id: DemoAccountId; label: string; color: string | null }[] = [
  { id: "all", label: "All accounts", color: null },
  { id: "trading", label: "Trading", color: "#D9A86C" },
  { id: "long", label: "Long-term", color: "#7D77C3" },
];

/** Cash per account, EUR cents. */
export const DEMO_CASH: Record<Exclude<DemoAccountId, "all">, number> = {
  trading: 1284012,
  long: 432950,
};

/** Curve seed per account — each book gets its own shape. */
export const DEMO_CURVE_SEED: Record<DemoAccountId, number> = { all: 7, trading: 21, long: 4 };

/** Fixed EUR rates for the illustration (no network on the landing page). */
export const DEMO_FX_TO_EUR: Record<string, number> = { EUR: 1, USD: 0.92, HKD: 0.118 };

export type DemoHolding = {
  symbol: string;
  name: string;
  account: Exclude<DemoAccountId, "all">;
  qty: number;
  /** Price in cents (native currency). */
  price: number;
  currency: string;
  dayPct: number;
  /** Unrealized, fraction of cost. */
  unrealPct: number;
};

export const HOLDINGS: DemoHolding[] = [
  { symbol: "VWCE", name: "Vanguard FTSE All-World", account: "long", qty: 420, price: 13842, currency: "EUR", dayPct: 0.0031, unrealPct: 0.214 },
  { symbol: "NVDA", name: "NVIDIA", account: "trading", qty: 120, price: 18342, currency: "USD", dayPct: 0.0212, unrealPct: 0.384 },
  { symbol: "ASML", name: "ASML Holding", account: "long", qty: 18, price: 71460, currency: "EUR", dayPct: -0.0064, unrealPct: -0.052 },
  { symbol: "0700.HK", name: "Tencent", account: "long", qty: 300, price: 43660, currency: "HKD", dayPct: 0.0138, unrealPct: 0.117 },
  { symbol: "MSFT", name: "Microsoft", account: "long", qty: 40, price: 50112, currency: "USD", dayPct: 0.0041, unrealPct: 0.262 },
  { symbol: "AMD", name: "Advanced Micro Devices", account: "trading", qty: 150, price: 16288, currency: "USD", dayPct: -0.0187, unrealPct: -0.071 },
  { symbol: "PLTR", name: "Palantir", account: "trading", qty: 200, price: 17904, currency: "USD", dayPct: 0.0325, unrealPct: 0.529 },
];

export type DemoTrade = {
  date: string;
  symbol: string;
  side: "Long" | "Short";
  setup: string;
  r: number;
  /** Realized, EUR cents. */
  pnl: number;
};

export const RECENT_TRADES: DemoTrade[] = [
  { date: "Sep 25", symbol: "PLTR", side: "Long", setup: "breakout", r: 2.4, pnl: 81240 },
  { date: "Sep 24", symbol: "TSLA", side: "Short", setup: "failed-bounce", r: -1.0, pnl: -32110 },
  { date: "Sep 22", symbol: "AMD", side: "Long", setup: "pullback", r: 1.3, pnl: 44780 },
  { date: "Sep 18", symbol: "META", side: "Long", setup: "earnings-gap", r: 3.1, pnl: 126300 },
  { date: "Sep 16", symbol: "COIN", side: "Long", setup: "breakout", r: -0.6, pnl: -18950 },
];

/** 2026 monthly returns for the performance view (Jan…Sep). */
export const MONTHLY_2026: number[] = [
  0.032, 0.008, -0.041, 0.063, 0.074, -0.012, -0.028, 0.046, 0.021,
];
