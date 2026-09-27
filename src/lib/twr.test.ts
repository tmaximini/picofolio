import { describe, expect, it } from "vitest";
import { dailyReturns, growthIndex } from "./twr";

const p = (time: string, dollars: number) => ({ time, valueCents: dollars * 100 });

describe("time-weighted returns", () => {
  it("removes deposits and withdrawals from performance", () => {
    const series = [p("2026-01-01", 100), p("2026-01-02", 110), p("2026-01-03", 160), p("2026-01-04", 176)];
    const flows = [p("2026-01-03", 50)]; // $50 deposit, no gain that day
    const idx = growthIndex(series, flows);
    expect(idx.at(-1)!.index - 1).toBeCloseTo(0.21); // 1.1 × 1.0 × 1.1
    // Without the flow the same series would read +76%.
    expect(growthIndex(series).at(-1)!.index - 1).toBeCloseTo(0.76);
  });

  it("treats a withdrawal as money out, not a loss", () => {
    const series = [p("2026-06-01", 1000), p("2026-06-02", 700)];
    const [d] = dailyReturns(series, [p("2026-06-02", -300)]);
    expect(d!.r).toBeCloseTo(0);
    expect(d!.pnlCents).toBe(0);
  });

  it("assigns flows on non-series days to the next series day, ignores pre-series flows", () => {
    const series = [p("2026-01-02", 100), p("2026-01-05", 150)];
    const flows = [p("2026-01-01", 999), p("2026-01-03", 50)]; // weekend deposit
    expect(dailyReturns(series, flows)[0]!.r).toBeCloseTo(0);
  });
});
