/**
 * Live context chart for the setup terminal — the last 7 days of the parsed
 * symbol with the plan's levels drawn on top: entry dotted, target/stop
 * dashed (same visual grammar as TradeChart). Includes the Picofolio /
 * TradingView source switcher from the trade view.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { ExternalLink } from "lucide-react";
import { tradingViewChartUrl, tradingViewEmbedUrl } from "@/lib/tradingview";
import {
  useIntradayEntry,
  useLoadIntraday,
} from "@/store/selectors";

const tokens = {
  line: "#A8A9AD",
  fillTop: "rgba(232, 232, 234, 0.10)",
  fillBottom: "rgba(232, 232, 234, 0.00)",
  gain: "#6BCB97",
  loss: "#E5746B",
  text: "#6B6D74",
  grid: "rgba(255, 255, 255, 0.03)",
};

type SetupChartProps = {
  symbol: string;
  entryCents: number | null;
  targetCents: number | null;
  stopCents: number | null;
  height?: number;
};

export function SetupChart({
  symbol,
  entryCents,
  targetCents,
  stopCents,
  height = 340,
}: SetupChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [tvEmbedded, setTvEmbedded] = useState(false);

  // 7d of intraday bars — same window the holdings chart uses for 1W.
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const startKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const loadIntraday = useLoadIntraday();
  const entry = useIntradayEntry(symbol, startKey, todayKey);

  useEffect(() => {
    if (symbol && !tvEmbedded) loadIntraday(symbol, startKey, todayKey);
  }, [symbol, startKey, todayKey, loadIntraday, tvEmbedded]);

  // The intraday cache may hold a wider window (one fetch covers 1W and
  // 1M elsewhere) — slice to the last 7 days, this chart's contract.
  const points = useMemo(() => {
    if (!entry?.points) return null;
    const cutoff = Date.now() / 1000 - 7 * 86400;
    return entry.points.filter((p) => p.time >= cutoff);
  }, [entry]);
  const loading = !tvEmbedded && (entry == null || entry.status === "loading");
  const hasData = points != null && points.length > 1;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || tvEmbedded || !hasData || !points) return;

    const chart = createChart(el, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: tokens.text,
        fontFamily:
          '"JetBrains Mono", "Berkeley Mono", "SF Mono", ui-monospace, monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: tokens.grid },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: tokens.text,
        scaleMargins: { top: 0.15, bottom: 0.12 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
      },
      crosshair: {
        mode: CrosshairMode.Hidden,
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScale: false,
      handleScroll: false,
    });
    chartRef.current = chart;

    // Neutral line — the plan's levels carry the color. The custom
    // autoscale unions the price data with the plan's levels so a target
    // above (or stop below) the recent range is always on screen.
    const levels = [entryCents, targetCents, stopCents]
      .filter((c): c is number => c != null)
      .map((c) => c / 100);
    const series = chart.addSeries(AreaSeries, {
      lineColor: tokens.line,
      topColor: tokens.fillTop,
      bottomColor: tokens.fillBottom,
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
        const base = original();
        if (!base?.priceRange || levels.length === 0) return base;
        return {
          ...base,
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, ...levels),
            maxValue: Math.max(base.priceRange.maxValue, ...levels),
          },
        };
      },
    });
    series.setData(
      points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    if (entryCents != null) {
      series.createPriceLine({
        price: entryCents / 100,
        color: tokens.text,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "entry",
      });
    }
    if (targetCents != null) {
      series.createPriceLine({
        price: targetCents / 100,
        color: tokens.gain,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TGT",
      });
    }
    if (stopCents != null) {
      series.createPriceLine({
        price: stopCents / 100,
        color: tokens.loss,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "STOP",
      });
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [tvEmbedded, hasData, points, entryCents, targetCents, stopCents, height]);

  return (
    <div className="setupTerminal__chartBlock">
      <div className="chartToolbar">
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
      </div>

      {tvEmbedded ? (
        <div className="setupTerminal__tvEmbed" style={{ height }}>
          <iframe
            title={`TradingView ${symbol}`}
            src={tradingViewEmbedUrl(symbol, { interval: "60" })}
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            allowFullScreen
          />
        </div>
      ) : loading ? (
        <div className="chartLoading" style={{ height }}>
          <span className="chartLoading__line" />
        </div>
      ) : !hasData ? (
        <div className="priceChart priceChart--fallback" style={{ height }}>
          No intraday data for {symbol}
        </div>
      ) : (
        <div ref={containerRef} className="setupTerminal__chart" style={{ height }} />
      )}
    </div>
  );
}
