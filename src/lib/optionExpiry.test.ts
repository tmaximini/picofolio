import { describe, expect, it } from "vitest";
import { closeExpiredOptions } from "./optionExpiry";
import { deriveTotals } from "./tradeMath";
import type { Trade } from "./trades";

const csp = (symbol: string, over: Partial<Trade> = {}): Trade => ({
  id: `ibkr-${symbol}`,
  accountId: "a1",
  symbol,
  market: "OPTION",
  side: "SHORT",
  tags: [],
  source: "ibkr",
  executions: [{ id: "e1", action: "SELL", at: "2026-08-01T14:00:00Z", qty: 1, priceCents: 200, feeCents: 100 }],
  ...over,
});

describe("closeExpiredOptions", () => {
  it("closes an expired cash-secured put at $0 — the premium is the win", () => {
    const { trades, closed } = closeExpiredOptions([csp("NOW 260821P00135000")], { today: "2026-09-27" });
    expect(closed).toBe(1);
    const t = trades[0]!;
    expect(t.executions.at(-1)).toMatchObject({ action: "BUY", qty: 1, priceCents: 0, at: "2026-08-21T20:20:00.000Z" });
    const tot = deriveTotals(t);
    expect(tot.status).toBe("WIN");
    expect(tot.returnCents).toBeGreaterThan(0);
  });

  it("leaves unexpired, held, manual, other-account and already-closed trades alone", () => {
    const input = [
      csp("NOW 261009P00135000"), // expires in the future
      csp("WDC 260821P00420000", { id: "held" }),
      csp("AMD 260821P00100000", { source: "manual" }),
      csp("TSLA 260821P00200000", { accountId: "a2" }),
    ];
    const { closed } = closeExpiredOptions(input, {
      accountId: "a1",
      today: "2026-09-27",
      heldSymbols: new Set(["WDC 260821P00420000"]),
    });
    expect(closed).toBe(0);
  });
});
