/**
 * Deterministic demo journal that produces the Trading account.
 *
 * Single seeded run generates three things at once:
 *
 *  1. `tradesSeed` — ~30 closed round-trip trades over 14 weeks PLUS
 *     one opening BUY per current holding. Drives the Trading Journal,
 *     Calendar, and Stats views.
 *  2. `tradingHoldingsSeed` — the open positions (NVDA / TSLA / AMD /
 *     PLTR), derived directly from the opening BUYs above so the
 *     Account page math matches the journal math.
 *  3. `tradingCashCents` — starting cash minus net execution flows.
 *     Everything ties out: holdings + cash = total account value.
 *
 * Why this matters: real IBKR data has a `<Trades>` section and an
 * `<OpenPositions>` section. They naturally agree because the trades
 * produced the positions. The demo mirrors that — clearing demos with
 * one button removes all three coherent pieces; restoring them brings
 * them back together.
 */

import type {
  ExecutionAction,
  Side,
  Trade,
  TradeExecution,
  TradeSetup,
} from "./trades";

/** Current open positions in the Trading account. Drives both the trade
 *  generator (one opening BUY each) and the holdings export. */
type OpenPositionSpec = {
  sym: string;
  name: string;
  qty: number;
  /** Approximate entry price in cents; jittered per trade. */
  basePrice: number;
};

const OPEN_POSITIONS: OpenPositionSpec[] = [
  { sym: "NVDA", name: "NVIDIA Corp",            qty: 180, basePrice: 138_50 },
  { sym: "TSLA", name: "Tesla Inc",              qty:  75, basePrice: 295_00 },
  { sym: "AMD",  name: "Advanced Micro Devices", qty: 130, basePrice: 175_00 },
  { sym: "PLTR", name: "Palantir Technologies",  qty: 500, basePrice:  42_50 },
];

/** Pool for closed-trade generation. Includes the held names (biased
 *  selection so the journal feels like the trader's active book) plus
 *  a handful of other tickers for variety. */
const ACTIVE_POOL = [
  { sym: "NVDA", basePrice: 138_50, vol: 0.025 },
  { sym: "TSLA", basePrice: 295_00, vol: 0.035 },
  { sym: "AMD",  basePrice: 175_00, vol: 0.028 },
  { sym: "PLTR", basePrice:  42_50, vol: 0.040 },
  { sym: "META", basePrice: 560_00, vol: 0.022 },
  { sym: "SNOW", basePrice: 165_00, vol: 0.038 },
  { sym: "BROS", basePrice:  47_50, vol: 0.030 },
];

/** Index into ACTIVE_POOL biased ~60% toward the held names. */
function pickActiveIdx(rng: () => number): number {
  if (rng() < 0.6) {
    // Held names occupy indices 0..3 in ACTIVE_POOL.
    return Math.floor(rng() * 4);
  }
  return Math.floor(rng() * ACTIVE_POOL.length);
}

export const STARTING_CASH_CENTS = 130_000_00;

/** Account.id the demo trading data belongs to. */
const TRADING_ACCOUNT_ID = "U-trade";

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomWeekday(rng: () => number, start: Date, end: Date): Date {
  for (let attempt = 0; attempt < 20; attempt++) {
    const t = start.getTime() + rng() * (end.getTime() - start.getTime());
    const d = new Date(t);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const hour = 14 + Math.floor(rng() * 6);
    const min = Math.floor(rng() * 60);
    d.setUTCHours(hour, min, Math.floor(rng() * 60), 0);
    return d;
  }
  return start;
}

function uid(rng: () => number, prefix: string): string {
  return `${prefix}-${Math.floor(rng() * 0xffffff).toString(16).padStart(6, "0")}`;
}

function feeFor(rng: () => number): number {
  return Math.max(0, Math.round(rng() * 200));
}

