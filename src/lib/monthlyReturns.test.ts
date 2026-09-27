import { describe, expect, it } from "vitest";
import { periodReturns } from "./monthlyReturns";

const p = (time: string, dollars: number) => ({ time, valueCents: dollars * 100 });

describe("periodReturns", () => {
  it("chains month-end to month-end, first month from the first value", () => {
    const r = periodReturns([
      p("2025-11-10", 100),
      p("2025-11-28", 110), // Nov: +10%
      p("2025-12-31", 99), // Dec: −10%
      p("2026-01-15", 120),
      p("2026-01-30", 118.8), // Jan: +20%
    ]);
    expect(r.years.map((y) => y.year)).toEqual([2026, 2025]);
    const [y26, y25] = r.years;
    expect(y25!.months[10]).toBeCloseTo(0.1);
    expect(y25!.months[11]).toBeCloseTo(-0.1);
    expect(y25!.total).toBeCloseTo(1.1 * 0.9 - 1);
    expect(y26!.months[0]).toBeCloseTo(0.2);
    expect(y26!.months[1]).toBeNull();
    expect(r.ytd).toBeCloseTo(0.2);
    expect(r.ytdYear).toBe(2026);
    expect(r.asOf).toBe("2026-01-30");
    expect(r.inception).toBeCloseTo(0.188);
  });

  it("skips pre-funding zero days and handles too-short series", () => {
    expect(periodReturns([p("2026-01-01", 0), p("2026-01-02", 50)]).years).toEqual([]);
    const r = periodReturns([p("2026-01-01", 0), p("2026-01-02", 50), p("2026-01-30", 55)]);
    expect(r.years[0]!.months[0]).toBeCloseTo(0.1);
  });
});
