/**
 * Trade-context price chart (interactive — crosshair, zoom, pan).
 *
 * Data plumbing (intraday-vs-daily windowing, fetching, series resolution)
 * lives in useTradeChartData — shared with the static share-card chart.
 *
 * Markers are positioned `belowBar` for buys and `aboveBar` for sells so
 * same-bar executions never overlay each other. Target/stop are rendered
 * as dashed horizontal price lines.
 *
 * Falls back to a friendly "no chart data" panel when neither flow has
 * coverage for the symbol or date.
 */

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  BaselineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Link } from "react-router-dom";
import { coalesceExecutions, deriveTotals } from "@/lib/tradeMath";
import type { Trade } from "@/lib/trades";
import {
  colorByOutcome,
  compareTime,
  nearestByTime,
  useTradeChartData,
} from "./useTradeChartData";

const tokens = {
  gain: "#6BCB97",
  gainTop: "rgba(107, 203, 151, 0.22)",
  gainBottom: "rgba(107, 203, 151, 0.00)",
  loss: "#E5746B",
  lossTop: "rgba(229, 116, 107, 0.22)",
  lossBottom: "rgba(229, 116, 107, 0.00)",
  text: "#6B6D74",
  textBright: "#A8A9AD",
  grid: "rgba(255, 255, 255, 0.035)",
  crosshair: "rgba(232, 232, 234, 0.25)",
};

type TradeChartProps = {
  trade: Trade;
  height?: number;
};