function generateClosedTrade(
  rng: () => number,
  windowStart: Date,
  windowEnd: Date,
  now: Date,
  forceLoss?: boolean,
): Trade {
  const symbol = ACTIVE_POOL[pickActiveIdx(rng)]!;
  const side: Side = rng() < 0.18 ? "SHORT" : "LONG";
  const openedAt = randomWeekday(rng, windowStart, windowEnd);

  const drift = (rng() - 0.5) * 0.08;
  const entryCents = Math.max(50, Math.round(symbol.basePrice * (1 + drift)));

  // Size each trade in DOLLARS, then derive share qty — so a single trade's
  // notional always fits inside the trading account. A ~$130k book takes
  // $1.5k–$26k positions (log-skewed toward small), never a $100k position
  // that the account couldn't hold. This is the coherence fix: trade
  // notionals, account value, and allocation % all tie out.
  const targetNotionalCents = 1_500_00 + Math.round(rng() * rng() * 24_500_00);
  const qty = Math.max(1, Math.round(targetNotionalCents / entryCents));

  // Hold time: half intraday, half multi-day.
  const holdMin = Math.round(
    rng() < 0.5
      ? 5 + rng() * 240
      : 60 + rng() * 60 * 24 * 3,
  );

  // Positive-expectancy distribution: a believable ~56% win rate where
  // winners run slightly larger than losers, so the cumulative equity
  // curve trends up ("look what you've done") without looking too clean.
  let returnPct = (rng() + rng() - 1) * symbol.vol * 2.2;
  if (forceLoss) returnPct = -Math.abs(returnPct) - 0.005;
  else if (rng() < 0.6) returnPct = Math.abs(returnPct) + 0.011;
  else returnPct = -Math.abs(returnPct) * 0.7;

  const exitCents =
    side === "LONG"
      ? Math.round(entryCents * (1 + returnPct))
      : Math.round(entryCents * (1 - returnPct));

  const fee = feeFor(rng);

  const hasTargetStop = rng() < 0.7;
  const stopDistance = entryCents * (0.01 + rng() * 0.04);
  const targetDistance = entryCents * (0.02 + rng() * 0.08);
  const targetCents = hasTargetStop
    ? side === "LONG"
      ? Math.round(entryCents + targetDistance)
      : Math.round(entryCents - targetDistance)
    : undefined;
  const stopCents = hasTargetStop
    ? side === "LONG"
      ? Math.round(entryCents - stopDistance)
      : Math.round(entryCents + stopDistance)
    : undefined;

  const openingAction: ExecutionAction = side === "LONG" ? "BUY" : "SELL";
  const closingAction: ExecutionAction = side === "LONG" ? "SELL" : "BUY";

  // Never let a demo trade close in the future — clamp to `now` so the
  // calendar/journal never show a trade dated tomorrow.
  const closedAt = new Date(
    Math.min(openedAt.getTime() + holdMin * 60_000, now.getTime()),
  );

  const executions: TradeExecution[] = [
    {
      id: uid(rng, "ex"),
      action: openingAction,
      at: openedAt.toISOString(),
      qty,
      priceCents: entryCents,
      feeCents: fee,
    },
    {
      id: uid(rng, "ex"),
      action: closingAction,
      at: closedAt.toISOString(),
      qty,
      priceCents: exitCents,
      feeCents: fee,
    },
  ];

  const noteBank = [
    "Broke above key level, took the entry.",
    "Earnings setup. Pre-market gap fade.",
    "Trend day. Held into close.",
    "Stopped early — choppy tape.",
    "ORB pattern, momentum follow-through.",
    "VWAP reclaim, scaled in twice.",
    "News driver, took profits at first target.",
    "Range-bound; quick scalp at support.",
  ];
  const tagBank = ["breakout", "pullback", "earnings", "trend", "momentum", "scalp", "swing", "news"];
  const notes = rng() < 0.55 ? noteBank[Math.floor(rng() * noteBank.length)] : undefined;
  const tags: string[] = [];
  const tagCount = Math.floor(rng() * 3);
  for (let i = 0; i < tagCount; i++) {
    const t = tagBank[Math.floor(rng() * tagBank.length)]!;
    if (!tags.includes(t)) tags.push(t);
  }
  const confidence = rng() < 0.7 ? ((Math.floor(rng() * 5) + 1) as 1 | 2 | 3 | 4 | 5) : undefined;

  return {
    id: uid(rng, "t"),
    accountId: TRADING_ACCOUNT_ID,
    symbol: symbol.sym,
    market: "STOCK",
    side,
    targetCents,
    stopCents,
    executions,
    notes,
    tags,
    confidence,
    source: "demo",
  };
}

/** One opening BUY whose net qty becomes the held position. */
function generateOpeningTrade(
  rng: () => number,
  spec: OpenPositionSpec,
  windowStart: Date,
  windowEnd: Date,
): { trade: Trade; holding: DerivedHolding } {
  const at = randomWeekday(rng, windowStart, windowEnd);
  const drift = (rng() - 0.5) * 0.06;
  const priceCents = Math.max(50, Math.round(spec.basePrice * (1 + drift)));
  const fee = feeFor(rng);

  // Slight chance of a stop/target on the open position too.
  const hasStop = rng() < 0.6;
  const targetCents = hasStop ? Math.round(priceCents * (1 + 0.06 + rng() * 0.08)) : undefined;
  const stopCents = hasStop ? Math.round(priceCents * (1 - 0.03 - rng() * 0.04)) : undefined;

  const trade: Trade = {
    id: uid(rng, "t"),
    accountId: TRADING_ACCOUNT_ID,
    symbol: spec.sym,
    market: "STOCK",
    side: "LONG",
    targetCents,
    stopCents,
    executions: [
      {
        id: uid(rng, "ex"),
        action: "BUY",
        at: at.toISOString(),
        qty: spec.qty,
        priceCents,
        feeCents: fee,
      },
    ],
    notes: undefined,
    tags: [],
    confidence: undefined,
    source: "demo",
  };

  const holding: DerivedHolding = {
    symbol: spec.sym,
    name: spec.name,
    accountId: TRADING_ACCOUNT_ID,
    qty: spec.qty,
    avgCostCents: priceCents,
    source: "demo",
  };

  return { trade, holding };
}

