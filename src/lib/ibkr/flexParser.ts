/**
 * IBKR Flex Query XML → our Trade[] shape.
 *
 * The Flex Query "Trades" section emits one <Trade> element per execution
 * (one trade-confirmation). We parse all executions, then group them into
 * round-trip "positions" — opening executions accumulate quantity, closing
 * executions reduce it; when quantity hits zero we emit one Trade and start
 * a new bucket for any subsequent executions on the same symbol.
 *
 * Open positions (no closing exec) become OPEN Trades.
 *
 * Returns the parsed Trade[] plus any anomalies the caller may want to
 * surface (skipped rows, unknown asset categories, etc.).
 */

import type {
  ExecutionAction,
  Market,
  Side,
  Trade,
  TradeExecution,
} from "../trades";
import { isUnknownExchange, yahooSymbolFor } from "./exchangeMap";

export type ParsedExecution = {
  /** IBKR tradeID — globally unique per execution. Used for dedupe. */
  tradeID: string;
  /** IBKR ibOrderID — shared by all slot fills from the same order.
   *  Used to coalesce slot fills into a single execution at parse time. */
  ibOrderID: string;
  symbol: string;
  market: Market;
  /** Account id from IBKR (Uxxxxx). */
  accountId: string;
  action: ExecutionAction;
  /** ISO 8601 UTC. */
  at: string;
  qty: number;
  priceCents: number;
  /** Absolute commission/fees in cents (always positive). */
  feeCents: number;
  /** Reported by IBKR: "O" (open) or "C" (close). May be empty. */
  openClose: "O" | "C" | "";
  /** ISO 4217 currency of the trade's prices. Absent = USD. */
  currency?: string;
  /** IBKR listing exchange code (LSE, KSE, TWSE, …). */
  listingExchange?: string;
};

/** A current open position from the Flex <OpenPositions> section. */
export type ParsedPosition = {
  symbol: string;
  market: Market;
  accountId: string;
  /** Signed share/contract count (negative = short). */
  qty: number;
  /** Average cost per share/contract, in cents. */
  avgCostCents: number;
  /** IBKR's last mark price per unit, in cents. Used to value instruments
   *  with no Yahoo source (options, futures). 0 if not reported. */
  markPriceCents: number;
  /** ISO 4217 currency the position's prices are denominated in. Absent = USD. */
  currency?: string;
};

/** One day of broker-reported NAV, from the "Net Asset Value (NAV) in Base"
 *  section (<EquitySummaryInBase>). This is IBKR's official end-of-day
 *  account value — the ground truth the performance chart should follow. */
export type ParsedNavPoint = {
  /** Account id from IBKR (Uxxxxx / DUxxxxx). */
  accountId: string;
  /** YYYY-MM-DD report date. */
  time: string;
  /** Total NAV in base currency, integer cents. */
  valueCents: number;
};

export type FlexParseResult = {
  trades: Trade[];
  /** Underlying executions in document order — useful for debugging or future re-grouping. */
  executions: ParsedExecution[];
  /** Current open positions (from <OpenPositions>), if the query includes them. */
  positions: ParsedPosition[];
  /** Base-currency cash (from <CashReport> BASE_SUMMARY), in cents. 0 if absent. */
  cashCents: number;
  /** Daily NAV history (from the NAV-in-Base section), date-ascending. Empty if absent. */
  nav: ParsedNavPoint[];
  warnings: string[];
  accountIds: string[];
  /** Detected account base currency per raw IBKR accountId. "" key =
   *  statement-level (no accountId on the source row). Empty when the
   *  query includes none of the detectable sections — caller falls back
   *  to USD. */
  baseCurrencyByAccount: Record<string, string>;
};

const ASSET_CATEGORY_MAP: Record<string, Market> = {
  STK: "STOCK",
  OPT: "OPTION",
  FUT: "FUTURE",
  CASH: "FOREX",
  CRYPTO: "CRYPTO",
};

/** Convert IBKR's "YYYYMMDD;HHMMSS" or "YYYYMMDD" to ISO 8601 UTC. */
function flexDateTimeToISO(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:[;\s]?(\d{2})(\d{2})(\d{2}))?$/);
  if (!m) {
    // Fallback: try "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM:SS"
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }
  const [, y, mo, d, hh, mm, ss] = m;
  const hh2 = hh ?? "00";
  const mm2 = mm ?? "00";
  const ss2 = ss ?? "00";
  // Treat as UTC. (IBKR reports exchange-local; for the PoC we don't
  // try to convert — the calendar buckets by date string, which is
  // close enough. Real TZ handling can come with the Settings work.)
  return `${y}-${mo}-${d}T${hh2}:${mm2}:${ss2}.000Z`;
}

