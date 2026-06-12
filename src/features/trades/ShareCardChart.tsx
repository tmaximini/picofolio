/**
 * Static mini price chart for the shareable trade card. Same data plumbing
 * as the interactive TradeChart (useTradeChartData) but stripped of every
 * interactive concern: no crosshair, no zoom/pan, no price lines — just the
 * outcome-colored line with entry/exit arrows, focused on the trade window.
 *
 * Renders null while data is unavailable (the card collapses the block).
 */

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { coalesceExecutions } from "@/lib/tradeMath";
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
  grid: "rgba(255, 255, 255, 0.03)",
};

type ShareCardChartProps = {
  trade: Trade;
  height?: number;
};

export function ShareCardChart({ trade, height = 210 }: ShareCardChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const {
    isIntraday,
    intraStartKey,
    intraEndKey,
    windowStart,
    windowEnd,
    isOption,
    closedOption,
    points,
  } = useTradeChartData(trade);

  // The card tells the trade's story, not the symbol's: slice the series to
  // the trade window. (Feeding the full history and relying on
  // setVisibleRange doesn't work here — fixed edges clamp to the data's
  // extent, dragging post-exit bars into the frame.)
  const windowed = (() => {
    if (!points) return null;
    if (isIntraday && intraStartKey && intraEndKey) {
      const fromSec = Math.floor(new Date(`${intraStartKey}T13:00:00Z`).getTime() / 1000);
      const toSec = Math.floor(new Date(`${intraEndKey}T21:00:00Z`).getTime() / 1000);
      return points.filter((p) => Number(p.time) >= fromSec && Number(p.time) <= toSec);
    }
    if (windowStart && windowEnd) {
      return points.filter(
        (p) => String(p.time) >= windowStart && String(p.time) <= windowEnd,
      );
    }
    return points;
  })();

  const hasData = !closedOption && windowed != null && windowed.length > 1;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasData || !windowed) return;

    const chart = createChart(el, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: tokens.text,
        fontFamily:
          '"JetBrains Mono", "Berkeley Mono", "SF Mono", ui-monospace, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: tokens.grid },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: tokens.text,
        scaleMargins: { top: 0.22, bottom: 0.14 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: isIntraday,
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

    const sideTone = colorByOutcome(trade);
    const palette =
      sideTone === "gain"
        ? { line: tokens.gain, top: tokens.gainTop, bottom: tokens.gainBottom }
        : { line: tokens.loss, top: tokens.lossTop, bottom: tokens.lossBottom };
    const series = chart.addSeries(AreaSeries, {
      lineColor: palette.line,
      topColor: palette.top,
      bottomColor: palette.bottom,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    series.setData(windowed);

    // Entry/exit arrows — same anchoring as TradeChart; options skip markers
    // (EOD-only history makes intraday fill prices float off the daily line).
    // autoScale: false — marker pixel reserve must not inflate the price
    // range (a tight-range series would otherwise render as a flat line).
    if (!isOption) {
      const markers: SeriesMarker<Time>[] = coalesceExecutions(trade.executions)
        .map((ex) => {
          const isBuy = ex.action === "BUY";
          const position: "belowBar" | "aboveBar" = isBuy ? "belowBar" : "aboveBar";
          const shape: "arrowUp" | "arrowDown" = isBuy ? "arrowUp" : "arrowDown";
          const color = isBuy ? tokens.gain : tokens.loss;
          const text = `${ex.action} ${ex.qty.toLocaleString("en-US")}`;
          if (isIntraday) {
            const tSec = Math.floor(new Date(ex.at).getTime() / 1000);
            const nearest = nearestByTime(windowed, tSec);
            if (!nearest) return null;
            return { time: nearest.time, position, shape, color, text };
          }
          const dayKey = ex.at.slice(0, 10);
          const point = windowed.find((p) => String(p.time) >= dayKey);
          if (!point) return null;
          return { time: point.time, position, shape, color, text };
        })
        .filter((m): m is NonNullable<typeof m> => m != null)
        .sort((a, b) => compareTime(a.time, b.time));
      createSeriesMarkers(series, markers, { autoScale: false });
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // windowed derives from points + window keys — they cover its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, points, trade, isIntraday, isOption, intraStartKey, intraEndKey, windowStart, windowEnd, height]);

  if (!hasData) return null;

  return <div ref={containerRef} className="shareCard__chart" style={{ height }} />;
}
