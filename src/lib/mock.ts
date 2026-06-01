/**
 * Seed data for the store. In production these come from IBKR Flex
 * Query (positions + trades + NAV); for now we hand-author a realistic
 * shape so the UI has something to render before any sync.
 *
 * Note: pre-derived fields (value, day %, week %) were removed —
 * those now compute from holdings + prices via store selectors.
 *
 * Accounts are first-class abstractions: user-created, renameable,
 * colorable, with an optional 1:1 IBKR connection. There are no fixed
 * "trading"/"long-term" kinds — every account can hold and trade.
 * Account VALUE is always derived (positions × price + cash); the
 * headline performance number is a rate-of-return vs. net contributions.
 */

export type Account = {
  id: string;
  name: string;
  /** Identity accent shown as the switcher/stat dot. Not gain/loss language. */
  color: string;
  /** Static seed for now; derived from holdings + cash once prices land. */
  cashCents: number;
  /** Net deposits − withdrawals. Manual for now; basis for rate-of-return. */
  netContributionsCents: number;
  /** Optional 1:1 link to an IbkrConnection (manual-only accounts omit it). */
  flexConnectionId?: string;
  /** ISO 8601 UTC. */
  createdAt: string;
  updatedAt: string;
  /** Provenance — lets us distinguish seeded demo data from real entries. */
  source?: "demo" | "manual" | "ibkr";
};

export type Holding = {
  symbol: string;
  name: string;
  /** Stable Account.id this position belongs to. */
  accountId: string;
  qty: number;
  avgCostCents: number;
  /** Broker's last mark price per unit, in cents. Fallback for instruments
   *  with no live Yahoo source (options, futures). Optional. */
  lastPriceCents?: number;
  source?: "demo" | "manual" | "ibkr";
};

export type WeekBar = {
  weekOf: string;
  pnlCents: number;
  trades: number;
  winRate: number;
};

// Trading positions + cash are *derived* from mockTrades so the journal,
// holdings, and cash all tie out to the same set of executions.
import { STARTING_CASH_CENTS, tradingCashCents, tradingHoldingsSeed } from "./mockTrades";

/** Seeded account identity colors. Deliberately NOT gain-green / loss-red —
 *  those belong to the P&L language. Amber = the active trading sleeve,
 *  violet = the steady long-term sleeve. */
export const ACCOUNT_TRADING_COLOR = "#D9A86C";
export const ACCOUNT_LONG_TERM_COLOR = "#7D77C3";

/** Palette offered in the account create/edit form. */
export const ACCOUNT_COLORS = [
  "#D9A86C", // amber
  "#7D77C3", // violet
  "#6BCB97", // sage
  "#5FA8D3", // sky
  "#E5746B", // terracotta
  "#C9A227", // gold
  "#9C8FB0", // mauve
  "#5FB8A8", // teal
] as const;

const SEED_TS = "2026-01-01T00:00:00Z";

// Long-Term sized to ~65% of the portfolio against a Trading account
// that carries real weight (~35%). A believable barbell — the trading
// book is small enough to be the active sleeve, big enough that the
// Weekly P&L and Trading stat card aren't visualizing a rounding error.
const LONG_TERM_CASH_CENTS = 4_000_00;

export const holdingsSeed: Holding[] = [
  ...tradingHoldingsSeed,
  { symbol: "AAPL",  name: "Apple Inc",           accountId: "U-long-term", qty: 370, avgCostCents: 168_22, source: "demo" },
  { symbol: "MSFT",  name: "Microsoft Corp",      accountId: "U-long-term", qty: 210, avgCostCents: 322_18, source: "demo" },
  { symbol: "TSM",   name: "Taiwan Semi",         accountId: "U-long-term", qty: 220, avgCostCents: 142_88, source: "demo" },
  { symbol: "ASML",  name: "ASML Holding",        accountId: "U-long-term", qty:  36, avgCostCents: 612_44, source: "demo" },
  { symbol: "BRK.B", name: "Berkshire Hathaway",  accountId: "U-long-term", qty: 150, avgCostCents: 388_10, source: "demo" },
];

// Net contributions = what was put in. Trading ≈ starting cash; long-term ≈
// cost basis of its positions + remaining cash. Derived value drifts above
// these (positive expectancy / unrealized gains) so the demo shows a
// believable positive rate-of-return that reconciles with the holdings.
const longTermBasisCents = holdingsSeed
  .filter((h) => h.accountId === "U-long-term")
  .reduce((a, h) => a + h.qty * h.avgCostCents, 0);

export const accountsSeed: Account[] = [
  {
    id: "U-trade",
    name: "Trading",
    color: ACCOUNT_TRADING_COLOR,
    cashCents: tradingCashCents,
    netContributionsCents: STARTING_CASH_CENTS,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    source: "demo",
  },
  {
    id: "U-long-term",
    name: "Long-Term",
    color: ACCOUNT_LONG_TERM_COLOR,
    cashCents: LONG_TERM_CASH_CENTS,
    netContributionsCents: longTermBasisCents + LONG_TERM_CASH_CENTS,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
    source: "demo",
  },
];

export const weeklyPnlSeed: WeekBar[] = [
  { weekOf: "2026-02-09", pnlCents:    412_00, trades:  8, winRate: 0.50 },
  { weekOf: "2026-02-16", pnlCents:   -188_22, trades:  5, winRate: 0.40 },
  { weekOf: "2026-02-23", pnlCents:    821_11, trades: 12, winRate: 0.58 },
  { weekOf: "2026-03-02", pnlCents:  1_204_00, trades: 14, winRate: 0.64 },
  { weekOf: "2026-03-09", pnlCents:   -322_50, trades:  9, winRate: 0.33 },
  { weekOf: "2026-03-16", pnlCents:    612_77, trades: 11, winRate: 0.55 },
  { weekOf: "2026-03-23", pnlCents:  1_088_42, trades: 10, winRate: 0.60 },
  { weekOf: "2026-03-30", pnlCents:    920_18, trades: 13, winRate: 0.62 },
  { weekOf: "2026-04-06", pnlCents:   -440_00, trades:  7, winRate: 0.29 },
  { weekOf: "2026-04-13", pnlCents:  1_804_22, trades: 15, winRate: 0.67 },
  { weekOf: "2026-04-20", pnlCents:  2_188_00, trades: 18, winRate: 0.72 },
  { weekOf: "2026-04-27", pnlCents:   -612_44, trades:  8, winRate: 0.25 },
  { weekOf: "2026-05-04", pnlCents:  1_412_00, trades: 12, winRate: 0.58 },
  { weekOf: "2026-05-11", pnlCents:  3_215_88, trades: 20, winRate: 0.75 },
];