function dollarsStringToCents(raw: string | null | undefined): number {
  if (!raw) return 0;
  const f = parseFloat(raw);
  if (Number.isNaN(f)) return 0;
  return Math.round(f * 100);
}

function abs(n: number): number {
  return Math.abs(n);
}

/** Read the row's currency + listing exchange and map the symbol to its
 *  Yahoo form (STK only — OCC/futures/CASH symbols must stay raw). Warns
 *  once per unknown non-US exchange code so the sync toast surfaces it. */
function resolveListing(
  el: Element,
  symbol: string,
  market: Market,
  warnings: string[],
  warnedExchanges: Set<string>,
): { symbol: string; currency?: string; listingExchange?: string } {
  const currency = el.getAttribute("currency")?.toUpperCase() || undefined;
  const listingExchange =
    el.getAttribute("listingExchange") || el.getAttribute("exchange") || undefined;
  if (market !== "STOCK" || !listingExchange) {
    return { symbol, currency, listingExchange };
  }
  const mapped = yahooSymbolFor(symbol, listingExchange);
  if (
    mapped === symbol &&
    isUnknownExchange(listingExchange) &&
    !warnedExchanges.has(listingExchange)
  ) {
    warnedExchanges.add(listingExchange);
    warnings.push(
      `Unknown exchange "${listingExchange}" (${symbol}) — kept the raw symbol; edit the ticker to add a Yahoo suffix if charts don't load.`,
    );
  }
  return { symbol: mapped, currency, listingExchange };
}

function parseTradeElement(
  el: Element,
  warnings: string[],
  warnedExchanges: Set<string>,
): ParsedExecution | null {
  const tradeID = el.getAttribute("tradeID") ?? "";
  if (!tradeID) {
    warnings.push("Trade row missing tradeID — skipped");
    return null;
  }
  const symbol = el.getAttribute("symbol") ?? "";
  if (!symbol) {
    warnings.push(`Trade ${tradeID} missing symbol — skipped`);
    return null;
  }
  const accountId = el.getAttribute("accountId") ?? "";
  const buySellRaw = (el.getAttribute("buySell") ?? "").toUpperCase();
  let action: ExecutionAction;
  if (buySellRaw === "BUY") action = "BUY";
  else if (buySellRaw === "SELL") action = "SELL";
  else {
    // Fall back to signed quantity
    const qSign = parseFloat(el.getAttribute("quantity") ?? "0");
    action = qSign >= 0 ? "BUY" : "SELL";
  }

  const qtyRaw = parseFloat(el.getAttribute("quantity") ?? "0");
  const qty = abs(qtyRaw);
  if (qty === 0) {
    warnings.push(`Trade ${tradeID} has zero quantity — skipped`);
    return null;
  }

  const priceCents = dollarsStringToCents(el.getAttribute("tradePrice"));
  if (priceCents <= 0) {
    warnings.push(`Trade ${tradeID} has invalid tradePrice — skipped`);
    return null;
  }

  const commissionRaw =
    el.getAttribute("ibCommission") ?? el.getAttribute("commission") ?? "0";
  const feeCents = abs(dollarsStringToCents(commissionRaw));

  const dateTimeRaw =
    el.getAttribute("dateTime") ??
    el.getAttribute("tradeDate") ??
    "";
  const at = flexDateTimeToISO(dateTimeRaw);
  if (!at) {
    warnings.push(`Trade ${tradeID} has unparseable date "${dateTimeRaw}" — skipped`);
    return null;
  }

  const assetCategoryRaw = (el.getAttribute("assetCategory") ?? "STK").toUpperCase();
  const market = ASSET_CATEGORY_MAP[assetCategoryRaw] ?? "STOCK";

  const ocRaw = (el.getAttribute("openCloseIndicator") ?? "").toUpperCase();
  const openClose = ocRaw === "O" || ocRaw === "C" ? (ocRaw as "O" | "C") : "";

  const ibOrderID = el.getAttribute("ibOrderID") ?? "";

  const listing = resolveListing(el, symbol, market, warnings, warnedExchanges);

  return {
    tradeID,
    ibOrderID,
    symbol: listing.symbol,
    market,
    accountId,
    action,
    at,
    qty,
    priceCents,
    feeCents,
    openClose,
    currency: listing.currency,
    listingExchange: listing.listingExchange,
  };
}

