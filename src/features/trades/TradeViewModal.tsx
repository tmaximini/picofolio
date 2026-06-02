import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Pencil, X } from "lucide-react";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { contractMultiplier, formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import { coalesceExecutions, deriveTotals, formatHold } from "@/lib/tradeMath";
import {
  tradingViewChartUrl,
  tradingViewEmbedUrl,
  tradingViewSymbolFor,
} from "@/lib/tradingview";
import {
  useDeleteTrade,
  useLatestPrice,
  useLoadPrice,
  useTrade,
  useUpdateTrade,
} from "@/store/selectors";
import { TradeForm } from "./TradeForm";
import { TradeChart } from "./TradeChart";

type TradeViewModalProps = {
  tradeId: string;
  onClose: () => void;
};

export function TradeViewModal({ tradeId, onClose }: TradeViewModalProps) {
  const trade = useTrade(tradeId);
  const updateTrade = useUpdateTrade();
  const deleteTrade = useDeleteTrade();
  const [isEditing, setIsEditing] = useState(false);
  const [tab, setTab] = useState<"general" | "journal">("general");
  const [tvEmbedded, setTvEmbedded] = useState(false);
  const latest = useLatestPrice(trade?.symbol ?? "");
  const loadPrice = useLoadPrice();

  const tot = trade ? deriveTotals(trade) : null;
  // Live P/L for OPEN stock positions needs a current price — make sure it's
  // fetched (options have no Yahoo source; they read "live" without a number).
  const isOpenStock = trade != null && trade.market === "STOCK" && tot?.status === "OPEN";
  useEffect(() => {
    if (isOpenStock && trade) loadPrice(trade.symbol);
  }, [isOpenStock, trade, loadPrice]);

  if (!trade || !tot) return null;

  if (isEditing) {
    return createPortal(
      <div className="modalBackdrop" onClick={onClose}>
        <div className="modal modal--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="modal__head">
            <div className="modal__title">Edit Trade</div>
            <button className="modal__close" onClick={onClose} aria-label="Close">
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
          <TradeForm
            trade={trade}
            tab={tab}
            onTabChange={setTab}
            submitLabel="Save"
            onDelete={() => {
              deleteTrade(trade.id);
              onClose();
            }}
            onSubmit={(data) => {
              updateTrade(trade.id, {
                market: data.market,
                symbol: data.symbol,
                side: data.side,
                targetCents: data.targetCents,
                stopCents: data.stopCents,
                executions: data.executions,
                notes: data.notes,
                tags: data.tags,
                confidence: data.confidence,
              });
              onClose();
            }}
          />
        </div>
      </div>,
      document.body,
    );
  }

  const sidePillClass =
    trade.side === "LONG"
      ? "tradeView__pill tradeView__pill--side--long-active"
      : "tradeView__pill tradeView__pill--side--short";

  const opt = trade.market === "OPTION" ? parseOccSymbol(trade.symbol) : null;

  // Headline P/L: live unrealized for an OPEN stock position (current price vs
  // entry × qty × multiplier), realized for a closed trade.
  const mult = contractMultiplier(trade.symbol);
  const livePriceCents = latest != null ? Math.round(latest * 100) : null;
  const liveUnrealCents =
    isOpenStock && livePriceCents != null && tot.avgEntryCents != null
      ? (trade.side === "LONG" ? 1 : -1) *
        (livePriceCents - tot.avgEntryCents) *
        tot.positionQty *
        mult
      : null;
  const liveUnrealPct =
    liveUnrealCents != null && tot.avgEntryCents != null && tot.avgEntryCents > 0
      ? liveUnrealCents / (tot.avgEntryCents * tot.positionQty * mult)
      : null;

  const headlineCents =
    tot.status === "OPEN" ? liveUnrealCents : tot.returnCents !== 0 ? tot.returnCents : null;
  const headlinePct = tot.status === "OPEN" ? liveUnrealPct : tot.returnPct;
  const headlineTone = headlineCents == null ? null : toneOf(headlineCents);

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__head">
          <div className="modal__title">Trade View</div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="modal__body">
          <div className="tradeView__head">
            <div className="tradeView__symGroup">
              <TradeHeaderSymbol trade={trade} />
              {headlineCents != null && (
                <span className={`tradeView__return tradeView__return--${headlineTone ?? "neutral"}`}>
                  {formatCents(headlineCents)}
                  {headlinePct != null && (
                    <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                      {formatPct(headlinePct)}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="tradeView__pills">
              {tot.status === "OPEN" && (
                <span className="tradeView__pill tradeView__pill--open">
                  <span
                    className="livePulse"
                    style={
                      {
                        "--pulse-color": headlineTone
                          ? `var(--${headlineTone})`
                          : "var(--text-secondary)",
                      } as React.CSSProperties
                    }
                  />
                  OPEN
                </span>
              )}
              {opt && (
                <span
                  className={`tradeTable__marketBadge tradeTable__marketBadge--${
                    opt.type === "CALL" ? "call" : "put"
                  }`}
                >
                  {opt.type}
                </span>
              )}
              <span className="tradeView__pill">{trade.market}</span>
              <span className={sidePillClass}>{trade.side}</span>
            </div>
          </div>

          <ChartToolbar
            trade={trade}
            tvEmbedded={tvEmbedded}
            onToggleEmbed={() => setTvEmbedded((v) => !v)}
          />
          {tvEmbedded ? (
            <TradingViewEmbed trade={trade} />
          ) : (
            <TradeChart trade={trade} />
          )}
          <ExecutionList trade={trade} />

          {(trade.notes || trade.confidence != null) && (
            <div className="tradeView__notesBox">
              <span className="tradeView__notesLabel">Notes</span>
              <span className="tradeView__notesText">
                {trade.notes ?? <em style={{ color: "var(--text-tertiary)" }}>No notes</em>}
              </span>
              {trade.confidence != null && (
                <span className="tradeView__confidence">
                  Confidence: {trade.confidence}
                </span>
              )}
            </div>
          )}

          <div className="tradeView__chipRow">
            {trade.targetCents != null && (
              <span className="tradeView__chip">
                Target: {formatCents(trade.targetCents)}
              </span>
            )}
            {trade.stopCents != null && (
              <span className="tradeView__chip">
                Stop: {formatCents(trade.stopCents)}
              </span>
            )}
            {tot.rMultiple != null && (
              <span className="tradeView__chip">
                R-Multiple: {tot.rMultiple.toFixed(2)}R
              </span>
            )}
            {trade.tags.map((t) => (
              <span key={t} className="tradeView__chip" style={{ fontFamily: "var(--font-ui)" }}>
                #{t}
              </span>
            ))}
          </div>
        </div>

        <div className="modal__foot">
          <span />
          <button
            type="button"
            className="btn"
            onClick={() => setIsEditing(true)}
          >
            <Pencil size={13} strokeWidth={1.75} />
            <span>Edit</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ChartToolbar({
  trade,
  tvEmbedded,
  onToggleEmbed,
}: {
  trade: import("@/lib/trades").Trade;
  tvEmbedded: boolean;
  onToggleEmbed: () => void;
}) {
  const tvSymbol = tradingViewSymbolFor(trade);
  return (
    <div className="chartToolbar">
      <div className="chartSource" role="tablist" aria-label="Chart source">
        <button
          type="button"
          role="tab"
          aria-selected={!tvEmbedded}
          className={
            tvEmbedded ? "chartSource__seg" : "chartSource__seg chartSource__seg--active"
          }
          onClick={() => {
            if (tvEmbedded) onToggleEmbed();
          }}
        >
          Picofolio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tvEmbedded}
          className={
            tvEmbedded ? "chartSource__seg chartSource__seg--active" : "chartSource__seg"
          }
          onClick={() => {
            if (!tvEmbedded) onToggleEmbed();
          }}
        >
          TradingView
        </button>
      </div>
      <a
        className="chartToolbar__btn"
        href={tradingViewChartUrl(tvSymbol)}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${tvSymbol} on TradingView`}
      >
        <span>Open in TradingView</span>
        <ExternalLink size={11} strokeWidth={1.75} />
      </a>
    </div>
  );
}

function TradingViewEmbed({ trade }: { trade: import("@/lib/trades").Trade }) {
  const sym = tradingViewSymbolFor(trade);
  // 60m for short trades, daily for long. Matches the spirit of our own
  // interval picker so the embed defaults feel similar.
  const interval = "D";
  const url = tradingViewEmbedUrl(sym, { interval });
  return (
    <div
      className="tvEmbed"
      style={{
        height: 380,
        background: "var(--surface-base)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <iframe
        title={`TradingView ${sym}`}
        src={url}
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        allowFullScreen
      />
    </div>
  );
}

function TradeHeaderSymbol({ trade }: { trade: import("@/lib/trades").Trade }) {
  const opt = trade.market === "OPTION" ? parseOccSymbol(trade.symbol) : null;
  if (!opt) {
    return <span className="tradeView__sym">{trade.symbol}</span>;
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span className="tradeView__sym">{opt.underlying}</span>
      <span
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--text-xs)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatOptionLabel(opt)}
      </span>
    </span>
  );
}

function ExecutionList({ trade }: { trade: import("@/lib/trades").Trade }) {
  // Coalesce IBKR slot fills (same time + price + action) into single rows.
  const execs = coalesceExecutions(trade.executions);
  if (execs.length === 0) return null;

  const tot = deriveTotals(trade);
  const isOpen = tot.status === "OPEN";
  // Hold spans open → close (closed) or open → now (open).
  const holdMs =
    isOpen && tot.openedAt != null
      ? Date.now() - new Date(tot.openedAt).getTime()
      : tot.holdMs;

  // Drop the hold marker before the first closing execution (so it sits
  // between the buy and the sell); for an open trade there's no close, so it
  // goes after the last row (under the buy).
  const openingAction = trade.side === "LONG" ? "BUY" : "SELL";
  const closeIdx = execs.findIndex((e) => e.action !== openingAction);
  const insertAt = closeIdx === -1 ? execs.length : closeIdx;

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="execList">
      {execs.map((ex, i) => {
        const dotClass =
          ex.action === "BUY" ? "execList__dot--buy" : "execList__dot--sell";
        return (
          <Fragment key={ex.id}>
            {i === insertAt && holdMs != null && (
              <HoldMarker ms={holdMs} open={isOpen} />
            )}
            <div className="execList__row">
              <span className={`execList__dot ${dotClass}`}>{ex.action[0]}</span>
              <span className="execList__time">{fmtTime(ex.at)}</span>
              <span className="execList__action">{ex.action}</span>
              <span className="execList__qty num">{ex.qty.toLocaleString("en-US")}</span>
              <span className="execList__at">@</span>
              <span className="execList__price num">{formatCents(ex.priceCents)}</span>
              <span className="execList__total num">
                = {formatCents(ex.qty * ex.priceCents)}
              </span>
            </div>
          </Fragment>
        );
      })}
      {insertAt === execs.length && holdMs != null && (
        <HoldMarker ms={holdMs} open={isOpen} />
      )}
    </div>
  );
}

/** Thin connector between the entry and exit (or below the entry for open
 *  positions) showing how long the position was / has been held. */
function HoldMarker({ ms, open }: { ms: number; open: boolean }) {
  return (
    <div className="execHold">
      <span className="execHold__line" />
      <span className="execHold__label">
        {open ? "open" : "held"} {formatHold(ms)}
      </span>
      <span className="execHold__line" />
    </div>
  );
}
