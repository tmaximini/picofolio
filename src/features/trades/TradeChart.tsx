/**
 * Trade-context price chart.
 *
 * Two modes:
 *
 *  - **Intraday** (hold duration < 24h): fetches 1m/5m bars for the trade's
 *    day and shows just that session, so day-traders see the actual price
 *    path around their fills.
 *  - **Daily** (hold >= 24h): shows daily closes from a few days before the
 *    first execution to a few days after the last. Window is proportional
 *    to hold duration, capped on both ends.
 *
 * Markers are positioned `belowBar` for buys and `aboveBar` for sells so
 * same-bar executions never overlay each other. Target/stop are rendered
 * as dashed horizontal price lines.
 *
 * Falls back to a friendly "no chart data" panel when neither flow has
 * coverage for the symbol or date.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  AreaSeries,
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
import { formatCents } from "@/lib/money";
import {
  useIntradayEntry,
  useLoadIntraday,
  useLoadPrice,
  usePricePoints,
  usePriceStatus,
} from "@/store/selectors";
import { coalesceExecutions, deriveTotals } from "@/lib/tradeMath";
import type { Trade } from "@/lib/trades";

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

/** Cap so a multi-month hold doesn't render quarter-on-quarter context. */
const MAX_PRE_DAYS = 30;
const MAX_POST_DAYS = 14;

/** Threshold for choosing intraday range vs daily — short spans look like
 *  meaningless straight lines in daily mode, intraday bars give real detail. */
const INTRADAY_MAX_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

