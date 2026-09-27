import { describe, expect, it } from "vitest";
import { watchMetrics } from "./watchlist";

/** Daily closes from `start`, one per calendar day. */
function series(start: string, values: number[]) {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({
    time: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

describe("watchMetrics", () => {
  it("needs two closes", () => {
    expect(watchMetrics(series("2026-01-01", [10]), "2026-01-01")).toBeNull();
  });

  it("computes day, month, since-added and 52w position", () => {
    // 40 days: 100 → 139, then last close 150
    const vals = Array.from({ length: 40 }, (_, i) => 100 + i);
    vals.push(150);
    const pts = series("2026-01-01", vals); // last = 2026-02-10
    const m = watchMetrics(pts, "2026-01-11")!;
    expect(m.last).toBe(150);
    expect(m.dayPct).toBeCloseTo(150 / 139 - 1);
    // 30 days before 02-10 is 01-11 → close 110
    expect(m.monthPct).toBeCloseTo(150 / 110 - 1);
    expect(m.sinceAddedPct).toBeCloseTo(150 / 110 - 1);
    expect(m.low52).toBe(100);
    expect(m.high52).toBe(150);
    expect(m.rangePos).toBe(1);
  });

  it("uses the prior close when added today, first close when added before history", () => {
    const pts = series("2026-03-01", [10, 12, 15]);
    expect(watchMetrics(pts, "2026-03-03")!.sinceAddedPct).toBeCloseTo(15 / 12 - 1);
    expect(watchMetrics(pts, "2025-01-01")!.sinceAddedPct).toBeCloseTo(0.5);
  });
});
