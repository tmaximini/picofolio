import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
/** Daily points use a `YYYY-MM-DD` string time; intraday points use a unix
 *  timestamp (seconds). Lightweight-Charts accepts either per series. */
type ChartPoint = { time: string | number; value: number };

type PriceChartProps = {
  data: ReadonlyArray<ChartPoint>;
  height?: number;
  /** Show HH:MM on the time axis (intraday series). Default daily. */
  timeVisible?: boolean;
};

const tokens = {
  gain: "#6BCB97",
  gainTop: "rgba(107, 203, 151, 0.28)",
  gainBottom: "rgba(107, 203, 151, 0.00)",
  loss: "#E5746B",
  lossTop: "rgba(229, 116, 107, 0.28)",
  lossBottom: "rgba(229, 116, 107, 0.00)",
  text: "#6B6D74",
  grid: "rgba(255, 255, 255, 0.035)",
  crosshair: "rgba(232, 232, 234, 0.25)",
};

export function PriceChart({ data, height = 280, timeVisible = false }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      // autoSize handles container resize internally — needed for charts
      // inside animating modals where clientWidth is 0 at mount time.
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
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible,
        secondsVisible: false,
        // Pin both edges to the data so the chart always spans exactly the
        // selected timeframe (left = window start, right = now), with no
        // trailing empty bars.
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
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
  }, [height, timeVisible]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;

    const gaining = (data.at(-1)?.value ?? 0) >= (data.at(0)?.value ?? 0);
    const palette = gaining
      ? { line: tokens.gain, top: tokens.gainTop, bottom: tokens.gainBottom }
      : { line: tokens.loss, top: tokens.lossTop, bottom: tokens.lossBottom };

    // Recreate series so color swaps cleanly when range changes tone
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    const series = chart.addSeries(AreaSeries, {
      lineColor: palette.line,
      topColor: palette.top,
      bottomColor: palette.bottom,
      lineWidth: 2,
      // Always show the most-recent price as both a dashed line and an
      // axis-label tag on the right.
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerBorderColor: palette.line,
      crosshairMarkerBackgroundColor: "#14161B",
      crosshairMarkerRadius: 4,
    });
    series.setData(data as { time: Time; value: number }[]);
    chart.timeScale().fitContent();
    seriesRef.current = series;
  }, [data]);

  return <div ref={containerRef} className="priceChart" style={{ height }} />;
}
