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
    // Absolute: value change in cents, summed per year.
    expect(y25!.monthsCents[10]).toBe(1000);
    expect(y25!.monthsCents[11]).toBe(-1100);
    expect(y25!.totalCents).toBe(-100);
    expect(y26!.monthsCents[0]).toBe(1980);
  });

  it("skips pre-funding zero days and handles too-short series", () => {
    expect(periodReturns([p("2026-01-01", 0), p("2026-01-02", 50)]).years).toEqual([]);
    const r = periodReturns([p("2026-01-01", 0), p("2026-01-02", 50), p("2026-01-30", 55)]);
    expect(r.years[0]!.months[0]).toBeCloseTo(0.1);
  });
});

describe("periodReturns with cash flows", () => {
  it("takes a mid-year transfer out of the month and the year", () => {
    const r = periodReturns(
      [p("2026-05-29", 1000), p("2026-06-12", 700), p("2026-06-30", 770)],
      [p("2026-06-12", -300)], // cash moved to another sub-account
    );
    const jun = r.years[0]!.months[5]!;
    expect(jun).toBeCloseTo(0.1); // 1000→700 is the transfer; 700→770 is +10%
    expect(r.years[0]!.monthsCents[5]).toBe(7000);
    expect(r.ytd).toBeCloseTo(0.1);
  });
});
