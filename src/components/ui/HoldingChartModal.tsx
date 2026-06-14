import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import type { Holding } from "@/lib/mock";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { parseOccSymbol, formatOptionLabel } from "@/lib/optionSymbol";
import { tradingViewChartUrl, tradingViewEmbedUrl } from "@/lib/tradingview";
import { useHoldingDelta, useUnrealizedCents } from "@/store/selectors";

type HoldingChartModalProps = {
  holding: Holding;
  onClose: () => void;
};

/** Full-screen TradingView chart for a holding — opened from the inline
 *  position detail. Options deep-link to the underlying ticker (TradingView
 *  has no per-contract charts). */
export function HoldingChartModal({ holding, onClose }: HoldingChartModalProps) {
  const opt = parseOccSymbol(holding.symbol);
  const sym = opt ? opt.underlying : holding.symbol.split(" ")[0]!;

  const unrealizedCents = useUnrealizedCents(holding.symbol);
  const dayPct = useHoldingDelta(holding.symbol, "1D");

  const url = tradingViewEmbedUrl(sym, { interval: "D" });

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="modal modal--tradeView"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__head">
          <div className="modal__title">{sym}</div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="modal__body">
          <div className="tradeView__head">
            <div className="tradeView__symGroup">
              <span className="tradeView__sym">{sym}</span>
              <span className="tradeView__name">
                {opt ? formatOptionLabel(opt) : holding.name}
              </span>
            </div>
            <div className="tradeView__pills">
              {unrealizedCents != null && (
                <span
                  className={`tradeView__return tradeView__return--${toneOf(unrealizedCents)}`}
                >
                  {unrealizedCents >= 0 ? "+" : "−"}
                  {formatCents(Math.abs(unrealizedCents))}
                </span>
              )}
              {dayPct != null && (
                <span className="tradeView__pill">{formatPct(dayPct)}</span>
              )}
            </div>
          </div>

          <div className="chartToolbar">
            <div />
            <a
              className="chartToolbar__btn"
              href={tradingViewChartUrl(sym)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${sym} on TradingView`}
            >
              <span>Open in TradingView</span>
              <ExternalLink size={11} strokeWidth={1.75} />
            </a>
          </div>

          <div
            className="tvEmbed"
            style={{
              height: "clamp(420px, 62vh, 820px)",
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
