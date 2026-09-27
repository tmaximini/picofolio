/**
 * Calendar-period returns from a daily value series: month-over-month,
 * chained into years, plus since-inception. Same model as the Overview
 * return chart (value vs value) — deposits and withdrawals inside a month
 * move the number too, since broker NAV history carries no cash flows.
 * Ratios are fractions (0.032 = +3.2%).
 */

export type ValuePoint = { time: string; valueCents: number };

export type YearReturns = {
  year: number;
  /** Jan…Dec; null where the series has no data for that month. */
  months: (number | null)[];
  /** Months chained; null if the year has no months. */
  total: number | null;
};

export type PeriodReturns = {
  years: YearReturns[];
  /** Latest year's chained return (YTD when that year is current). */
  ytd: number | null;
  /** Latest year in the series (the YTD year). */
  ytdYear: number | null;
  /** Last day in the series (YYYY-MM-DD) — the YTD "as of". */
  asOf: string | null;
  /** First non-zero value → latest value. */
  inception: number | null;
};

/** Newest-first years, each month = last close vs the prior month's last close. */
export function periodReturns(series: ValuePoint[]): PeriodReturns {
  const pts = series.filter((p) => p.valueCents > 0);
  const empty = { years: [], ytd: null, ytdYear: null, asOf: null, inception: null };
  if (pts.length < 2) return empty;

  // Last value of each YYYY-MM, in order.
  const monthEnds = new Map<string, number>();
  for (const p of pts) monthEnds.set(p.time.slice(0, 7), p.valueCents);

  const byYear = new Map<number, (number | null)[]>();
  // The first month's base is the series' first value (partial month).
  let prev = pts[0]!.valueCents;
  for (const [ym, end] of monthEnds) {
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7)) - 1;
    const months = byYear.get(year) ?? Array<number | null>(12).fill(null);
    months[month] = end / prev - 1;
    byYear.set(year, months);
    prev = end;
  }

  const years: YearReturns[] = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => {
      const present = months.filter((m): m is number => m != null);
      const total = present.length
        ? present.reduce((acc, m) => acc * (1 + m), 1) - 1
        : null;
      return { year, months, total };
    });

  const first = pts[0]!.valueCents;
  const last = pts[pts.length - 1]!;
  return {
    years,
    ytd: years[0]?.total ?? null,
    ytdYear: years[0]?.year ?? null,
    asOf: last.time,
    inception: last.valueCents / first - 1,
  };
}
