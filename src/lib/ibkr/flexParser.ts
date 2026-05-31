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
};

export type FlexParseResult = {
  trades: Trade[];
  /** Underlying executions in document order — useful for debugging or future re-grouping. */
  executions: ParsedExecution[];
  warnings: string[];
  accountIds: string[];
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

function parseTradeElement(el: Element, warnings: string[]): ParsedExecution | null {
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

  return {
    tradeID,
    ibOrderID,
    symbol,
    market,
    accountId,
    action,
    at,
    qty,
    priceCents,
    feeCents,
    openClose,
  };
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
    account: accountId || "Trading",
    symbol,
    market,
    side,
    executions,
    tags: [],
    source: "ibkr",
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

  const tradeEls = Array.from(doc.getElementsByTagName("Trade"));
  if (tradeEls.length === 0) {
    warnings.push("No <Trade> rows found in XML — nothing to import.");
    return { trades: [], executions: [], warnings, accountIds: [] };
  }

  const executions: ParsedExecution[] = [];
  const accountIds = new Set<string>();
  for (const el of tradeEls) {
    const parsed = parseTradeElement(el, warnings);
    if (parsed) {
      executions.push(parsed);
      if (parsed.accountId) accountIds.add(parsed.accountId);
    }
  }

  const trades = groupIntoTrades(executions);

  return {
    trades,
    executions,
    warnings,
    accountIds: Array.from(accountIds),
  };
}