type TradeChartProps = {
  trade: Trade;
  height?: number;
};

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function TradeChart({ trade, height = 240 }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Decide chart mode based on calendar-day span. Intraday is used not
  // just for same-day trades but for short multi-day spans too — daily
  // resolution with only a handful of points (e.g. a 2-day trade) looks
  // like meaningless straight lines. Open trades extend to "now".
  //
  //  - Span ≤ INTRADAY_MAX_DAYS → intraday range (1m bars within 7d,
  //    5m bars within 60d via Yahoo retention)
  //  - Longer → daily with adaptive window
  const { isIntraday, intraStartKey, intraEndKey, windowStart, windowEnd } = useMemo(() => {
    const empty = {
      isIntraday: false,
      intraStartKey: "",
      intraEndKey: "",
      windowStart: "",
      windowEnd: "",
    };
    if (trade.executions.length === 0) return empty;

    const sorted = [...trade.executions].sort((a, b) => a.at.localeCompare(b.at));
    const tot = deriveTotals(trade);
    const isOpen = tot.positionQty > 0;

    const entryKey = localDateKey(sorted[0]!.at);
    const lastKey = localDateKey(sorted[sorted.length - 1]!.at);
    const todayKey = localDateKey(new Date().toISOString());

    // For open trades the effective "end" is today, not last execution.
    const effectiveEndKey = isOpen ? todayKey : lastKey;
    const spanDays = daysBetween(entryKey, effectiveEndKey);

    if (spanDays <= INTRADAY_MAX_DAYS) {
      return {
        isIntraday: true,
        intraStartKey: entryKey,
        intraEndKey: effectiveEndKey,
        windowStart: "",
        windowEnd: "",
      };
    }

    const pre = Math.min(MAX_PRE_DAYS, Math.max(1, Math.round(spanDays * 0.6) + 1));
    const post = isOpen
      ? 0
      : Math.min(MAX_POST_DAYS, Math.max(1, Math.round(spanDays * 0.4) + 1));
    return {
      isIntraday: false,
      intraStartKey: "",
      intraEndKey: "",
      windowStart: shiftIsoDate(entryKey, -pre),
      windowEnd: isOpen ? todayKey : shiftIsoDate(lastKey, post),
    };
  }, [trade]);

  // ---- Intraday flow ----
  const loadIntraday = useLoadIntraday();
  const intraEntry = useIntradayEntry(trade.symbol, intraStartKey, intraEndKey);

  useEffect(() => {
    if (isIntraday && intraStartKey && intraEndKey) {
      loadIntraday(trade.symbol, intraStartKey, intraEndKey);
    }
  }, [isIntraday, intraStartKey, intraEndKey, trade.symbol, loadIntraday]);

  // ---- Daily flow ----
  const loadPrice = useLoadPrice();
  const dailyStatus = usePriceStatus(trade.symbol);
  const dailyPoints = usePricePoints(trade.symbol);

  useEffect(() => {
    if (!isIntraday) loadPrice(trade.symbol);
  }, [isIntraday, trade.symbol, loadPrice]);

  // Hand the chart the *full* daily history we have (2y). The visible
  // range gets focused to the trade window via setVisibleRange below —
  // zoom-out reveals the rest. Previously we sliced here, which made
  // zoom merely rescale the existing slice (no new data).
  const dailySeries = useMemo(() => {
    if (isIntraday) return null;
    if (!dailyPoints || dailyPoints.length === 0) return null;
    return dailyPoints;
  }, [isIntraday, dailyPoints]);

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
        // Right edge pinned to the latest data — zoom-out reveals more on
        // the left, never empty space on the right. Left edge stays free
        // so users can pan/zoom into earlier history.
        fixLeftEdge: false,
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

    const data: { time: Time; value: number }[] | null = isIntraday
      ? intraEntry?.points
        ? intraEntry.points.map((p) => ({
            time: p.time as UTCTimestamp,
            value: p.value,
          }))
        : null
      : dailySeries
        ? dailySeries.map((p) => ({ time: p.time as Time, value: p.value }))
        : null;

    if (!data || data.length === 0) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

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
      // Always surface the most-recent price on the right axis — both the
      // dashed horizontal line and the axis-label tag. For a closed trade
      // this is the most recent market close; for an open trade it's live.
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerBorderColor: palette.line,
      crosshairMarkerBackgroundColor: "#14161B",
      crosshairMarkerRadius: 4,
    });
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
        const text = `${ex.action} ${ex.qty} @ ${formatCents(ex.priceCents)}`;

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

    createSeriesMarkers(series, markers);

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
        axisLabelVisible: true,
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
  }, [isIntraday, intraEntry, dailySeries, trade, intraStartKey, intraEndKey, windowStart, windowEnd]);

  const loading = isIntraday
    ? intraEntry?.status === "loading" || intraEntry == null
    : dailyStatus === "loading" && !dailySeries;

  const error = isIntraday
    ? intraEntry?.status === "error"
    : dailyStatus === "error";

  const noData = isIntraday
    ? intraEntry?.status === "ready" &&
      (intraEntry.points == null || intraEntry.points.length === 0)
    : dailySeries != null && dailySeries.length === 0;

  // Render the chart container UNCONDITIONALLY so the ref attaches on first
  // mount — the init effect needs it. Loading / no-data states are overlays
  // on top, not alternate returns. Returning early here would mean the ref
  // never attaches on the first render, the init effect runs with null,
  // and the chart never gets created until the user closes + reopens the
  // modal (at which point the data is already cached so no Loading branch).
  const showLoadingOverlay = loading && !error && !noData;
  const showNoDataOverlay = !loading && (error || noData);

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
            <div className="tradeChart__noDataLabel">No chart data</div>
            <div className="tradeChart__noDataSub">
              {isIntraday
                ? "Intraday history unavailable for this date."
                : `${trade.symbol} isn't on the price feed yet.`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startKey: string, endKey: string): number {
  const s = new Date(`${startKey}T00:00:00Z`).getTime();
  const e = new Date(`${endKey}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((e - s) / DAY_MS));
}

function nearestByTime(
  data: { time: Time; value: number }[],
  tSec: number,
): { time: Time; value: number } | null {
  if (data.length === 0) return null;
  // data is sorted ascending; binary-ish linear is fine for ~400 pts.
  let best = data[0]!;
  let bestDelta = Math.abs(Number(best.time) - tSec);
  for (const p of data) {
    const d = Math.abs(Number(p.time) - tSec);
    if (d < bestDelta) {
      bestDelta = d;
      best = p;
    }
  }
  return best;
}

function compareTime(a: Time, b: Time): number {
  return String(a).localeCompare(String(b));
}

function colorByOutcome(trade: Trade): "gain" | "loss" {
  let buyNotional = 0;
  let buyQty = 0;
  let sellNotional = 0;
  let sellQty = 0;
  for (const ex of trade.executions) {
    if (ex.action === "BUY") {
      buyNotional += ex.qty * ex.priceCents;
      buyQty += ex.qty;
    } else {
      sellNotional += ex.qty * ex.priceCents;
      sellQty += ex.qty;
    }
  }
  if (buyQty === 0 || sellQty === 0) return "gain";
  const avgBuy = buyNotional / buyQty;
  const avgSell = sellNotional / sellQty;
  if (trade.side === "LONG") return avgSell >= avgBuy ? "gain" : "loss";
  return avgBuy >= avgSell ? "gain" : "loss";
}