/** Parse the <OpenPositions> section into current positions. */
function parseOpenPositions(
  doc: Document,
  warnings: string[],
  warnedExchanges: Set<string>,
): ParsedPosition[] {
  const els = Array.from(doc.getElementsByTagName("OpenPosition"));
  const out: ParsedPosition[] = [];
  for (const el of els) {
    const symbol = el.getAttribute("symbol") ?? "";
    if (!symbol) continue;
    const qty = parseFloat(el.getAttribute("position") ?? "0");
    if (!Number.isFinite(qty) || qty === 0) continue;

    // Per-share figures only — the journal model (qty × price) ignores the
    // option contract multiplier, and so does IBKR's costBasisPrice/markPrice.
    // The *Money / positionValue fields fold the multiplier in, so we avoid
    // them here to keep cost basis and mark on the same scale.
    let avgCostCents = dollarsStringToCents(el.getAttribute("costBasisPrice"));
    if (avgCostCents <= 0) {
      avgCostCents = dollarsStringToCents(el.getAttribute("openPrice"));
    }

    const assetCategoryRaw = (el.getAttribute("assetCategory") ?? "STK").toUpperCase();
    const market = ASSET_CATEGORY_MAP[assetCategoryRaw] ?? "STOCK";
    const accountId = el.getAttribute("accountId") ?? "";

    // Last mark price per share/contract (per-share, multiplier excluded).
    const markPriceCents = dollarsStringToCents(el.getAttribute("markPrice"));

    const listing = resolveListing(el, symbol, market, warnings, warnedExchanges);

    out.push({
      symbol: listing.symbol,
      market,
      accountId,
      qty,
      avgCostCents,
      markPriceCents,
      currency: listing.currency,
    });
  }
  if (els.length > 0 && out.length === 0) {
    warnings.push("Open positions section had no usable rows.");
  }
  return out;
}

/**
 * Parse base-currency cash from the <CashReport> section. Prefers the
 * BASE_SUMMARY row (aggregated across currencies); falls back to a single
 * currency row. Returns 0 if the section isn't in the query.
 */
function parseCashCents(doc: Document): number {
  const rows = Array.from(doc.getElementsByTagName("CashReportCurrency"));
  if (rows.length === 0) return 0;
  const pick = (el: Element) =>
    dollarsStringToCents(
      el.getAttribute("endingCash") ?? el.getAttribute("endingSettledCash"),
    );
  const base = rows.find(
    (r) => (r.getAttribute("currency") ?? "").toUpperCase() === "BASE_SUMMARY",
  );
  if (base) return pick(base);
  // Single-currency account: use the sole row.
  return rows.length === 1 ? pick(rows[0]!) : 0;
}

/**
 * Detect each account's base currency. The BASE_SUMMARY cash row's
 * `currency` attr is literally the string "BASE_SUMMARY", so the base
 * must come from other sections, in order of reliability:
 *   1. <AccountInformation currency="…"> (Account Information section)
 *   2. `currency` attr on <EquitySummaryByReportDateInBase> rows
 *   3. a sole non-BASE_SUMMARY <CashReportCurrency> row (single-currency account)
 */
function parseBaseCurrencies(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (el: Element) => {
    const cur = (el.getAttribute("currency") ?? "").toUpperCase();
    if (!cur || cur === "BASE_SUMMARY" || cur.length !== 3) return;
    const accountId = el.getAttribute("accountId") ?? "";
    if (out[accountId] == null) out[accountId] = cur;
  };

  for (const el of Array.from(doc.getElementsByTagName("AccountInformation"))) {
    put(el);
  }
  if (Object.keys(out).length > 0) return out;

  for (const el of Array.from(
    doc.getElementsByTagName("EquitySummaryByReportDateInBase"),
  )) {
    put(el);
  }
  if (Object.keys(out).length > 0) return out;

  const cashRows = Array.from(
    doc.getElementsByTagName("CashReportCurrency"),
  ).filter(
    (r) => (r.getAttribute("currency") ?? "").toUpperCase() !== "BASE_SUMMARY",
  );
  if (cashRows.length === 1) put(cashRows[0]!);
  return out;
}

/**
 * Parse the "Net Asset Value (NAV) in Base" section. One row per report
 * date (per account); `total` is the full EOD NAV — cash + stock + options
 * + accruals — in base currency.
 */
