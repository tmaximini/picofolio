import { describe, expect, it } from "vitest";
import {
  convertCents,
  fxPairSymbol,
  fxRateOnOrBefore,
  isFxSymbol,
  latestFxRate,
  portfolioBaseOf,
} from "./fx";
import type { Account } from "./mock";

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

  it("convertCents rounds to integer cents", () => {
    expect(convertCents(4220000, 0.00073)).toBe(3081);
    expect(convertCents(1000, 1)).toBe(1000);
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
