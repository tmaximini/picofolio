import { ArrowDownRight, ArrowUpRight, MessageSquareText, MoreHorizontal, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ColumnDef } from "@tanstack/react-table";
import type { Market, Trade } from "@/lib/trades";
import { formatMoney, formatPct, toneOf } from "@/lib/money";
import {
  deriveTotals,
  formatHold,
  tradeDateKey,
  tradeOpenedKey,
} from "@/lib/tradeMath";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import { useLatestPrice, useLoadPrice } from "@/store/selectors";
import { SortableTable } from "./SortableTable";

type TradeTableProps = {
  trades: Trade[];
  onRowClick?: (id: string) => void;
  /** When provided, render an Account column (id → name). For the
   *  consolidated "All Accounts" view. */
  accountNameById?: Map<string, string>;
};

// OPTION gets a per-trade badge (CALL / PUT) computed in the row from the
// parsed OCC symbol — see SymbolCell. Other derivatives use a fixed label.
const MARKET_BADGE: Partial<Record<Market, string>> = {
  FUTURE: "FUT",
  CRYPTO: "CRYPTO",
  FOREX: "FX",
};

export function TradeTable({ trades, onRowClick, accountNameById }: TradeTableProps) {
  const showAccount = accountNameById != null;

  // Headless columns — header row + sorting only; rows render via TradeRow so
  // every bespoke cell (option badge, status pill, live return) is preserved.
  const columns = useMemo<ColumnDef<Trade>[]>(() => {
    const rNum = { meta: { align: "right" as const }, sortUndefined: "last" as const };
    const num = { meta: { align: "right" as const }, enableSorting: false };
    const cols: ColumnDef<Trade>[] = [
      { id: "date", header: "Date", accessorFn: (t) => tradeOpenedKey(t) || tradeDateKey(t) },
      { id: "symbol", header: "Symbol", accessorFn: (t) => t.symbol },
    ];
    if (showAccount) {
      cols.push({
        id: "account",
        header: "Account",
        accessorFn: (t) => accountNameById!.get(t.accountId) ?? "",
      });
    }
    cols.push(
      { id: "status", header: "Status", enableSorting: false },
      { id: "side", header: "Side", enableSorting: false },
      { id: "qty", header: "Qty", accessorFn: (t) => t.executions.reduce((s, e) => s + e.qty, 0), ...rNum },
      { id: "entry", header: "Entry", ...num },
      { id: "exit", header: "Exit", ...num },
      { id: "entryTotal", header: "Entry $", ...num },
      { id: "exitTotal", header: "Exit $", ...num },
      { id: "hold", header: "Hold", ...num },
      { id: "return", header: "Return", accessorFn: (t) => deriveTotals(t).returnCents, ...rNum },
      { id: "returnPct", header: "Return %", ...num },
      { id: "actions", header: "", enableSorting: false },
    );
    return cols;
  }, [showAccount, accountNameById]);

  if (trades.length === 0) {
    return (
      <div style={{ padding: "var(--space-10)", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
        No trades in this range.
      </div>
    );
  }

  return (
    <SortableTable
      className="tradeTable"
      minWidth={1040}
      data={trades}
      columns={columns}
      getRowId={(t) => t.id}
      initialSorting={[{ id: "date", desc: true }]}
      renderRow={(t) => (
        <TradeRow
          trade={t}
          onClick={onRowClick}
          accountName={showAccount ? accountNameById!.get(t.accountId) ?? "—" : undefined}
        />
      )}
    />
  );
}

function TradeRow({
  trade,
  onClick,
  accountName,
}: {
  trade: Trade;
  onClick?: (id: string) => void;
  accountName?: string;
}) {
  const tot = deriveTotals(trade);
  const date = tradeOpenedKey(trade) || tradeDateKey(trade);
  const dateDisplay = date
    ? new Date(date).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
    : "—";

  const qty = trade.executions
    .filter((e) => (trade.side === "LONG" ? e.action === "BUY" : e.action === "SELL"))
    .reduce((s, e) => s + e.qty, 0);

  // ---- Unrealized P/L for OPEN stock trades ----
  // Options/futures/forex don't have a Yahoo price source, so we leave those
  // rows' Return dashed. Open positions never show an Exit (they haven't
  // exited) — the live price feeds the unrealized Return column only.
  const isOpenStock = tot.status === "OPEN" && trade.market === "STOCK";
  const loadPrice = useLoadPrice();
  const latest = useLatestPrice(trade.symbol);

  useEffect(() => {
    if (isOpenStock) loadPrice(trade.symbol);
  }, [isOpenStock, trade.symbol, loadPrice]);

  const livePriceCents = latest != null ? Math.round(latest * 100) : null;
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
  const currency = trade.currency ?? "USD";

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
      <td className="mono tradeTable__muted" data-col="date">{dateDisplay}</td>
      <td data-col="symbol">
        <SymbolCell trade={trade} marketBadge={marketBadge} />
      </td>
      {accountName !== undefined && (
        <td className="tradeTable__muted" data-col="account">{accountName}</td>
      )}
      <td data-col="status">
        <span className="tradeTable__statusCell">
          <span className={statusClass}>{tot.status}</span>
          {trade.notes?.trim() && <NoteHover note={trade.notes.trim()} />}
        </span>
      </td>
      <td data-col="side">
        <span className={sideArrowClass} title={trade.side}>
          {trade.side === "LONG"
            ? <ArrowUpRight size={14} strokeWidth={2} />
            : <ArrowDownRight size={14} strokeWidth={2} />}
        </span>
      </td>
      <td className="num tradeTable__muted" data-col="qty">{qty.toLocaleString("en-US")}</td>
      <td className="num tradeTable__muted" data-col="entry">
        {tot.avgEntryCents != null ? formatMoney(tot.avgEntryCents, currency) : <Dash />}
      </td>
      <td className="num tradeTable__muted" data-col="exit">
        {tot.avgExitCents != null ? formatMoney(tot.avgExitCents, currency) : <Dash />}
      </td>
      <td className="num tradeTable__muted" data-col="entryTotal">{formatMoney(tot.entryTotalCents, currency)}</td>
      <td className="num tradeTable__muted" data-col="exitTotal">
        {tot.exitTotalCents > 0 ? formatMoney(tot.exitTotalCents, currency) : <Dash />}
      </td>
      <td className="num tradeTable__muted" data-col="hold">
        {(() => {
          // Open positions show a live hold (now − open); closed use holdMs.
          const holdMs =
            tot.status === "OPEN" && tot.openedAt != null
              ? Date.now() - new Date(tot.openedAt).getTime()
              : tot.holdMs;
          return (
            <span className={holdMs != null ? "" : "tradeTable__dash"}>
              {formatHold(holdMs)}
            </span>
          );
        })()}
      </td>
      <td className={returnColorClass} data-col="return">
        {returnCents != null ? (
          tot.status === "OPEN" ? (
            <PreviewValue>{formatMoney(returnCents, currency)}</PreviewValue>
          ) : (
            formatMoney(returnCents, currency)
          )
        ) : tot.status === "OPEN" ? (
          <OpenTag />
        ) : (
          <Dash />
        )}
      </td>
      <td className={returnColorClass} data-col="returnPct">
        {returnPct != null ? (
          tot.status === "OPEN" ? (
            <PreviewValue>{formatPct(returnPct)}</PreviewValue>
          ) : (
            formatPct(returnPct)
          )
        ) : tot.status === "OPEN" ? (
          <OpenTag />
        ) : (
          <Dash />
        )}
      </td>
      <td data-col="actions">
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

function Dash() {
  return <span className="tradeTable__dash">—</span>;
}

/** Open position with no live price yet — reads as "in progress", not broken. */
function OpenTag() {
  return <span className="tradeTable__live">live</span>;
}

/** Live unrealized P/L on an OPEN row — tone hue is kept (glanceable
 *  direction) but muted with an ≈ prefix so it never reads as booked. */
function PreviewValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="tradeTable__returnPreview" title="Unrealized — position open">
      {children}
    </span>
  );
}

/**
 * A note marker that reveals the trade's note in a popover on hover. The
 * popover is portaled to <body> and positioned from the icon's rect so the
 * table's horizontal scroll (overflow) can't clip it.
 */
function NoteHover({ note }: { note: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className="tradeTable__noteIcon"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={(e) => e.stopPropagation()}
      tabIndex={0}
      role="note"
      aria-label="Trade note"
    >
      <MessageSquareText size={13} strokeWidth={1.75} />
      {pos &&
        createPortal(
          <div className="notePopover" style={{ left: pos.x, top: pos.y }}>
            {note}
          </div>,
          document.body,
        )}
    </span>
  );
}