function parseNavHistory(doc: Document, warnings: string[]): ParsedNavPoint[] {
  const els = Array.from(
    doc.getElementsByTagName("EquitySummaryByReportDateInBase"),
  );
  const out: ParsedNavPoint[] = [];
  for (const el of els) {
    // reportDate arrives as "YYYYMMDD" or "YYYY-MM-DD" depending on the
    // query's date-format setting — accept both.
    const raw = el.getAttribute("reportDate") ?? "";
    const m = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
    if (!m) continue;
    const totalRaw = el.getAttribute("total");
    if (!totalRaw) continue;
    const total = parseFloat(totalRaw);
    if (!Number.isFinite(total)) continue;
    out.push({
      accountId: el.getAttribute("accountId") ?? "",
      time: `${m[1]}-${m[2]}-${m[3]}`,
      valueCents: Math.round(total * 100),
    });
  }
  if (els.length > 0 && out.length === 0) {
    warnings.push("NAV section had no usable rows.");
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

/**
 * Group executions into Trade positions.
 *
 * Algorithm (per symbol, in chronological order):
 *   - Maintain a current side + signed quantity
 *   - First execution opens; side is determined by action (BUY → LONG, SELL → SHORT)
 *   - Subsequent execs add/subtract from quantity in the side's reference frame
 *   - When quantity returns to 0, emit the Trade and reset
 *   - Anything left over at the end is an OPEN trade
 */
function groupIntoTrades(execs: ParsedExecution[]): Trade[] {
  const bySymbol = new Map<string, ParsedExecution[]>();
  for (const ex of execs) {
    const arr = bySymbol.get(ex.symbol) ?? [];
    arr.push(ex);
    bySymbol.set(ex.symbol, arr);
  }

  const out: Trade[] = [];

  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.at.localeCompare(b.at));

    let side: Side | null = null;
    let netQty = 0;
    let bucket: ParsedExecution[] = [];

    const flush = (forceOpen: boolean) => {
      if (bucket.length === 0 || side == null) return;
      out.push(buildTradeFromBucket(symbol, side, bucket, forceOpen));
      bucket = [];
      side = null;
      netQty = 0;
    };

    for (const ex of list) {
      if (side == null) {
        side = ex.action === "BUY" ? "LONG" : "SHORT";
        netQty = ex.qty;
        bucket = [ex];
        continue;
      }

      bucket.push(ex);
      const isOpeningSide =
        (side === "LONG" && ex.action === "BUY") ||
        (side === "SHORT" && ex.action === "SELL");
      netQty += isOpeningSide ? ex.qty : -ex.qty;

      if (netQty <= 0) {
        // Position closed (or reversed — for PoC we don't model reversals;
        // any excess goes into the next bucket as a fresh trade).
        const closedBucket = bucket;
        bucket = [];
        const closedSide = side;
        side = null;
        netQty = 0;
        out.push(buildTradeFromBucket(symbol, closedSide, closedBucket, false));
      }
    }

    if (bucket.length > 0) {
      flush(true);
    }
  }

  return out;
}

/**
 * Merge IBKR slot fills (multiple executions sharing one ibOrderID — e.g.
 * a 200-share order that filled as 27 + 100 + 73 chunks) into a single
 * execution. Qty and fees sum; price is volume-weighted; the earliest
 * timestamp wins. Executions without an ibOrderID pass through individually.
 *
 * Doing this at parse time keeps the data model clean — every downstream
 * surface (table, chart markers, modal exec list) sees the consolidated
 * view automatically.
 */
function coalesceByOrderId(bucket: ParsedExecution[]): TradeExecution[] {
  const groups = new Map<string, ParsedExecution[]>();
  const standalone: ParsedExecution[] = [];
  for (const ex of bucket) {
    if (ex.ibOrderID) {
      const arr = groups.get(ex.ibOrderID) ?? [];
      arr.push(ex);
      groups.set(ex.ibOrderID, arr);
    } else {
      standalone.push(ex);
    }
  }

  const out: TradeExecution[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(toTradeExecution(group[0]!));
      continue;
    }
    const sorted = [...group].sort((a, b) => a.at.localeCompare(b.at));
    const totalQty = group.reduce((s, e) => s + e.qty, 0);
    const totalFee = group.reduce((s, e) => s + e.feeCents, 0);
    const totalNotional = group.reduce((s, e) => s + e.qty * e.priceCents, 0);
    const avgPriceCents = totalQty > 0 ? Math.round(totalNotional / totalQty) : sorted[0]!.priceCents;
    out.push({
      id: `ibkr-${sorted[0]!.tradeID}`,
      action: sorted[0]!.action,
      at: sorted[0]!.at,
      qty: totalQty,
      priceCents: avgPriceCents,
      feeCents: totalFee,
    });
  }
  for (const ex of standalone) out.push(toTradeExecution(ex));

  out.sort((a, b) => a.at.localeCompare(b.at));
  return mergeSamePriceTime(out);
}

