/**
 * Seed data for the store. In production these come from IBKR Flex
 * Query (positions + trades + NAV); for now we hand-author a realistic
 * shape so the UI has something to render before any sync.
 *
 * Note: pre-derived fields (value, day %, week %) were removed —
 * those now compute from holdings + prices via store selectors.
 */

export type Account = {
  id: string;
  name: string;
  kind: "trading" | "long-term";
  /** Static seed for now; derived from holdings + cash once prices land. */
  cashCents: number;
  /** Provenance — lets us distinguish seeded demo data from real entries. */
  source?: "demo" | "manual" | "ibkr";
};

export type Holding = {
  symbol: string;
  name: string;
  /** Account NAME (matches Account.name). Real model will use account id. */
  account: string;
  qty: number;
  avgCostCents: number;
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
import { tradingCashCents, tradingHoldingsSeed } from "./mockTrades";

export const accountsSeed: Account[] = [
  { id: "U-trade",     name: "Trading",   kind: "trading",   cashCents: tradingCashCents, source: "demo" },
  { id: "U-long-term", name: "Long-Term", kind: "long-term", cashCents:    2_840_00,      source: "demo" },
];

export const holdingsSeed: Holding[] = [
  ...tradingHoldingsSeed,
  { symbol: "AAPL",  name: "Apple Inc",           account: "Long-Term", qty: 320, avgCostCents: 168_22, source: "demo" },
  { symbol: "MSFT",  name: "Microsoft Corp",      account: "Long-Term", qty: 180, avgCostCents: 322_18, source: "demo" },
  { symbol: "TSM",   name: "Taiwan Semi",         account: "Long-Term", qty: 240, avgCostCents: 142_88, source: "demo" },
  { symbol: "ASML",  name: "ASML Holding",        account: "Long-Term", qty:  32, avgCostCents: 612_44, source: "demo" },
  { symbol: "BRK.B", name: "Berkshire Hathaway",  account: "Long-Term", qty: 110, avgCostCents: 388_10, source: "demo" },
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