type DerivedHolding = {
  symbol: string;
  name: string;
  accountId: string;
  qty: number;
  avgCostCents: number;
  source: "demo";
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** One week's realized P&L bucket — structurally the WeekBar shape in mock.ts. */
type WeeklyBar = {
  weekOf: string;
  pnlCents: number;
  trades: number;
  winRate: number;
};

/** ISO date (YYYY-MM-DD) of the Sunday that starts `d`'s week, in UTC. */
function weekStartKey(d: Date): string {
  const sun = new Date(d);
  sun.setUTCDate(d.getUTCDate() - d.getUTCDay());
  sun.setUTCHours(0, 0, 0, 0);
  return sun.toISOString().slice(0, 10);
}

/**
 * Weekly realized-P&L bars derived from the generated closed trades, so the
 * Weekly P&L sparkline ties out to the same journal the calendar/stats use
 * (and moves with "now" like everything else). Only balanced round-trips
 * (a BUY and a SELL) count — the single-leg opening BUYs are still open.
 */
function buildWeeklyPnl(trades: Trade[]): WeeklyBar[] {
  const byWeek = new Map<string, { pnlCents: number; trades: number; wins: number }>();
  for (const t of trades) {
    const buys = t.executions.filter((e) => e.action === "BUY");
    const sells = t.executions.filter((e) => e.action === "SELL");
    if (buys.length === 0 || sells.length === 0) continue; // still open
    let pnl = 0;
    let closeAt = "";
    for (const e of t.executions) {
      pnl += (e.action === "SELL" ? 1 : -1) * e.qty * e.priceCents - e.feeCents;
      if (e.at > closeAt) closeAt = e.at;
    }
    const key = weekStartKey(new Date(closeAt));
    const cur = byWeek.get(key) ?? { pnlCents: 0, trades: 0, wins: 0 };
    cur.pnlCents += pnl;
    cur.trades += 1;
    if (pnl > 0) cur.wins += 1;
    byWeek.set(key, cur);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekOf, v]) => ({
      weekOf,
      pnlCents: v.pnlCents,
      trades: v.trades,
      winRate: v.trades > 0 ? v.wins / v.trades : 0,
    }));
}

function generate(): {
  trades: Trade[];
  tradingHoldings: DerivedHolding[];
  cashCents: number;
  weeklyPnl: WeeklyBar[];
} {
  const rng = makeRng(0xC4_45_36);
  const trades: Trade[] = [];

  // Anchor to "now" so the demo always covers the current month plus the
  // prior ~3 months — the journal/calendar/performance never look stale.
  const now = new Date();
  const closedEnd = now;
  const closedStart = new Date(closedEnd.getTime() - 14 * 7 * DAY_MS);

  let cursor = new Date(closedStart);
  while (cursor.getTime() < closedEnd.getTime() - DAY_MS) {
    const weekEnd = new Date(
      Math.min(cursor.getTime() + 7 * DAY_MS, closedEnd.getTime()),
    );
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      trades.push(generateClosedTrade(rng, cursor, weekEnd, now));
    }
    cursor = weekEnd;
  }

  // Opening BUYs for current holdings — spread across the last ~4 weeks.
  const openStart = new Date(now.getTime() - 28 * DAY_MS);
  const openEnd = now;
  const tradingHoldings: DerivedHolding[] = [];
  for (const pos of OPEN_POSITIONS) {
    const { trade, holding } = generateOpeningTrade(rng, pos, openStart, openEnd);
    trades.push(trade);
    tradingHoldings.push(holding);
  }

  // Compute cash from execution flows. BUYs spend cash, SELLs add it,
  // fees always subtract. Final cash = start + sum(realized) − sum(open cost).
  let cashCents = STARTING_CASH_CENTS;
  for (const t of trades) {
    for (const ex of t.executions) {
      const sign = ex.action === "BUY" ? -1 : 1;
      cashCents += sign * ex.qty * ex.priceCents;
      cashCents -= ex.feeCents;
    }
  }

  return { trades, tradingHoldings, cashCents, weeklyPnl: buildWeeklyPnl(trades) };
}

const generated = generate();

export const tradesSeed: Trade[] = generated.trades;
export const tradingHoldingsSeed = generated.tradingHoldings;
export const tradingCashCents = generated.cashCents;
export const weeklyPnlSeed = generated.weeklyPnl;

/** Pre-trade plan shown above the journal list. Dated a few days back so it
 *  stays "recent" relative to now, like the rest of the demo data. */
const setupCreatedAt = new Date(Date.now() - 3 * DAY_MS).toISOString();

export const setupsSeed: TradeSetup[] = [
  {
    id: "setup-001",
    accountId: "U-trade",
    symbol: "AAP",
    market: "STOCK",
    side: "SHORT",
    entryCents: 164_00,
    targetCents: 163_10,
    stopCents: 165_10,
    notes: "Key level at 164 — if it breaks, take the short.",
    createdAt: setupCreatedAt,
    status: "ACTIVE",
  },
];
