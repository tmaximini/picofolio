/**
 * Close options that are past expiry but still read as OPEN.
 *
 * IBKR books expirations, assignments and exercises as $0 "BookTrade" rows;
 * the Flex parser keeps those now, but a query only reaches back 365 days, so
 * contracts that expired before the window (or were imported by an older
 * build that dropped $0 rows) would stay open forever — e.g. every expired
 * cash-secured put. A contract can't be held past its expiry, so an OPEN
 * option whose expiry is behind us closes at $0 on that day: the right
 * outcome for an expiry, and for the option leg of an assignment/exercise.
 */

import { deriveTotals } from "./tradeMath";
import { parseOccSymbol } from "./optionSymbol";
import type { Trade } from "./trades";

/** 16:20 America/New_York — OCC's expiry cut-off (EDT; within an hour in EST). */
const EXPIRY_TIME_UTC = "T20:20:00.000Z";

export function closeExpiredOptions(
  trades: Trade[],
  opts: { accountId?: string; heldSymbols?: ReadonlySet<string>; today: string },
): { trades: Trade[]; closed: number } {
  let closed = 0;
  const out = trades.map((t) => {
    if (opts.accountId && t.accountId !== opts.accountId) return t;
    if (t.source !== "ibkr") return t; // manual trades are the user's to close
    const opt = parseOccSymbol(t.symbol);
    if (!opt || opt.expiry >= opts.today) return t;
    if (opts.heldSymbols?.has(t.symbol)) return t;
    if (deriveTotals(t).status !== "OPEN") return t;

    const openAction = t.side === "LONG" ? "BUY" : "SELL";
    const openQty = t.executions.reduce((n, e) => n + (e.action === openAction ? e.qty : -e.qty), 0);
    if (openQty <= 0) return t;
    closed++;
    return {
      ...t,
      executions: [
        ...t.executions,
        {
          id: `${t.id}-expiry`,
          action: openAction === "BUY" ? ("SELL" as const) : ("BUY" as const),
          at: `${opt.expiry}${EXPIRY_TIME_UTC}`,
          qty: openQty,
          priceCents: 0,
          feeCents: 0,
        },
      ],
    };
  });
  return { trades: closed > 0 ? out : trades, closed };
}
