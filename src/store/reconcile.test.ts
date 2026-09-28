import { describe, expect, it } from "vitest";
import { reconcileIbkrTrades } from "./index";
import type { Trade } from "@/lib/trades";

const t = (id: string, dates: string[], over: Partial<Trade> = {}): Trade => ({
  id, accountId: "a", source: "ibkr", symbol: "X", market: "STOCK", side: "LONG", tags: [],
  executions: dates.map((d, i) => ({ id: `${id}-${i}`, action: i ? "SELL" : "BUY", at: `${d}T15:00:00Z`, qty: 1, priceCents: 100, feeCents: 0 })),
  ...over,
});

const window = { accountId: "a", windowStart: "2025-09-28", replace: false };

describe("reconcileIbkrTrades", () => {
  it("drops fully-covered IBKR trades the fresh statement no longer produces", () => {
    const stale = t("phantom", ["2025-10-02", "2026-06-29"]);
    const real = t("real", ["2026-01-05", "2026-02-01"]);
    const out = reconcileIbkrTrades([stale, real], [real], window);
    expect(out.map((x) => x.id)).toEqual(["real"]);
  });

  it("keeps trades opened before the window, other accounts and non-IBKR trades", () => {
    const spanning = t("span", ["2025-06-01", "2025-11-01"]);
    const other = t("other", ["2026-01-01"], { accountId: "b" });
    const manual = t("manual", ["2026-01-01"], { source: "manual" });
    expect(reconcileIbkrTrades([spanning, other, manual], [], window).map((x) => x.id)).toEqual(["span", "other", "manual"]);
  });

  it("on re-import rebuilds every fully-covered trade, still keeping pre-window ones", () => {
    const covered = t("c", ["2026-01-05"]);
    const spanning = t("span", ["2025-06-01", "2025-11-01"]);
    const out = reconcileIbkrTrades([covered, spanning], [covered], { ...window, replace: true });
    expect(out.map((x) => x.id)).toEqual(["span"]);
  });
});
