/**
 * Trade review: label closed trades with the mistakes and good habits behind
 * them, jot a note, and learn which patterns cost or earn money over time.
 * Labels are user-editable; each carries a colour dot (the account palette)
 * and a kind that decides which side of the insights it lands on.
 */

export type ReviewLabelKind = "mistake" | "good";

export type ReviewLabel = {
  id: string;
  name: string;
  color: string;
  kind: ReviewLabelKind;
};

export type TradeReview = {
  labelIds: string[];
  note: string;
  /** ISO time it was marked reviewed; absent = labelled/noted but not done. */
  reviewedAt?: string;
};

/** Starter set — common trading-journal failure modes and the habits that
 *  counter them. Users can rename, recolour, delete and add. */
export const DEFAULT_REVIEW_LABELS: ReviewLabel[] = [
  { id: "m-stop", name: "Missed stop loss", color: "#E5746B", kind: "mistake" },
  { id: "m-fomo", name: "FOMO entry", color: "#D9A86C", kind: "mistake" },
  { id: "m-no-exit", name: "No exit plan", color: "#C9A227", kind: "mistake" },
  { id: "m-size", name: "Oversized", color: "#9C8FB0", kind: "mistake" },
  { id: "m-revenge", name: "Revenge trade", color: "#E5746B", kind: "mistake" },
  { id: "m-chase", name: "Chased the entry", color: "#D9A86C", kind: "mistake" },
  { id: "m-early", name: "Exited too early", color: "#C9A227", kind: "mistake" },
  { id: "m-held", name: "Held a loser too long", color: "#9C8FB0", kind: "mistake" },
  { id: "g-setup", name: "Followed the setup", color: "#6BCB97", kind: "good" },
  { id: "g-disc", name: "Disciplined exit", color: "#5FB8A8", kind: "good" },
  { id: "g-rr", name: "Good risk/reward", color: "#5FA8D3", kind: "good" },
  { id: "g-patient", name: "Patient entry", color: "#7D77C3", kind: "good" },
  { id: "g-cut", name: "Cut the loss quickly", color: "#6BCB97", kind: "good" },
];

export function isReviewed(r: TradeReview | undefined): boolean {
  return r?.reviewedAt != null;
}

export type ClosedTradeResult = { id: string; returnCents: number };

export type LabelStat = {
  label: ReviewLabel;
  trades: number;
  netCents: number;
  wins: number;
  winRate: number;
  avgCents: number;
};

export type GroupStat = { trades: number; netCents: number; winRate: number };

export type ReviewInsights = {
  closed: number;
  reviewed: number;
  /** Per label with at least one trade; mistakes sorted costliest first,
   *  good habits most profitable first. */
  mistakes: LabelStat[];
  good: LabelStat[];
  /** Reviewed trades carrying at least one mistake label… */
  withMistakes: GroupStat;
  /** …versus reviewed trades with none. */
  clean: GroupStat;
};

function group(results: ClosedTradeResult[]): GroupStat {
  const wins = results.filter((r) => r.returnCents > 0).length;
  return {
    trades: results.length,
    netCents: results.reduce((a, r) => a + r.returnCents, 0),
    winRate: results.length ? wins / results.length : 0,
  };
}

/** Aggregate reviews over closed trades (returns already in one currency). */
export function computeReviewInsights(
  closed: ClosedTradeResult[],
  reviews: Record<string, TradeReview>,
  labels: ReviewLabel[],
): ReviewInsights {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const reviewed = closed.filter((t) => isReviewed(reviews[t.id]));
  const perLabel = new Map<string, ClosedTradeResult[]>();
  for (const t of reviewed) {
    for (const id of reviews[t.id]!.labelIds) {
      if (!byId.has(id)) continue; // label since deleted
      perLabel.set(id, [...(perLabel.get(id) ?? []), t]);
    }
  }
  const stats: LabelStat[] = [...perLabel.entries()].map(([id, ts]) => {
    const g = group(ts);
    return {
      label: byId.get(id)!,
      trades: g.trades,
      netCents: g.netCents,
      wins: ts.filter((t) => t.returnCents > 0).length,
      winRate: g.winRate,
      avgCents: g.trades ? Math.round(g.netCents / g.trades) : 0,
    };
  });
  const hasMistake = (t: ClosedTradeResult) =>
    reviews[t.id]!.labelIds.some((id) => byId.get(id)?.kind === "mistake");
  return {
    closed: closed.length,
    reviewed: reviewed.length,
    mistakes: stats.filter((s) => s.label.kind === "mistake").sort((a, b) => a.netCents - b.netCents),
    good: stats.filter((s) => s.label.kind === "good").sort((a, b) => b.netCents - a.netCents),
    withMistakes: group(reviewed.filter(hasMistake)),
    clean: group(reviewed.filter((t) => !hasMistake(t))),
  };
}
