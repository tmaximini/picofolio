/**
 * Calendar-period returns from a daily value series: months, chained into
 * years, plus since-inception. Time-weighted — pass the account's cash flows
 * (deposits, withdrawals, sub-account transfers) and they're taken out, which
 * is how IBKR reports returns. Without flows it's plain value change.
 * Ratios are fractions (0.032 = +3.2%).
 */

import { dailyReturns, type CashFlow, type ValuePoint } from "./twr";

export type { ValuePoint } from "./twr";

export type YearReturns = {
  year: number;
  /** Jan…Dec; null where the series has no data for that month. */
  months: (number | null)[];
  /** Same months in money: value change minus flows (P&L), integer cents. */
  monthsCents: (number | null)[];
  /** Months chained; null if the year has no months. */
  total: number | null;
  /** Sum of the year's monthly P&L, cents. */
  totalCents: number | null;
};

export type PeriodReturns = {
  years: YearReturns[];
  /** Latest year's chained return (YTD when that year is current). */
  ytd: number | null;
  /** Latest year in the series (the YTD year). */
  ytdYear: number | null;
  /** Last day in the series (YYYY-MM-DD) — the YTD "as of". */
  asOf: string | null;
  /** First non-zero value → latest, chained. */
  inception: number | null;
};

/** Newest-first years of monthly returns, chained from daily returns. */
export function periodReturns(series: ValuePoint[], flows: CashFlow[] = []): PeriodReturns {
  const days = dailyReturns(series, flows);
  if (days.length === 0) return { years: [], ytd: null, ytdYear: null, asOf: null, inception: null };

  const byYear = new Map<number, { growth: (number | null)[]; cents: (number | null)[] }>();
  let inceptionGrowth = 1;
  for (const d of days) {
    const year = Number(d.time.slice(0, 4));
    const month = Number(d.time.slice(5, 7)) - 1;
    const row = byYear.get(year) ?? {
      growth: Array<number | null>(12).fill(null),
      cents: Array<number | null>(12).fill(null),
    };
    row.growth[month] = (row.growth[month] ?? 1) * (1 + d.r);
    row.cents[month] = (row.cents[month] ?? 0) + d.pnlCents;
    byYear.set(year, row);
    inceptionGrowth *= 1 + d.r;
  }

  const years: YearReturns[] = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, row]) => {
      const months = row.growth.map((g) => (g == null ? null : g - 1));
      const present = months.filter((m): m is number => m != null);
      const cents = row.cents.filter((c): c is number => c != null);
      return {
        year,
        months,
        monthsCents: row.cents,
        total: present.length ? present.reduce((acc, m) => acc * (1 + m), 1) - 1 : null,
        totalCents: cents.length ? cents.reduce((a, b) => a + b, 0) : null,
      };
    });

  return {
    years,
    ytd: years[0]?.total ?? null,
    ytdYear: years[0]?.year ?? null,
    asOf: days[days.length - 1]!.time,
    inception: inceptionGrowth - 1,
  };
}
