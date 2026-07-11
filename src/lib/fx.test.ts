import { describe, expect, it } from "vitest";
import {
  convertCents,
  fxPairSymbol,
  fxPairsNeeded,
  fxRateOnOrBefore,
  isFxSymbol,
  latestFxRate,
  portfolioBaseOf,
} from "./fx";
import type { Account } from "./mock";
import type { Trade } from "./trades";

const KRWUSD = {
  "KRWUSD=X": {
    points: [
      { time: "2026-07-01", value: 0.00072 },
      { time: "2026-07-02", value: 0.00073 },
      { time: "2026-07-06", value: 0.00074 },
    ],
  },
};

describe("fx pairs", () => {
  it("builds and recognizes pair symbols", () => {
    expect(fxPairSymbol("KRW", "USD")).toBe("KRWUSD=X");
    expect(isFxSymbol("KRWUSD=X")).toBe(true);
    expect(isFxSymbol("AAPL")).toBe(false);
  });

  it("latestFxRate: identity, present, absent", () => {
    expect(latestFxRate("USD", "USD", {})).toBe(1);
    expect(latestFxRate("KRW", "USD", KRWUSD)).toBe(0.00074);
    expect(latestFxRate("GBP", "USD", KRWUSD)).toBeNull();
  });

  it("fxRateOnOrBefore carries the last close forward over gaps", () => {
    expect(fxRateOnOrBefore("KRW", "USD", "2026-07-02", KRWUSD)).toBe(0.00073);
    // Weekend: carries Friday's (here: Jul 2) close forward.
    expect(fxRateOnOrBefore("KRW", "USD", "2026-07-04", KRWUSD)).toBe(0.00073);
    // Before the series starts → null.
    expect(fxRateOnOrBefore("KRW", "USD", "2026-06-30", KRWUSD)).toBeNull();
    expect(fxRateOnOrBefore("KRW", "KRW", "2026-06-30", {})).toBe(1);
  });

  it("aliases CNH (IBKR offshore yuan) to Yahoo's CNY crosses", () => {
    const CNYEUR = {
      "CNYEUR=X": { points: [{ time: "2026-07-01", value: 0.1196 }] },
    };
    expect(fxPairSymbol("CNH", "EUR")).toBe("CNYEUR=X");
    expect(latestFxRate("CNH", "EUR", CNYEUR)).toBe(0.1196);
    expect(fxRateOnOrBefore("CNH", "EUR", "2026-07-02", CNYEUR)).toBe(0.1196);
    // CNH↔CNY are the same unit for conversion purposes.
    expect(latestFxRate("CNH", "CNY", {})).toBe(1);
  });

  it("convertCents rounds to integer cents", () => {
    expect(convertCents(4220000, 0.00073)).toBe(3081);
    expect(convertCents(1000, 1)).toBe(1000);
  });
});

describe("fxPairsNeeded", () => {
  it("requests the CNY cross for CNH trades, and skips CNH↔CNY", () => {
    const accounts = [
      { id: "a", baseCurrency: "EUR" },
      { id: "b", baseCurrency: "CNY" },
    ] as unknown as Account[];
    const trades = [
      { accountId: "a", currency: "CNH" },
      { accountId: "b", currency: "CNH" },
    ] as unknown as Trade[];
    const pairs = fxPairsNeeded([], trades, accounts, "USD", {});
    expect(pairs).toContain("CNYEUR=X");
    // CNH in a CNY-based account needs no conversion…
    expect(pairs).not.toContain("CNYCNY=X");
    // …but each account base still needs its leg to the portfolio base.
    expect(pairs).toContain("EURUSD=X");
    expect(pairs).toContain("CNYUSD=X");
  });
});

describe("portfolioBaseOf", () => {
  const acct = (baseCurrency?: string) =>
    ({ id: "a", baseCurrency }) as unknown as Account;

  it("uniform base wins; mixed falls back to USD", () => {
    expect(portfolioBaseOf([acct("EUR"), acct("EUR")])).toBe("EUR");
    expect(portfolioBaseOf([acct("EUR"), acct("USD")])).toBe("USD");
    expect(portfolioBaseOf([acct(), acct()])).toBe("USD");
  });
});
