import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { PriceChart } from "@/components/ui";
import { formatPct, toneOf } from "@/lib/money";
import {
  tradingViewChartUrl,
  tradingViewEmbedUrl,
} from "@/lib/tradingview";
import {
  useHoldingDelta,
  useLatestPrice,
  useLoadPrice,
  usePricePoints,
  usePriceStatus,
} from "@/store/selectors";

type SymbolPreviewProps = {
  symbol: string;
};

/**
 * Mini ticker dashboard — fires when the symbol field is "locked in"
 * (blur or Enter). Triggers a Yahoo fetch via the store and renders
 * a small price chart + day/week/month delta row. Reuses the same
 * caching that the Overview page uses so a symbol already seen this
 * session loads instantly.
 */
export function SymbolPreview({ symbol }: SymbolPreviewProps) {
  const [tvEmbedded, setTvEmbedded] = useState(false);
  const loadPrice = useLoadPrice();
  const status = usePriceStatus(symbol);
  const points = usePricePoints(symbol);
  const latest = useLatestPrice(symbol);
  const dayDelta = useHoldingDelta(symbol, "1D");
  const weekDelta = useHoldingDelta(symbol, "1W");
  const monthDelta = useHoldingDelta(symbol, "1M");
  const ytdDelta = useHoldingDelta(symbol, "YTD");

  useEffect(() => {
    if (symbol) loadPrice(symbol);
  }, [symbol, loadPrice]);

  // Show the last 6 months for the modal chart — keeps it readable.
  const trimmed = useMemo(() => {
    if (!points) return null;
    return points.slice(-130);
  }, [points]);

  return (
    <div className="symbolPreview">
      <div className="symbolPreview__head">
        <div>
          <div className="symbolPreview__sym">{symbol}</div>
          <div className="symbolPreview__price">
            {latest != null
              ? `$${latest.toFixed(2)}`
              : status === "loading"
                ? "Loading…"
                : status === "error"
                  ? "Unavailable"
                  : "—"}
          </div>
        </div>
        <div className="symbolPreview__deltas">
          <DeltaCell label="Day" value={dayDelta} />
          <DeltaCell label="Week" value={weekDelta} />
          <DeltaCell label="Month" value={monthDelta} />
          <DeltaCell label="YTD" value={ytdDelta} />
        </div>
      </div>
      <div className="symbolPreview__chartHead">
        <div className="chartSource" role="tablist" aria-label="Chart source">
          <button
            type="button"
            role="tab"
            aria-selected={!tvEmbedded}
            className={
              tvEmbedded ? "chartSource__seg" : "chartSource__seg chartSource__seg--active"
            }
            onClick={() => setTvEmbedded(false)}
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
            onClick={() => setTvEmbedded(true)}
          >
            TradingView
          </button>
        </div>
        {tvEmbedded && symbol ? (
          <a
            className="chartToolbar__btn"
            href={tradingViewChartUrl(symbol)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${symbol} on TradingView`}
          >
            <span>Open in TradingView</span>
            <ExternalLink size={11} strokeWidth={1.75} />
          </a>
        ) : null}
      </div>
      <div className="symbolPreview__chart">
        {tvEmbedded && symbol ? (
          <div
            className="tvEmbed"
            style={{
              height: "clamp(360px, 48vh, 560px)",
              background: "var(--surface-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            <iframe
              title={`TradingView ${symbol}`}
              src={tradingViewEmbedUrl(symbol, { interval: "D" })}
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
              allowFullScreen
            />
          </div>
        ) : trimmed && trimmed.length > 0 ? (
          <PriceChart data={trimmed} height={120} />
        ) : (
          <div className="priceChart priceChart--fallback" style={{ height: 120 }}>
            {status === "loading" ? "Loading price history…" : "No data"}
          </div>
        )}
      </div>
    </div>
  );
}

function DeltaCell({ label, value }: { label: string; value: number | null }) {
  const tone = value == null ? "neutral" : toneOf(value);
  return (
    <div className="symbolPreview__delta">
      <span className="symbolPreview__deltaLabel">{label}</span>
      <span
        className={`symbolPreview__deltaValue symbolPreview__deltaValue--${tone}`}
      >
        {value != null ? formatPct(value) : "—"}
      </span>
    </div>
  );
}
