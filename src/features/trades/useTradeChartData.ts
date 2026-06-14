/**
 * Data plumbing for trade-context charts, extracted from TradeChart so the
 * interactive modal chart and the static share-card chart consume the same
 * windowing, fetching and series-resolution logic.
 *
 * Two modes:
 *  - **Intraday** (span ≤ 7 calendar days): 1m/5m bars around the fills.
 *  - **Daily** (longer): daily closes, window proportional to hold, capped.
 *
 * Options price off EOD history; closed option trades are valued from IBKR
 * fills and have no price series at all.
 */

import { useEffect, useMemo } from "react";
import type { Time, UTCTimestamp } from "lightweight-charts";
import {
  useIntradayEntry,
  useLoadIntraday,
  useLoadOptionPrice,
  useLoadPrice,
  useOptionPriceError,
  useOptionPricePoints,
  useOptionPriceStatus,
  usePricePoints,
  usePriceStatus,
} from "@/store/selectors";
import type { OptionPriceErrorKind } from "@/store";
import { deriveTotals } from "@/lib/tradeMath";
import { parseOccSymbol } from "@/lib/optionSymbol";
import type { Trade } from "@/lib/trades";

/** Cap so a multi-month hold doesn't render quarter-on-quarter context. */
const MAX_PRE_DAYS = 30;
const MAX_POST_DAYS = 14;

/** Threshold for choosing intraday range vs daily — short spans look like
 *  meaningless straight lines in daily mode, intraday bars give real detail. */
const INTRADAY_MAX_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TradeChartData = {
  isIntraday: boolean;
  intraStartKey: string;
  intraEndKey: string;
  windowStart: string;
  windowEnd: string;
  isOption: boolean;
  isOpen: boolean;
  /** Closed option trades are valued from fills — no price series exists. */
  closedOption: boolean;
  /** Resolved chart points (intraday or daily); null while unavailable. */
  points: { time: Time; value: number }[] | null;
  loading: boolean;
  error: boolean;
  noData: boolean;
  optErrorKind: OptionPriceErrorKind | null | undefined;
};

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startKey: string, endKey: string): number {
  const s = new Date(`${startKey}T00:00:00Z`).getTime();
  const e = new Date(`${endKey}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((e - s) / DAY_MS));
}

export function nearestByTime(
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

export function compareTime(a: Time, b: Time): number {
  return String(a).localeCompare(String(b));
}

/** Whole-line tone for a closed trade: green if the round trip made money. */
export function colorByOutcome(trade: Trade): "gain" | "loss" {
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

export function useTradeChartData(trade: Trade): TradeChartData {
  // Decide chart mode based on calendar-day span. Intraday is used not
  // just for same-day trades but for short multi-day spans too — daily
  // resolution with only a handful of points (e.g. a 2-day trade) looks
  // like meaningless straight lines. Open trades extend to "now".
  const { isIntraday, intraStartKey, intraEndKey, windowStart, windowEnd, isOption, isOpen } =
    useMemo(() => {
      const isOption = parseOccSymbol(trade.symbol) != null;
      const empty = {
        isIntraday: false,
        intraStartKey: "",
        intraEndKey: "",
        windowStart: "",
        windowEnd: "",
        isOption,
        isOpen: false,
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

      const dailyWindow = () => {
        const pre = Math.min(MAX_PRE_DAYS, Math.max(1, Math.round(spanDays * 0.6) + 1));
        const post = isOpen
          ? 0
          : Math.min(MAX_POST_DAYS, Math.max(1, Math.round(spanDays * 0.4) + 1));
        return {
          isIntraday: false as const,
          intraStartKey: "",
          intraEndKey: "",
          windowStart: shiftIsoDate(entryKey, -pre),
          windowEnd: isOpen ? todayKey : shiftIsoDate(lastKey, post),
          isOption,
          isOpen,
        };
      };

      // Options price off MarketData.app EOD history — daily flow only (no
      // intraday option feed in scope). Equities can use intraday for short spans.
      if (isOption) return dailyWindow();

      if (spanDays <= INTRADAY_MAX_DAYS) {
        return {
          isIntraday: true,
          intraStartKey: entryKey,
          intraEndKey: effectiveEndKey,
          windowStart: "",
          windowEnd: "",
          isOption,
          isOpen,
        };
      }

      return dailyWindow();
    }, [trade]);

  // Closed option trades are valued from IBKR fills — never an external call.
  const closedOption = isOption && !isOpen;

  // ---- Intraday flow ----
  const loadIntraday = useLoadIntraday();
  const intraEntry = useIntradayEntry(trade.symbol, intraStartKey, intraEndKey);

  useEffect(() => {
    if (isIntraday && intraStartKey && intraEndKey) {
      loadIntraday(trade.symbol, intraStartKey, intraEndKey);
    }
  }, [isIntraday, intraStartKey, intraEndKey, trade.symbol, loadIntraday]);

  // ---- Daily flow (equities via Yahoo, open options via MarketData.app) ----
  const loadPrice = useLoadPrice();
  const loadOptionPrice = useLoadOptionPrice();
  const eqStatus = usePriceStatus(trade.symbol);
  const eqPoints = usePricePoints(trade.symbol);
  const optStatus = useOptionPriceStatus(trade.symbol);
  const optPoints = useOptionPricePoints(trade.symbol);
  const optErrorKind = useOptionPriceError(trade.symbol);

  const dailyStatus = isOption ? optStatus : eqStatus;
  const dailyPoints = isOption ? optPoints : eqPoints;

  useEffect(() => {
    if (isOption) {
      // Only OPEN option positions are marked from MarketData. Closed option
      // trades render from IBKR fills and make no external call.
      if (isOpen) loadOptionPrice(trade.symbol);
    } else if (!isIntraday) {
      loadPrice(trade.symbol);
    }
  }, [isOption, isOpen, isIntraday, trade.symbol, loadOptionPrice, loadPrice]);

  // Hand the chart the *full* daily history we have (2y). The visible
  // range gets focused to the trade window by the consumer — zoom-out
  // reveals the rest.
  const dailySeries = useMemo(() => {
    if (isIntraday) return null;
    if (closedOption) return null; // valued from fills, no price series
    if (!dailyPoints || dailyPoints.length === 0) return null;
    return dailyPoints;
  }, [isIntraday, closedOption, dailyPoints]);

  const points = useMemo((): { time: Time; value: number }[] | null => {
    if (isIntraday) {
      if (!intraEntry?.points) return null;
      return intraEntry.points.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      }));
    }
    if (!dailySeries) return null;
    return dailySeries.map((p) => ({ time: p.time as Time, value: p.value }));
  }, [isIntraday, intraEntry, dailySeries]);

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

  return {
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
  };
}
