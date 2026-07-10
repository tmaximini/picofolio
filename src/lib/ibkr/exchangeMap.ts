/**
 * IBKR listingExchange → Yahoo Finance symbol mapping.
 *
 * IBKR reports non-US listings with bare local symbols ("DRAM", "025560",
 * "2308"); Yahoo needs an exchange suffix ("DRAM.L", "025560.KS",
 * "2308.TW"). Mapping happens once, at Flex parse time, so holdings and
 * journal trades share Yahoo-ready symbol keys.
 *
 * Unknown exchanges degrade to the bare symbol — the manual ticker-edit
 * workaround in the position form keeps working, and the parser surfaces
 * a warning so the gap is visible in the sync toast.
 */

/** US listings (and US-routing venues) — Yahoo wants the bare symbol. */
const US_EXCHANGES = new Set([
  "NYSE",
  "NASDAQ",
  "ISLAND",
  "ARCA",
  "AMEX",
  "BATS",
  "IEX",
  "PINK",
  "OTCBB",
  "OTCLNKECN",
  "CBOE",
  "PHLX",
  "NYSENAT",
  "PSE",
  "CHX",
]);

/** IBKR listingExchange code → Yahoo suffix. */
const SUFFIX_BY_EXCHANGE: Record<string, string> = {
  // London (quotes in pence — normalized at the Yahoo fetch boundary)
  LSE: ".L",
  LSEETF: ".L",
  LSEIOB1: ".L",
  // Asia-Pacific
  SEHK: ".HK",
  KSE: ".KS", // Korea (KOSPI)
  KOSDAQ: ".KQ",
  TWSE: ".TW",
  TSEC: ".TW",
  TSEJ: ".T", // Tokyo
  ASX: ".AX",
  SGX: ".SI",
  NSE: ".NS",
  BSE: ".BO",
  NZX: ".NZ",
  // Canada
  TSE: ".TO", // Toronto (IBKR's Tokyo is TSEJ)
  VENTURE: ".V",
  // Europe
  IBIS: ".DE", // XETRA
  IBIS2: ".DE",
  FWB: ".F",
  FWB2: ".F",
  EBS: ".SW", // SIX Swiss
  VIRTX: ".SW",
  SBF: ".PA",
  AEB: ".AS",
  "ENEXT.BE": ".BR",
  BVLP: ".LS",
  BVME: ".MI",
  "BVME.ETF": ".MI",
  BM: ".MC",
  VSE: ".VI",
  WSE: ".WA",
  SFB: ".ST",
  CPH: ".CO",
  HEX: ".HE",
  OSE: ".OL", // Oslo (IBKR's Osaka is OSE.JPN — deliberately unmapped)
  // Rest of world
  BVMF: ".SA",
  MEXI: ".MX",
  TASE: ".TA",
};

/** Suffixes where symbols use a dash for share classes ("RCI.B" → "RCI-B.TO"). */
const DOT_TO_DASH_SUFFIXES = new Set([".TO", ".V"]);

const KNOWN_SUFFIXES = new Set(Object.values(SUFFIX_BY_EXCHANGE));

/** True when the exchange code is neither US nor in the suffix map. */
export function isUnknownExchange(listingExchange: string): boolean {
  const code = listingExchange.toUpperCase();
  return !US_EXCHANGES.has(code) && SUFFIX_BY_EXCHANGE[code] == null;
}

/**
 * Map an IBKR stock symbol to its Yahoo symbol. Callers must gate on
 * assetCategory === "STK" — OCC option symbols, futures, and CASH pairs
 * must never be remapped.
 */
export function yahooSymbolFor(
  symbol: string,
  listingExchange: string | null | undefined,
): string {
  if (!symbol || !listingExchange) return symbol;
  // Already carries a known Yahoo suffix (manually fixed or re-parsed).
  const dot = symbol.lastIndexOf(".");
  if (dot > 0 && KNOWN_SUFFIXES.has(symbol.slice(dot))) return symbol;

  const suffix = SUFFIX_BY_EXCHANGE[listingExchange.toUpperCase()];
  if (!suffix) return symbol; // US or unknown → bare

  let body = symbol;
  // Hong Kong tickers are numeric and Yahoo zero-pads them to 4 digits.
  if (suffix === ".HK" && /^\d{1,3}$/.test(body)) {
    body = body.padStart(4, "0");
  }
  if (DOT_TO_DASH_SUFFIXES.has(suffix)) {
    body = body.replace(/\./g, "-");
  }
  return `${body}${suffix}`;
}
