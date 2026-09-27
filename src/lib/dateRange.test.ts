import { describe, expect, it } from "vitest";
import {
  customRange,
  formatSpan,
  labelForRange,
  paramToRange,
  rangeToParam,
  recentMonths,
  resolveRange,
  shortMonthLabel,
} from "./dateRange";

describe("range values", () => {
  it("round-trips presets, months and custom spans through the URL", () => {
    for (const v of ["LAST_30_DAYS", "THIS_YEAR", "month:2026-08", "custom:2026-01-01:2026-03-31"] as const) {
      expect(paramToRange(rangeToParam(v))).toBe(v);
    }
    expect(rangeToParam("month:2026-08")).toBe("2026-08");
    expect(rangeToParam("custom:2026-01-01:2026-03-31")).toBe("2026-01-01_2026-03-31");
    expect(paramToRange("this-year")).toBe("THIS_YEAR"); // old links keep working
    expect(paramToRange("nonsense")).toBeNull();
  });

  it("orders custom endpoints and resolves months to their full span", () => {
    expect(customRange("2026-03-31", "2026-01-01")).toBe("custom:2026-01-01:2026-03-31");
    expect(resolveRange("month:2026-02")).toEqual({ fromKey: "2026-02-01", toKey: "2026-02-28" });
    expect(resolveRange("custom:2026-01-05:2026-01-09")).toEqual({ fromKey: "2026-01-05", toKey: "2026-01-09" });
  });

  it("labels ranges for people", () => {
    expect(labelForRange("LAST_90_DAYS")).toBe("Last 90 days");
    expect(labelForRange("month:2026-08")).toBe("August 2026");
    expect(formatSpan({ fromKey: "2026-01-01", toKey: "2026-09-27" })).toBe("1 Jan – 27 Sep 2026");
    expect(formatSpan({ fromKey: "2026-08-03", toKey: "2026-08-09" })).toMatch(/^3 – 9 Aug 2026$/);
    expect(formatSpan({ fromKey: "2025-12-20", toKey: "2026-01-04" })).toMatch(/^20 Dec 2025 – 4 Jan 2026$/);
    expect(formatSpan({ fromKey: null, toKey: null })).toBe("All time");
    expect(shortMonthLabel("2026-09")).toBe("Sep ’26");
  });

  it("ends running periods today", () => {
    const now = new Date(2026, 8, 27);
    expect(resolveRange("THIS_YEAR", now)).toEqual({ fromKey: "2026-01-01", toKey: "2026-09-27" });
    expect(resolveRange("THIS_MONTH", now)).toEqual({ fromKey: "2026-09-01", toKey: "2026-09-27" });
  });

  it("lists recent months newest first, across a year boundary", () => {
    expect(recentMonths(3, new Date(2026, 0, 15))).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});
