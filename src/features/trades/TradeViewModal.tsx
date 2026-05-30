import { useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { formatCents, formatPct } from "@/lib/money";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import { coalesceExecutions, deriveTotals, formatHold } from "@/lib/tradeMath";
import { useDeleteTrade, useTrade, useUpdateTrade } from "@/store/selectors";
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

  if (!trade) return null;

  const tot = deriveTotals(trade);

  if (isEditing) {
    return createPortal(
      <div className="modalBackdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
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

  const tone =
    tot.status === "WIN" ? "gain" : tot.status === "LOSS" ? "loss" : null;

  const sidePillClass =
    trade.side === "LONG"
      ? "tradeView__pill tradeView__pill--side--long-active"
      : "tradeView__pill tradeView__pill--side--short";

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
              {tot.returnCents !== 0 && tot.status !== "OPEN" && (
                <span className={`tradeView__return tradeView__return--${tone ?? "gain"}`}>
                  {formatCents(tot.returnCents)}
                  {tot.returnPct != null && (
                    <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                      {formatPct(tot.returnPct)}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="tradeView__pills">
              <span className="tradeView__pill">{trade.market}</span>
              <span className="tradeView__pill">{formatHold(tot.holdMs)}</span>
              <span className={sidePillClass}>{trade.side}</span>
            </div>
          </div>

          <TradeChart trade={trade} />
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
      {execs.map((ex) => {
        const dotClass =
          ex.action === "BUY" ? "execList__dot--buy" : "execList__dot--sell";
        return (
          <div className="execList__row" key={ex.id}>
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
        );
      })}
    </div>
  );
}
