/**
 * Trade model. Money in integer cents (never floats). Dates in ISO 8601 UTC.
 *
 * A Trade is a *position* — one or more BUY/SELL executions on the same
 * symbol, in the same direction, that conceptually belong together. The
 * journal is a list of these. Status is derived from executions
 * (`deriveTotals`) — we don't persist OPEN/WIN/LOSS; we recompute.
 *
 * A TradeSetup is a *plan* — pre-trade thesis with target/stop/notes,
 * shown in a separate row above the trade list.
 */

export type Market = "STOCK" | "OPTION" | "CRYPTO" | "FOREX" | "FUTURE";
export type Side = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "WIN" | "LOSS";
export type ExecutionAction = "BUY" | "SELL";
export type SetupStatus = "PLANNED" | "ACTIVE" | "CANCELLED";

export type TradeExecution = {
  id: string;
  action: ExecutionAction;
  /** ISO 8601 UTC */
  at: string;
  qty: number;
  priceCents: number;
  feeCents: number;
};

export type Trade = {
  id: string;
  /** Stable Account.id this trade belongs to. */
  accountId: string;
  symbol: string;
  market: Market;
  side: Side;
  targetCents?: number;
  stopCents?: number;
  executions: TradeExecution[];
  notes?: string;
  tags: string[];
  /** 1-5; absent = not rated. */
  confidence?: 1 | 2 | 3 | 4 | 5;
  /** Provenance. Used to distinguish seeded demo data from real entries. */
  source?: "demo" | "manual" | "ibkr";
  /** ISO 4217 currency of the executions' prices. Absent = USD. */
  currency?: string;
};

export type TradeSetup = {
  id: string;
  accountId: string;
  symbol: string;
  market: Market;
  side: Side;
  entryCents: number;
  targetCents: number;
  stopCents: number;
  notes?: string;
  /** ISO 8601 UTC */
  createdAt: string;
  status: SetupStatus;
};
