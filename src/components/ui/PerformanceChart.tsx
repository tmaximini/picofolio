import { useEffect, useRef, useState } from "react";
import {
  BaselineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { formatCents } from "@/lib/money";

export type PerfPoint = { time: string | number; value: number; valueCents?: number };

type PerformanceChartProps = {
  data: PerfPoint[];
  height?: number;
  /** percent → "+1.68%" axis; currency → "$2,835" axis. */
  format?: "percent" | "currency";
  /** Show HH:MM on the time axis (intraday). Default daily. */
  timeVisible?: boolean;
};

const tokens = {
  gain: "#6BCB97",
  gainTop: "rgba(107, 203, 151, 0.30)",
  gainBottom: "rgba(107, 203, 151, 0.02)",
  loss: "#E5746B",
  lossTop: "rgba(229, 116, 107, 0.02)",
  lossBottom: "rgba(229, 116, 107, 0.30)",
  text: "#6B6D74",
  grid: "rgba(255, 255, 255, 0.04)",
  zero: "rgba(255, 255, 255, 0.14)",
  crosshair: "rgba(232, 232, 234, 0.25)",
};

function percentFormatter(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
}

function currencyFormatter(v: number): string {
  const sign = v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Normalize a Lightweight-Charts Time to a YYYY-MM-DD key. */
function timeKey(t: Time): string {
  if (typeof t === "string") return t;
  if (typeof t === "object" && t !== null && "year" in t) {
    const b = t as { year: number; month: number; day: number };
    return `${b.year}-${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}`;
  }
  return String(t);
}

/** Axis tick labels for intraday (unix-seconds) data, in the user's local
 *  timezone — the library's default renders timestamps as UTC, which shifts
 *  the visible session hours for anyone east/west of it. */
function localTickMark(time: Time, tickType: TickMarkType): string {
  if (typeof time !== "number") return String(time);
  const d = new Date(time * 1000);
  switch (tickType) {
    case TickMarkType.Year:
      return d.toLocaleDateString("en-US", { year: "numeric" });
    case TickMarkType.Month:
      return d.toLocaleDateString("en-US", { month: "short" });
    case TickMarkType.DayOfMonth:
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    default:
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      });
  }
}

function formatTipDate(t: string | number): string {
  // Intraday points carry a unix-seconds number → show the time too.
  if (typeof t === "number") {
    return new Date(t * 1000).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const d = new Date(`${t}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Tip = {
  x: number;
  date: string;
  /** Headline figure (percent return, or the currency value). */
  headline: string;
  /** Optional secondary line (absolute value on that day). */
  sub?: string;
  tone: "gain" | "loss" | "neutral";
};

/**
 * Baseline performance curve — green above the zero line, red below, with a
 * matching split area fill (Fey / IBKR style). A subtle hover popover shows
 * the absolute value on that day plus the return. Reused for the portfolio
 * rate-of-return chart and the journal's cumulative-P&L equity curve.
 */
export function PerformanceChart({
  data,
  height = 300,
  format = "percent",
  timeVisible = false,
}: PerformanceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  // Lookup by date for the hover popover — kept in a ref so the (once-only)
  // crosshair subscription always reads the latest data.
  const byTimeRef = useRef<Map<string, PerfPoint>>(new Map());
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

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
      localization: {
        priceFormatter: format === "percent" ? percentFormatter : currencyFormatter,
        // Crosshair time label in local time (matches the hover popover).
        ...(timeVisible
          ? {
              timeFormatter: (t: Time) =>
                formatTipDate(typeof t === "number" ? t : timeKey(t)),
            }
          : {}),
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: tokens.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: tokens.text,
        scaleMargins: { top: 0.16, bottom: 0.16 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        ...(timeVisible ? { tickMarkFormatter: localTickMark } : {}),
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

    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: tokens.gain,
      topFillColor1: tokens.gainTop,
      topFillColor2: tokens.gainBottom,
      bottomLineColor: tokens.loss,
      bottomFillColor1: tokens.lossTop,
      bottomFillColor2: tokens.lossBottom,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: "custom",
        formatter: format === "percent" ? percentFormatter : currencyFormatter,
        minMove: format === "percent" ? 0.01 : 1,
      },
      crosshairMarkerBorderColor: "#14161B",
      crosshairMarkerRadius: 4,
    });
    series.createPriceLine({
      price: 0,
      color: tokens.zero,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
    });

    chart.subscribeCrosshairMove((param) => {
      if (param.point == null || param.time == null) {
        setTip(null);
        return;
      }
      const point = byTimeRef.current.get(timeKey(param.time));
      if (!point) {
        setTip(null);
        return;
      }
      const tone =
        point.value > 0 ? "gain" : point.value < 0 ? "loss" : "neutral";
      if (format === "percent") {
        setTip({
          x: param.point.x,
          date: formatTipDate(point.time),
          headline: percentFormatter(point.value),
          sub: point.valueCents != null ? formatCents(point.valueCents) : undefined,
          tone,
        });
      } else {
        setTip({
          x: param.point.x,
          date: formatTipDate(point.time),
          headline: formatCents(Math.round(point.value * 100)),
          tone,
        });
      }
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Double-click anywhere on the plot resets the zoom to the full range
    // (the built-in reset only listens on the axis itself).
    const onDblClick = () => chart.timeScale().fitContent();
    el.addEventListener("dblclick", onDblClick);

    return () => {
      el.removeEventListener("dblclick", onDblClick);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, format, timeVisible]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || data.length === 0) return;
    const map = new Map<string, PerfPoint>();
    for (const p of data) map.set(String(p.time), p);
    byTimeRef.current = map;
    series.setData(data as { time: Time; value: number }[]);
    chart.timeScale().fitContent();
  }, [data]);

  // Clamp the popover within the chart width.
  const width = containerRef.current?.clientWidth ?? 0;
  const tipLeft = tip ? Math.max(72, Math.min(width - 72, tip.x)) : 0;

  return (
    <div className="perfChartWrap" style={{ height }}>
      <div ref={containerRef} className="priceChart" style={{ height }} />
      {tip && (
        <div className="perfTip" style={{ left: tipLeft }}>
          <div className="perfTip__date">{tip.date}</div>
          <div className={`perfTip__headline perfTip__headline--${tip.tone}`}>
            {tip.headline}
          </div>
          {tip.sub && <div className="perfTip__sub">{tip.sub}</div>}
        </div>
      )}
    </div>
  );
}
