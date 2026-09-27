import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import { formatPct } from "@/lib/money";
import { tradingViewChartUrl, tradingViewEmbedUrl, yahooToTradingView } from "@/lib/tradingview";

type SymbolChartModalProps = {
  symbol: string;
  name?: string;
  dayPct?: number | null;
  onClose: () => void;
};

/** Full TradingView chart for any symbol (watchlist rows have no holding). */
export function SymbolChartModal({ symbol, name, dayPct, onClose }: SymbolChartModalProps) {
  const tv = yahooToTradingView(symbol);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="modal modal--tradeView"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${symbol} chart`}
      >
        <div className="modal__head">
          <div className="modal__title">{symbol}</div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="modal__body">
          <div className="tradeView__head">
            <div className="tradeView__symGroup">
              <span className="tradeView__sym">{symbol}</span>
              {name && <span className="tradeView__name">{name}</span>}
            </div>
            <div className="tradeView__pills">
              {dayPct != null && <span className="tradeView__pill">{formatPct(dayPct)}</span>}
            </div>
          </div>
          <div className="chartToolbar">
            <div />
            <a
              className="chartToolbar__btn"
              href={tradingViewChartUrl(tv)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Open in TradingView</span>
              <ExternalLink size={11} strokeWidth={1.75} />
            </a>
          </div>
          <div className="tvEmbed watchChart">
            <iframe
              title={`TradingView ${symbol}`}
              src={tradingViewEmbedUrl(tv, { interval: "D" })}
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
