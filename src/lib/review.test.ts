import { describe, expect, it } from "vitest";
import { computeReviewInsights, DEFAULT_REVIEW_LABELS, type TradeReview } from "./review";

const done = (labelIds: string[]): TradeReview => ({ labelIds, note: "", reviewedAt: "2026-09-27T10:00:00Z" });

describe("computeReviewInsights", () => {
  const closed = [
    { id: "a", returnCents: -50000 },
    { id: "b", returnCents: -20000 },
    { id: "c", returnCents: 30000 },
    { id: "d", returnCents: 80000 },
    { id: "e", returnCents: -10000 }, // not reviewed yet
  ];
  const reviews: Record<string, TradeReview> = {
    a: done(["m-stop", "m-fomo"]),
    b: done(["m-fomo"]),
    c: done(["g-setup"]),
    d: done(["g-setup", "g-disc"]),
    e: { labelIds: ["m-stop"], note: "draft" },
  };

  it("ranks mistakes by cost and habits by profit, reviewed trades only", () => {
    const r = computeReviewInsights(closed, reviews, DEFAULT_REVIEW_LABELS);
    expect(r.reviewed).toBe(4);
    expect(r.mistakes.map((s) => [s.label.id, s.trades, s.netCents])).toEqual([
      ["m-fomo", 2, -70000],
      ["m-stop", 1, -50000],
    ]);
    expect(r.good[0]).toMatchObject({ trades: 2, netCents: 110000, winRate: 1 });
  });

  it("compares trades with mistakes against clean ones", () => {
    const r = computeReviewInsights(closed, reviews, DEFAULT_REVIEW_LABELS);
    expect(r.withMistakes).toEqual({ trades: 2, netCents: -70000, winRate: 0 });
    expect(r.clean).toEqual({ trades: 2, netCents: 110000, winRate: 1 });
  });

  it("ignores labels that were deleted", () => {
    const r = computeReviewInsights(closed, { a: done(["gone"]) }, DEFAULT_REVIEW_LABELS);
    expect(r.mistakes).toEqual([]);
    expect(r.clean.trades).toBe(1);
  });
});
