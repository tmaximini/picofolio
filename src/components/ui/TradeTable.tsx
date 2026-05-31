import { ArrowDownRight, ArrowUpRight, MoreHorizontal, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Market, Trade } from "@/lib/trades";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  deriveTotals,
  formatHold,
  tradeDateKey,
  tradeOpenedKey,
} from "@/lib/tradeMath";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import { useLatestPrice, useLoadPrice } from "@/store/selectors";

type SortKey = "date" | "symbol" | "return" | "qty";
type SortDir = "asc" | "desc";

type TradeTableProps = {
  trades: Trade[];
  onRowClick?: (id: string) => void;
};

// OPTION gets a per-trade badge (CALL / PUT) computed in the row from the
// parsed OCC symbol — see SymbolCell. Other derivatives use a fixed label.
const MARKET_BADGE: Partial<Record<Market, string>> = {
  FUTURE: "FUT",
  CRYPTO: "CRYPTO",
  FOREX: "FX",
};

export function TradeTable({ trades, onRowClick }: TradeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const out = [...trades];
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const ta = deriveTotals(a);
      const tb = deriveTotals(b);
      switch (sortKey) {
        case "date":
          return tradeOpenedKey(a).localeCompare(tradeOpenedKey(b)) * dir;
        case "symbol":
          return a.symbol.localeCompare(b.symbol) * dir;
        case "return":
          return (ta.returnCents - tb.returnCents) * dir;
        case "qty": {
          const aq = a.executions.reduce((s, e) => s + e.qty, 0);
          const bq = b.executions.reduce((s, e) => s + e.qty, 0);
          return (aq - bq) * dir;
        }
      }
    });
    return out;
  }, [trades, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };

  if (trades.length === 0) {
    return (
      <div style={{ padding: "var(--space-10)", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
        No trades in this range.
      </div>
    );
  }

  return (
    <table className="table tradeTable">
      <thead>
        <tr>
          <th
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => toggleSort("date")}
          >
            Date{sortKey === "date" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </th>
          <th
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => toggleSort("symbol")}
          >
            Symbol{sortKey === "symbol" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </th>
          <th>Status</th>
          <th>Side</th>
          <th
            className="num"
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => toggleSort("qty")}
          >
            Qty{sortKey === "qty" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </th>
          <th className="num">Entry</th>
          <th className="num">Exit</th>
          <th className="num" title="Entry total — qty × avg entry price">Entry $</th>
          <th className="num" title="Exit total — qty × avg exit price (or current price for open positions)">Exit $</th>
          <th className="num">Hold</th>
          <th
            className="num"
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => toggleSort("return")}
          >
            Return{sortKey === "return" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </th>
          <th className="num">Return %</th>
          <th style={{ width: 44 }} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => (
          <TradeRow key={t.id} trade={t} onClick={onRowClick} />
        ))}
      </tbody>
    </table>
  );
}

