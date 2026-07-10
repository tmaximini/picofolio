import { describe, expect, it } from "vitest";
import { isUnknownExchange, yahooSymbolFor } from "./exchangeMap";

describe("yahooSymbolFor", () => {
  it("maps the common exchange suffixes", () => {
    expect(yahooSymbolFor("DRAM", "LSE")).toBe("DRAM.L");
    expect(yahooSymbolFor("025560", "KSE")).toBe("025560.KS");
    expect(yahooSymbolFor("035720", "KOSDAQ")).toBe("035720.KQ");
    expect(yahooSymbolFor("2308", "TWSE")).toBe("2308.TW");
    expect(yahooSymbolFor("7203", "TSEJ")).toBe("7203.T");
    expect(yahooSymbolFor("2GB", "IBIS")).toBe("2GB.DE");
    expect(yahooSymbolFor("NESN", "EBS")).toBe("NESN.SW");
    expect(yahooSymbolFor("MC", "SBF")).toBe("MC.PA");
    expect(yahooSymbolFor("ASML", "AEB")).toBe("ASML.AS");
    expect(yahooSymbolFor("BHP", "ASX")).toBe("BHP.AX");
  });

  it("zero-pads short numeric SEHK symbols to 4 digits", () => {
    expect(yahooSymbolFor("700", "SEHK")).toBe("0700.HK");
    expect(yahooSymbolFor("5", "SEHK")).toBe("0005.HK");
    expect(yahooSymbolFor("9988", "SEHK")).toBe("9988.HK");
    // 5-digit codes pass through unpadded.
    expect(yahooSymbolFor("80737", "SEHK")).toBe("80737.HK");
  });

  it("converts share-class dots to dashes on Toronto listings", () => {
    expect(yahooSymbolFor("RCI.B", "TSE")).toBe("RCI-B.TO");
    expect(yahooSymbolFor("SHOP", "TSE")).toBe("SHOP.TO");
  });

  it("keeps US listings bare", () => {
    expect(yahooSymbolFor("AAPL", "NASDAQ")).toBe("AAPL");
    expect(yahooSymbolFor("TSM", "NYSE")).toBe("TSM");
    expect(yahooSymbolFor("VOO", "ARCA")).toBe("VOO");
  });

  it("keeps unknown exchanges bare (manual-edit fallback)", () => {
    expect(yahooSymbolFor("XYZ", "SOMEVENUE")).toBe("XYZ");
    expect(isUnknownExchange("SOMEVENUE")).toBe(true);
    expect(isUnknownExchange("LSE")).toBe(false);
    expect(isUnknownExchange("NASDAQ")).toBe(false);
  });

  it("leaves already-suffixed and empty-exchange symbols unchanged", () => {
    expect(yahooSymbolFor("2308.TW", "TWSE")).toBe("2308.TW");
    expect(yahooSymbolFor("DRAM.L", "LSE")).toBe("DRAM.L");
    expect(yahooSymbolFor("AAPL", "")).toBe("AAPL");
    expect(yahooSymbolFor("AAPL", null)).toBe("AAPL");
  });
});
