import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./index";
import type { Trade } from "@/lib/trades";

const trade = (id: string, accountId: string, source: Trade["source"]): Trade => ({
  id, accountId, source, symbol: "X", market: "STOCK", side: "LONG", tags: [], executions: [],
});

describe("clearing non-IBKR data from an account", () => {
  beforeEach(() =>
    useStore.setState({
      trades: [trade("d", "a", "demo"), trade("m", "a", "manual"), trade("i", "a", "ibkr"), trade("o", "b", "demo")],
      holdings: [],
      setups: [],
    }),
  );

  it("clearDemoForAccount keeps hand-entered and IBKR trades", () => {
    useStore.getState().clearDemoForAccount("a");
    expect(useStore.getState().trades.map((t) => t.id)).toEqual(["m", "i", "o"]);
  });

  it("clearNonIbkrForAccount keeps only IBKR trades in that account", () => {
    useStore.getState().clearNonIbkrForAccount("a");
    expect(useStore.getState().trades.map((t) => t.id)).toEqual(["i", "o"]);
  });
});
