import { describe, expect, it } from "vitest";
import { parseFlexXml } from "./flexParser";

/** Synthetic Flex statement: a GBP LSE round trip, a KRW KSE position, a
 *  plain US position, EUR base from AccountInformation, BASE_SUMMARY cash. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<FlexQueryResponse queryName="test" type="AF">
  <FlexStatements count="1">
    <FlexStatement accountId="U1234567" fromDate="20260601" toDate="20260710">
      <AccountInformation accountId="U1234567" currency="EUR" name="Test" />
      <Trades>
        <Trade tradeID="1001" ibOrderID="501" accountId="U1234567"
          symbol="DRAM" assetCategory="STK" currency="GBP" listingExchange="LSE"
          buySell="BUY" quantity="350" tradePrice="7.70" ibCommission="-3.50"
          dateTime="20260630;093500" openCloseIndicator="O" />
        <Trade tradeID="1002" ibOrderID="502" accountId="U1234567"
          symbol="AAPL" assetCategory="STK" currency="USD" listingExchange="NASDAQ"
          buySell="BUY" quantity="10" tradePrice="210.00" ibCommission="-1.00"
          dateTime="20260701;103000" openCloseIndicator="O" />
        <Trade tradeID="1003" ibOrderID="503" accountId="U1234567"
          symbol="XYZ" assetCategory="STK" currency="USD" listingExchange="WEIRDX"
          buySell="BUY" quantity="5" tradePrice="10.00" ibCommission="-1.00"
          dateTime="20260702;103000" openCloseIndicator="O" />
      </Trades>
      <OpenPositions>
        <OpenPosition accountId="U1234567" symbol="025560" assetCategory="STK"
          currency="KRW" listingExchange="KSE" position="500"
          costBasisPrice="8008" markPrice="42200" />
        <OpenPosition accountId="U1234567" symbol="DRAM" assetCategory="STK"
          currency="GBP" listingExchange="LSE" position="350"
          costBasisPrice="7.70" markPrice="6.44" />
      </OpenPositions>
      <CashReport>
        <CashReportCurrency accountId="U1234567" currency="BASE_SUMMARY" endingCash="12345.67" />
        <CashReportCurrency accountId="U1234567" currency="EUR" endingCash="10000.00" />
        <CashReportCurrency accountId="U1234567" currency="KRW" endingCash="500000" />
      </CashReport>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>`;

describe("parseFlexXml currency support", () => {
  const result = parseFlexXml(XML);

  it("maps STK symbols to their Yahoo form via listingExchange", () => {
    const symbols = result.positions.map((p) => p.symbol);
    expect(symbols).toContain("025560.KS");
    expect(symbols).toContain("DRAM.L");
    const tradeSymbols = result.trades.map((t) => t.symbol);
    expect(tradeSymbols).toContain("DRAM.L");
    expect(tradeSymbols).toContain("AAPL"); // US stays bare
  });

  it("keeps unknown-exchange symbols bare and warns once", () => {
    expect(result.trades.map((t) => t.symbol)).toContain("XYZ");
    expect(
      result.warnings.filter((w) => w.includes("WEIRDX")).length,
    ).toBe(1);
  });

  it("stamps currency on positions and trades", () => {
    const krw = result.positions.find((p) => p.symbol === "025560.KS");
    expect(krw?.currency).toBe("KRW");
    // KRW prices in "cents" of the major unit: ₩8,008 → 800800.
    expect(krw?.avgCostCents).toBe(800800);
    expect(krw?.markPriceCents).toBe(4220000);

    const dram = result.trades.find((t) => t.symbol === "DRAM.L");
    expect(dram?.currency).toBe("GBP");
    expect(dram?.executions[0]?.priceCents).toBe(770);
  });

  it("detects the account base currency from AccountInformation", () => {
    expect(result.baseCurrencyByAccount["U1234567"]).toBe("EUR");
  });

  it("still reads BASE_SUMMARY cash", () => {
    expect(result.cashCents).toBe(1234567);
  });
});

describe("parseBaseCurrencies fallbacks", () => {
  it("falls back to the NAV-in-base rows when AccountInformation is absent", () => {
    const xml = `<FlexQueryResponse><FlexStatements count="1"><FlexStatement accountId="U1">
      <EquitySummaryByReportDateInBase accountId="U1" currency="CHF" reportDate="20260701" total="1000" />
      <OpenPositions><OpenPosition accountId="U1" symbol="NESN" assetCategory="STK" currency="CHF" listingExchange="EBS" position="10" costBasisPrice="80" markPrice="82" /></OpenPositions>
    </FlexStatement></FlexStatements></FlexQueryResponse>`;
    const r = parseFlexXml(xml);
    expect(r.baseCurrencyByAccount["U1"]).toBe("CHF");
    expect(r.positions[0]?.symbol).toBe("NESN.SW");
  });

  it("uses a sole non-BASE_SUMMARY cash row as the last resort", () => {
    const xml = `<FlexQueryResponse><FlexStatements count="1"><FlexStatement accountId="U2">
      <CashReport><CashReportCurrency accountId="U2" currency="GBP" endingCash="500" /></CashReport>
      <OpenPositions><OpenPosition accountId="U2" symbol="DRAM" assetCategory="STK" currency="GBP" listingExchange="LSE" position="1" costBasisPrice="7" markPrice="7" /></OpenPositions>
    </FlexStatement></FlexStatements></FlexQueryResponse>`;
    const r = parseFlexXml(xml);
    expect(r.baseCurrencyByAccount["U2"]).toBe("GBP");
  });

  it("never remaps option symbols", () => {
    const xml = `<FlexQueryResponse><FlexStatements count="1"><FlexStatement accountId="U3">
      <OpenPositions><OpenPosition accountId="U3" symbol="MSFT  260529C00465000" assetCategory="OPT" currency="USD" listingExchange="CBOE" position="1" costBasisPrice="12.50" markPrice="13.00" /></OpenPositions>
    </FlexStatement></FlexStatements></FlexQueryResponse>`;
    const r = parseFlexXml(xml);
    expect(r.positions[0]?.symbol).toBe("MSFT  260529C00465000");
  });
});
