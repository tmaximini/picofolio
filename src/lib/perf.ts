/**
 * Performance-window helpers. Turn a daily portfolio value series into a
 * rate-of-return series (percent vs the window's first value) for the
 * selected range. Percent is returned as whole-number percent (1.68 = 1.68%).
 */

import type { ValuePoint } from "@/store/selectors";

export type PerfRange = "7D" | "MTD" | "YTD" | "1Y" | "All";

export const PERF_RANGES: PerfRange[] = ["7D", "MTD", "YTD", "1Y", "All"];

/** ISO (YYYY-MM-DD) start cutoff for a range, anchored on the series' last day. */
function startCutoff(range: PerfRange, series: ValuePoint[]): string {
  const lastTime = series[series.length - 1]!.time;
  const last = new Date(`${lastTime}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (range) {
    case "7D": {
      const d = new Date(last);
      d.setUTCDate(d.getUTCDate() - 7);
      return iso(d);
    }
    case "MTD":
      return `${lastTime.slice(0, 7)}-01`;
    case "YTD":
      return `${lastTime.slice(0, 4)}-01-01`;
    case "1Y": {
      const d = new Date(last);
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      return iso(d);
    }
    case "All":
      return series[0]!.time;
  }
}

/** `value` is the rebased percent; `valueCents` is the absolute value that day.
 *  `time` is a `YYYY-MM-DD` string for daily series, or unix seconds for the
 *  intraday-reconstructed short-range series. */
export type PctPoint = { time: string | number; value: number; valueCents: number };

/**
 * Rebased percent series for the range.
 *
 * Rebases from the first *non-zero* value in the window — a brand-new
 * account can report leading $0 days (pre-funding), and 0 can't be a
 * percent base. When the data starts after the window does (e.g. YTD on an
 * account opened in June), a flat 0% anchor at the window start draws a
 * straight line up to the first real point instead of an empty chart.
 */
export function computePctSeries(
  series: ValuePoint[],
  range: PerfRange,
): PctPoint[] {
  if (series.length === 0) return [];
  const cutoff = startCutoff(range, series);
  const sliced = series.filter((p) => p.time >= cutoff);
  const firstReal = sliced.findIndex((p) => p.valueCents > 0);
  if (firstReal === -1) return [];
  const kept = sliced.slice(firstReal);
  const base = kept[0]!.valueCents;
  const pct: PctPoint[] = kept.map((p) => ({
    time: p.time,
    value: ((p.valueCents - base) / base) * 100,
    valueCents: p.valueCents,
  }));
  if (kept[0]!.time > cutoff) {
    pct.unshift({ time: cutoff, value: 0, valueCents: base });
  }
  return pct;
}