/**
 * Second coalescing pass: collapse executions that share the same action,
 * price, and minute into one line — partial fills that IBKR reports as
 * separate rows with different (or empty) order ids. Qty and fees sum; the
 * earliest timestamp and price are kept.
 */
function mergeSamePriceTime(execs: TradeExecution[]): TradeExecution[] {
  const groups = new Map<string, TradeExecution[]>();
  for (const ex of execs) {
    // YYYY-MM-DDTHH:MM — minute granularity (what the UI shows).
    const minute = ex.at.slice(0, 16);
    const key = `${ex.action}|${ex.priceCents}|${minute}`;
    const arr = groups.get(key) ?? [];
    arr.push(ex);
    groups.set(key, arr);
  }
  const out: TradeExecution[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const sorted = [...group].sort((a, b) => a.at.localeCompare(b.at));
    out.push({
      id: sorted[0]!.id,
      action: sorted[0]!.action,
      at: sorted[0]!.at,
      qty: group.reduce((s, e) => s + e.qty, 0),
      priceCents: sorted[0]!.priceCents,
      feeCents: group.reduce((s, e) => s + e.feeCents, 0),
    });
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

function toTradeExecution(ex: ParsedExecution): TradeExecution {
  return {
    id: `ibkr-${ex.tradeID}`,
    action: ex.action,
    at: ex.at,
    qty: ex.qty,
    priceCents: ex.priceCents,
    feeCents: ex.feeCents,
  };
}

function buildTradeFromBucket(
  symbol: string,
  side: Side,
  bucket: ParsedExecution[],
  forceOpen: boolean,
): Trade {
  const market = bucket[0]!.market;
  const accountId = bucket[0]!.accountId;
  const executions: TradeExecution[] = coalesceByOrderId(bucket);

  // We use IBKR's tradeIDs to make a stable Trade id — first exec's tradeID
  // suffices since it identifies the position's open.
  const id = `ibkr-trade-${bucket[0]!.tradeID}`;

  const trade: Trade = {
    id,
    // Raw IBKR account id as a fallback; the store re-stamps this with the
    // linked Picofolio Account.id when importing via a connection.
    accountId: accountId || "",
    symbol,
    market,
    side,
    executions,
    tags: [],
    source: "ibkr",
    currency: bucket[0]!.currency,
  };

  // If forceOpen, the user may have closed it manually elsewhere — leave it
  // as-is; deriveTotals will see uneven qty and report OPEN naturally.
  void forceOpen;

  return trade;
}

export function parseFlexXml(xml: string): FlexParseResult {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  // Surface XML parse errors clearly.
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error(`XML parse error: ${parserError.textContent ?? "unknown"}`);
  }

  // Some IBKR responses use a top-level <FlexQueryResponse>, some return an
  // error envelope. Check for the error case first.
  const statusEl = doc.querySelector("Status");
  if (statusEl && statusEl.textContent?.toLowerCase() === "fail") {
    const errCode = doc.querySelector("ErrorCode")?.textContent ?? "?";
    const errMsg = doc.querySelector("ErrorMessage")?.textContent ?? "Unknown";
    throw new Error(`IBKR Flex error ${errCode}: ${errMsg}`);
  }

  const warnedExchanges = new Set<string>();
  const positions = parseOpenPositions(doc, warnings, warnedExchanges);
  const cashCents = parseCashCents(doc);
  const nav = parseNavHistory(doc, warnings);
  const baseCurrencyByAccount = parseBaseCurrencies(doc);

  const tradeEls = Array.from(doc.getElementsByTagName("Trade"));
  const executions: ParsedExecution[] = [];
  const accountIds = new Set<string>();
  for (const el of tradeEls) {
    const parsed = parseTradeElement(el, warnings, warnedExchanges);
    if (parsed) {
      executions.push(parsed);
      if (parsed.accountId) accountIds.add(parsed.accountId);
    }
  }
  for (const p of positions) if (p.accountId) accountIds.add(p.accountId);
  for (const n of nav) if (n.accountId) accountIds.add(n.accountId);

  if (tradeEls.length === 0 && positions.length === 0) {
    warnings.push("No <Trade> or <OpenPosition> rows found in XML — nothing to import.");
  }

  const trades = groupIntoTrades(executions);

  return {
    trades,
    executions,
    positions,
    cashCents,
    nav,
    warnings,
    accountIds: Array.from(accountIds),
    baseCurrencyByAccount,
  };
}