function TradeRow({ trade, onClick }: { trade: Trade; onClick?: (id: string) => void }) {
  const tot = deriveTotals(trade);
  const date = tradeOpenedKey(trade) || tradeDateKey(trade);
  const dateDisplay = date
    ? new Date(date).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
    : "—";

  const qty = trade.executions
    .filter((e) => (trade.side === "LONG" ? e.action === "BUY" : e.action === "SELL"))
    .reduce((s, e) => s + e.qty, 0);

  // ---- Unrealized P/L for OPEN stock trades ----
  // Options/futures/forex don't have a Yahoo price source, so we leave
  // those rows dashed. Stock open positions: fetch latest price and
  // surface current price + unrealized return in the otherwise-empty
  // Exit / Ext Tot / Return columns.
  const isOpenStock = tot.status === "OPEN" && trade.market === "STOCK";
  const loadPrice = useLoadPrice();
  const latest = useLatestPrice(trade.symbol);

  useEffect(() => {
    if (isOpenStock) loadPrice(trade.symbol);
  }, [isOpenStock, trade.symbol, loadPrice]);

  const livePriceCents = latest != null ? Math.round(latest * 100) : null;
  const liveValueCents =
    isOpenStock && livePriceCents != null && tot.avgEntryCents != null
      ? livePriceCents * tot.positionQty
      : null;
  const sideSign = trade.side === "LONG" ? 1 : -1;
  const unrealCents =
    isOpenStock && livePriceCents != null && tot.avgEntryCents != null
      ? sideSign * (livePriceCents - tot.avgEntryCents) * tot.positionQty
      : null;
  const unrealPct =
    unrealCents != null && tot.avgEntryCents != null && tot.avgEntryCents > 0
      ? unrealCents / (tot.avgEntryCents * tot.positionQty)
      : null;

  const statusClass = `tradeTable__status tradeTable__status--${tot.status.toLowerCase()}`;
  const sideArrowClass = `tradeTable__sideArrow--${trade.side.toLowerCase()}`;

  // Realized return color for closed trades; unrealized color for open stocks.
  const returnCents = tot.status === "OPEN" ? unrealCents : tot.returnCents;
  const returnPct = tot.status === "OPEN" ? unrealPct : tot.returnPct;
  const returnTone = returnCents != null ? toneOf(returnCents) : "neutral";
  const returnColorClass =
    returnTone === "gain"
      ? "num tradeTable__return--gain"
      : returnTone === "loss"
        ? "num tradeTable__return--loss"
        : "num";

  const marketBadge = MARKET_BADGE[trade.market];

  return (
    <tr className="tradeTable__row" onClick={() => onClick?.(trade.id)}>
      <td className="mono tradeTable__muted">{dateDisplay}</td>
      <td>
        <SymbolCell trade={trade} marketBadge={marketBadge} />
      </td>
      <td>
        <span className={statusClass}>{tot.status}</span>
      </td>
      <td>
        <span className={sideArrowClass} title={trade.side}>
          {trade.side === "LONG"
            ? <ArrowUpRight size={14} strokeWidth={2} />
            : <ArrowDownRight size={14} strokeWidth={2} />}
        </span>
      </td>
      <td className="num tradeTable__muted">{qty.toLocaleString("en-US")}</td>
      <td className="num tradeTable__muted">{tot.avgEntryCents != null ? formatCents(tot.avgEntryCents) : <Dash />}</td>
      <td className="num tradeTable__muted">
        {tot.avgExitCents != null
          ? formatCents(tot.avgExitCents)
          : livePriceCents != null
            ? <LiveValue cents={livePriceCents} />
            : <Dash />}
      </td>
      <td className="num tradeTable__muted">{formatCents(tot.entryTotalCents)}</td>
      <td className="num tradeTable__muted">
        {tot.exitTotalCents > 0
          ? formatCents(tot.exitTotalCents)
          : liveValueCents != null
            ? <LiveValue cents={liveValueCents} />
            : <Dash />}
      </td>
      <td className="num tradeTable__muted">
        <span className={tot.holdMs != null ? "" : "tradeTable__dash"}>
          {formatHold(tot.holdMs)}
        </span>
      </td>
      <td className={returnColorClass}>
        {returnCents != null
          ? formatCents(returnCents)
          : tot.status === "OPEN"
            ? <OpenTag />
            : <Dash />}
      </td>
      <td className={returnColorClass}>
        {returnPct != null
          ? formatPct(returnPct)
          : tot.status === "OPEN"
            ? <OpenTag />
            : <Dash />}
      </td>
      <td>
        <span className="tradeTable__rowActions">
          <button
            type="button"
            className="tradeTable__iconBtn"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.(trade.id);
            }}
            title="More"
          >
            <MoreHorizontal size={14} strokeWidth={1.75} />
          </button>
        </span>
      </td>
    </tr>
  );
}

/** Symbol cell — pretty-prints OCC option symbols into underlying + a
 *  human label (e.g. "MSFT" + "May 29, 2026 · $465 Call"); stocks stay
 *  plain. For options, the market badge becomes CALL / PUT (tone-tinted)
 *  so a glance at the row tells you the contract type. */
function SymbolCell({
  trade,
  marketBadge,
}: {
  trade: Trade;
  marketBadge: string | undefined;
}) {
  const opt = trade.market === "OPTION" ? parseOccSymbol(trade.symbol) : null;
  const primary = opt?.underlying ?? trade.symbol;
  // Badge below already says CALL / PUT; drop the trailing word from the
  // secondary text so it doesn't duplicate.
  const secondary = opt ? formatOptionLabel(opt, { includeType: false }) : null;

  // Per-option badge derived from the parsed OCC symbol; falls back to
  // the market-level badge (FUT / CRYPTO / FX) for non-options.
  const badgeLabel = opt ? opt.type : marketBadge;
  const badgeVariant = opt
    ? opt.type === "CALL"
      ? "call"
      : "put"
    : marketBadge
      ? trade.market.toLowerCase()
      : null;

  return (
    <span className="tradeTable__symCell">
      <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          {primary}
          {badgeLabel && badgeVariant && (
            <span className={`tradeTable__marketBadge tradeTable__marketBadge--${badgeVariant}`}>
              {badgeLabel}
            </span>
          )}
          {trade.tags.length > 0 && <Tag size={11} strokeWidth={1.75} />}
        </span>
        {secondary && (
          <span
            style={{
              color: "var(--text-tertiary)",
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {secondary}
          </span>
        )}
      </span>
    </span>
  );
}

/** A live, non-realized value — italic + tertiary color to distinguish
 *  from realized numbers that come straight from the executions. */
function LiveValue({ cents }: { cents: number }) {
  return (
    <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
      {formatCents(cents)}
    </span>
  );
}

function Dash() {
  return <span className="tradeTable__dash">—</span>;
}

/** Open position with no live price yet — reads as "in progress", not broken. */
function OpenTag() {
  return <span className="tradeTable__live">live</span>;
}
