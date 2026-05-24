import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { PricePoint } from "@/lib/priceHistory";

type PriceChartProps = {
  data: ReadonlyArray<PricePoint>;
  height?: number;
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

export function PriceChart({ data, height = 280 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      autoSize: false,
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
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
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
      handleScale: false,
      handleScroll: false,
    });

    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: Math.floor(entry.contentRect.width) });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

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
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerBorderColor: palette.line,
      crosshairMarkerBackgroundColor: "#14161B",
      crosshairMarkerRadius: 4,
    });
    series.setData(data as PricePoint[]);
    chart.timeScale().fitContent();
    seriesRef.current = series;
  }, [data]);

  return <div ref={containerRef} className="priceChart" style={{ height }} />;
}
