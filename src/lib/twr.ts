/**
 * Time-weighted returns: chain daily returns with external cash flows
 * (deposits, withdrawals) taken out, so moving money in or out never reads
 * as performance. This is how IBKR reports returns; a plain value change
 * would count a withdrawal as a loss.
 *
 * A flow dated on day t (or on a day between two series points) is treated
 * as landing at the end of the next series day:
 *   r_t = (V_t − F_t) / V_{t−1} − 1
 */

export type ValuePoint = { time: string; valueCents: number };
/** External cash flow in the series' currency: + deposit, − withdrawal. */
export type CashFlow = { time: string; valueCents: number };

export type DailyReturn = {
  time: string;
  /** Fractional return for the day, flows removed. */
  r: number;
  /** Value change minus flows — the day's P&L, cents. */
  pnlCents: number;
};

/** Daily flow-adjusted returns over a value series (zero/negative values skipped). */
export function dailyReturns(series: ValuePoint[], flows: CashFlow[] = []): DailyReturn[] {
  const pts = series.filter((p) => p.valueCents > 0);
  const sortedFlows = [...flows].sort((a, b) => a.time.localeCompare(b.time));
  const out: DailyReturn[] = [];
  let f = 0;
  // Flows on or before the first point predate the series — they're already in V_0.
  while (f < sortedFlows.length && sortedFlows[f]!.time <= (pts[0]?.time ?? "")) f++;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    let flow = 0;
    while (f < sortedFlows.length && sortedFlows[f]!.time <= cur.time) {
      flow += sortedFlows[f]!.valueCents;
      f++;
    }
    out.push({
      time: cur.time,
      r: (cur.valueCents - flow) / prev.valueCents - 1,
      pnlCents: cur.valueCents - prev.valueCents - flow,
    });
  }
  return out;
}

/** Cumulative growth index (1 = start) aligned to the series' positive points. */
export function growthIndex(series: ValuePoint[], flows: CashFlow[] = []): { time: string; index: number }[] {
  const pts = series.filter((p) => p.valueCents > 0);
  if (pts.length === 0) return [];
  const out = [{ time: pts[0]!.time, index: 1 }];
  let idx = 1;
  for (const d of dailyReturns(pts, flows)) {
    idx *= 1 + d.r;
    out.push({ time: d.time, index: idx });
  }
  return out;
}