export function TradeChart({ trade, height = 240 }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | ISeriesApi<"Baseline"> | null>(null);

  const {
    isIntraday,
    intraStartKey,
    intraEndKey,
    windowStart,
    windowEnd,
    isOption,
    isOpen,
    closedOption,
    points,
    loading,
    error,
    noData,
    optErrorKind,
  } = useTradeChartData(trade);

  // Init / teardown chart instance.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      // autoSize: chart hooks its own ResizeObserver and redraws whenever
      // the container changes — critical when the chart is mounted inside
      // a modal that's still animating in (clientWidth = 0 at create time
      // otherwise leaves the chart blank until you reopen it).
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
        vertLines: { color: tokens.grid },
        horzLines: { color: tokens.grid },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: tokens.text,
        scaleMargins: { top: 0.18, bottom: 0.12 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: isIntraday,
        secondsVisible: false,
        // Both edges pinned to the data: zoom-out bottoms out at "all
        // history visible" instead of compressing a short series (fresh
        // IPOs have only weeks of bars) into a sliver in the corner.
        // Panning/zooming INTO earlier history still works freely.
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 2,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: tokens.crosshair,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: "#1C1F26",
        },
        horzLine: {
          color: tokens.crosshair,
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: "#1C1F26",
        },
      },
      // Pinch (trackpad / touchscreen) + two-finger scroll / wheel zoom
      // the time axis. Drag inside the chart pans through time. Drag the
      // time-axis itself for fine zoom. Double-click axis to reset.
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: false },
        axisDoubleClickReset: { time: true, price: false },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, isIntraday]);

  // Render data + markers + price lines.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const data = points;
    if (!data || data.length === 0) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    // Open trades render as a BASELINE series anchored at the average entry:
    // the line + fill turn green above your cost and red below it, so an
    // underwater position reads as underwater at a glance. Closed trades keep
    // the single outcome color (whole line green for a win, red for a loss).
    const totals = deriveTotals(trade);
    const isOpenNow = totals.positionQty > 0;
    const entryPrice = totals.avgEntryCents != null ? totals.avgEntryCents / 100 : null;

    let series: ISeriesApi<"Area"> | ISeriesApi<"Baseline">;
    if (isOpenNow && entryPrice != null) {
      series = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: entryPrice },
        topLineColor: tokens.gain,
        topFillColor1: "rgba(107, 203, 151, 0.20)",
        topFillColor2: "rgba(107, 203, 151, 0.00)",
        bottomLineColor: tokens.loss,
        bottomFillColor1: "rgba(229, 116, 107, 0.00)",
        bottomFillColor2: "rgba(229, 116, 107, 0.20)",
        lineWidth: 2,
        baseLineVisible: false,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerBorderColor: tokens.textBright,
        crosshairMarkerBackgroundColor: "#14161B",
        crosshairMarkerRadius: 4,
      });
    } else {
      const sideTone = colorByOutcome(trade);
      const palette =
        sideTone === "gain"
          ? { line: tokens.gain, top: tokens.gainTop, bottom: tokens.gainBottom }
          : { line: tokens.loss, top: tokens.lossTop, bottom: tokens.lossBottom };
      series = chart.addSeries(AreaSeries, {
        lineColor: palette.line,
        topColor: palette.top,
        bottomColor: palette.bottom,
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerBorderColor: palette.line,
        crosshairMarkerBackgroundColor: "#14161B",
        crosshairMarkerRadius: 4,
      });
    }
    series.setData(data);
    seriesRef.current = series;

    // Build markers. For intraday we anchor to the nearest bar by timestamp;
    // for daily we anchor by the trade's calendar day. Coalesce IBKR slot
    // fills first so we don't render multiple overlapping arrows for what
    // was logically a single order.
    const visibleExecs = coalesceExecutions(trade.executions);
    const markers: SeriesMarker<Time>[] = visibleExecs
      .map((ex) => {
        const isBuy = ex.action === "BUY";
        const position: "belowBar" | "aboveBar" = isBuy ? "belowBar" : "aboveBar";
        const shape: "arrowUp" | "arrowDown" = isBuy ? "arrowUp" : "arrowDown";
        const color = isBuy ? tokens.gain : tokens.loss;
        // Keep marker text short (action + qty). The fill price lives on
        // the dotted price line + the execution list, so repeating it here
        // only makes the label wide enough to clip the canvas edge when a
        // fill sits near the start of the window.
        const text = `${ex.action} ${ex.qty.toLocaleString("en-US")}`;

        if (isIntraday) {
          const tSec = Math.floor(new Date(ex.at).getTime() / 1000);
          // Snap to the nearest available bar so the arrow sits on the price line.
          const nearest = nearestByTime(data, tSec);
          if (!nearest) return null;
          return {
            time: nearest.time,
            position,
            shape,
            color,
            text,
          };
        }
        const dayKey = ex.at.slice(0, 10);
        const point = data.find((p) => String(p.time) >= dayKey);
        if (!point) return null;
        return { time: point.time, position, shape, color, text };
      })
      .filter((m): m is NonNullable<typeof m> => m != null)
      .sort((a, b) => compareTime(a.time, b.time));

    // Options price off EOD-only history, so a fill's intraday price won't sit
    // on the daily close — an arrow anchored to the bar floats off the entry
    // and reads as pointing at the "wrong" line. The dotted fill-price line
    // below + the execution list carry entry/exit for options instead.
    // autoScale: false — the marker plugin would otherwise expand the price
    // range to fit arrows in *pixels*, which blows the scale wide open on
    // tight-range series (e.g. a $21–42 fresh IPO rendering as 0–400).
    if (!isOption) createSeriesMarkers(series, markers, { autoScale: false });

    // Horizontal dotted price line at every (coalesced) execution price.
    // Differentiates from target/stop (dashed) and reinforces where the
    // fills sit relative to the price action — easier to read at a glance
    // than the arrows alone. Reuse the visibleExecs from above so the line
    // labels show the merged qty (e.g. B 200 instead of two B 135 / B 65).
    for (const ex of visibleExecs) {
      const isBuy = ex.action === "BUY";
      series.createPriceLine({
        price: ex.priceCents / 100,
        color: isBuy ? tokens.gain : tokens.loss,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        // No axis tag — the fill price sits close to the live last-value
        // tag, so showing both stacks two near-identical pills on the
        // right axis. The dotted line + the marker label carry it instead.
        axisLabelVisible: false,
        title: `${ex.action[0]} ${ex.qty}`,
      });
    }

    if (trade.targetCents != null) {
      series.createPriceLine({
        price: trade.targetCents / 100,
        color: tokens.gain,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TGT",
      });
    }
    if (trade.stopCents != null) {
      series.createPriceLine({
        price: trade.stopCents / 100,
        color: tokens.loss,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "STOP",
      });
    }

    // Focus the visible range on the trade window. The full history stays
    // loaded under the hood, so zooming out (pinch / wheel / drag) reveals
    // more context without another fetch.
    const ts = chart.timeScale();
    if (isIntraday && intraStartKey && intraEndKey) {
      const fromSec = Math.floor(
        new Date(`${intraStartKey}T13:00:00Z`).getTime() / 1000,
      );
      const toSec = Math.floor(
        new Date(`${intraEndKey}T21:00:00Z`).getTime() / 1000,
      );
      ts.setVisibleRange({
        from: fromSec as UTCTimestamp,
        to: toSec as UTCTimestamp,
      });
    } else if (!isIntraday && windowStart && windowEnd) {
      ts.setVisibleRange({
        from: windowStart as Time,
        to: windowEnd as Time,
      });
    } else {
      ts.fitContent();
    }
  }, [isIntraday, points, trade, isOption, intraStartKey, intraEndKey, windowStart, windowEnd]);

  // Render the chart container UNCONDITIONALLY so the ref attaches on first
  // mount — the init effect needs it. Loading / no-data states are overlays
  // on top, not alternate returns. Returning early here would mean the ref
  // never attaches on the first render, the init effect runs with null,
  // and the chart never gets created until the user closes + reopens the
  // modal (at which point the data is already cached so no Loading branch).
  // Option-specific states (no-token hint, fetch failure, closed-option note)
  // take priority over the generic equity messaging.
  const optionNoToken = isOption && isOpen && optErrorKind === "no-token";
  const optionFetchFail =
    isOption && isOpen && (optErrorKind === "not-found" || optErrorKind === "fetch");

  const showLoadingOverlay = loading && !error && !noData && !closedOption;

  // Resolve the no-data overlay content once, by priority.
  let overlayLabel: string | null = null;
  let overlayBody: React.ReactNode = null;
  if (!showLoadingOverlay) {
    if (optionNoToken) {
      overlayLabel = "Option pricing needs a token";
      overlayBody = (
        <>
          Add a free MarketData.app token to chart this open contract.{" "}
          <Link to="/settings?focus=marketdata" style={{ color: "var(--accent)", fontWeight: 500 }}>
            Add token →
          </Link>
        </>
      );
    } else if (optionFetchFail) {
      overlayLabel = "No chart data";
      overlayBody = "Couldn't fetch pricing for this contract.";
    } else if (closedOption) {
      overlayLabel = "No price chart";
      overlayBody = "Closed option trades are valued from your IBKR fills.";
    } else if (error || noData) {
      overlayLabel = "No chart data";
      overlayBody = isIntraday
        ? "Intraday history unavailable for this date."
        : `${trade.symbol} isn't on the price feed yet.`;
    }
  }
  const showNoDataOverlay = overlayLabel != null;

  return (
    <div style={{ position: "relative", height }}>
      <div
        ref={containerRef}
        className="priceChart"
        style={{
          height,
          background: "var(--surface-base)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-2)",
        }}
      />
      {showLoadingOverlay && (
        <div className="tradeChart__overlay" style={{ height }}>
          <div className="priceChart priceChart--fallback" style={{ height, width: "100%", borderRadius: "var(--radius-md)" }}>
            Loading {isIntraday ? "intraday" : "price"} history…
          </div>
        </div>
      )}
      {showNoDataOverlay && (
        <div className="tradeChart__overlay" style={{ height }}>
          <div className="tradeChart__noData" style={{ height, width: "100%" }}>
            <div className="tradeChart__noDataLabel">{overlayLabel}</div>
            <div className="tradeChart__noDataSub">{overlayBody}</div>
          </div>
        </div>
      )}
    </div>
  );
}
