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

/** `value` is the rebased percent; `valueCents` is the absolute value that day. */
export type PctPoint = { time: string; value: number; valueCents: number };

/** Rebased percent series for the range. Empty if fewer than 2 points. */
export function computePctSeries(
  series: ValuePoint[],
  range: PerfRange,
): PctPoint[] {
  if (series.length < 2) return [];
  const cutoff = startCutoff(range, series);
  const sliced = series.filter((p) => p.time >= cutoff);
  if (sliced.length < 2) return [];
  const base = sliced[0]!.valueCents;
  if (base === 0) return [];
  return sliced.map((p) => ({
    time: p.time,
    value: ((p.valueCents - base) / base) * 100,
    valueCents: p.valueCents,
  }));
}
