/**
 * Per-derived-value selectors. Each hook returns a primitive (or null
 * when data isn't ready), so Zustand's default Object.is equality
 * keeps re-renders surgical — a row only re-renders when its specific
 * value changes.
 *
 * `null` means "data not yet available". `0` means "computed and zero".
 * Components decide how to render the difference.
 */

import { useStore } from "./index";
import type { PricePoint } from "@/lib/priceHistory";
import type { Holding } from "@/lib/mock";

export type DeltaPeriod = "1D" | "1W" | "1M" | "YTD" | "1Y";

// ---------- raw lookups ----------

export const useHolding = (symbol: string): Holding | undefined =>
  useStore((s) => s.holdings.find((h) => h.symbol === symbol));

export const useHoldings = () => useStore((s) => s.holdings);
export const useAccounts = () => useStore((s) => s.accounts);
export const useWeeklyPnl = () => useStore((s) => s.weeklyPnl);

export const usePriceStatus = (symbol: string) =>
  useStore((s) => s.prices[symbol]?.status ?? "idle");

export const usePricePoints = (symbol: string): PricePoint[] | null =>
  useStore((s) => s.prices[symbol]?.points ?? null);

// ---------- price-derived ----------

export const useLatestPrice = (symbol: string): number | null =>
  useStore((s) => {
    const pts = s.prices[symbol]?.points;
    return pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
  });

/** Returns dollars (not cents) for math; convert at the render boundary. */
function refPriceFor(points: PricePoint[], period: DeltaPeriod): number | null {
  if (points.length < 2) return null;
  switch (period) {
    case "1D":
      return points[points.length - 2]?.value ?? null;
    case "1W":
      return points[Math.max(0, points.length - 6)]?.value ?? null;
    case "1M":
      return points[Math.max(0, points.length - 22)]?.value ?? null;
    case "1Y":
      return points[Math.max(0, points.length - 252)]?.value ?? null;
    case "YTD": {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      return points.find((p) => p.time >= yearStart)?.value ?? null;
    }
  }
}

export const useHoldingDelta = (
  symbol: string,
  period: DeltaPeriod,
): number | null =>
  useStore((s) => {
    const pts = s.prices[symbol]?.points;
    if (!pts || pts.length < 2) return null;
    const last = pts[pts.length - 1]!.value;
    const ref = refPriceFor(pts, period);
    if (ref == null || ref === 0) return null;
    return (last - ref) / ref;
  });

/** Market value in integer cents (qty × latest price), or null if no price. */
export const useHoldingValueCents = (symbol: string): number | null =>
  useStore((s) => {
    const h = s.holdings.find((x) => x.symbol === symbol);
    const pts = s.prices[symbol]?.points;
    const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
    if (!h || last == null) return null;
    return Math.round(h.qty * last * 100);
  });

export const useUnrealizedCents = (symbol: string): number | null =>
  useStore((s) => {
    const h = s.holdings.find((x) => x.symbol === symbol);
    const pts = s.prices[symbol]?.points;
    const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
    if (!h || last == null) return null;
    const value = Math.round(h.qty * last * 100);
    const basis = h.qty * h.avgCostCents;
    return value - basis;
  });

// ---------- account aggregates ----------

/**
 * Account market value (sum of holding values for that account name + cash).
 * Returns null if any holding in the account is missing a price — we'd
 * rather show "—" than a misleading partial total.
 */
export const useAccountValueCents = (accountName: string): number | null =>
  useStore((s) => {
    const account = s.accounts.find((a) => a.name === accountName);
    if (!account) return null;
    const rows = s.holdings.filter((h) => h.account === accountName);
    let total = account.cashCents;
    for (const h of rows) {
      const pts = s.prices[h.symbol]?.points;
      const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
      if (last == null) return null;
      total += Math.round(h.qty * last * 100);
    }
    return total;
  });

export const useAccountDeltaCents = (
  accountName: string,
  period: DeltaPeriod,
): number | null =>
  useStore((s) => {
    const rows = s.holdings.filter((h) => h.account === accountName);
    let total = 0;
    for (const h of rows) {
      const pts = s.prices[h.symbol]?.points;
      if (!pts || pts.length < 2) return null;
      const last = pts[pts.length - 1]!.value;
      const ref = refPriceFor(pts, period);
      if (ref == null) return null;
      total += Math.round(h.qty * (last - ref) * 100);
    }
    return total;
  });

// ---------- portfolio totals ----------

export const usePortfolioValueCents = (): number | null =>
  useStore((s) => {
    let total = 0;
    for (const a of s.accounts) total += a.cashCents;
    for (const h of s.holdings) {
      const pts = s.prices[h.symbol]?.points;
      const last = pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
      if (last == null) return null;
      total += Math.round(h.qty * last * 100);
    }
    return total;
  });

export const usePortfolioDeltaCents = (period: DeltaPeriod): number | null =>
  useStore((s) => {
    let total = 0;
    for (const h of s.holdings) {
      const pts = s.prices[h.symbol]?.points;
      if (!pts || pts.length < 2) return null;
      const last = pts[pts.length - 1]!.value;
      const ref = refPriceFor(pts, period);
      if (ref == null) return null;
      total += Math.round(h.qty * (last - ref) * 100);
    }
    return total;
  });

// ---------- actions (re-exported for ergonomic access) ----------

export const useLoadPrice = () => useStore((s) => s.loadPrice);
export const useRefreshAll = () => useStore((s) => s.refreshAll);
export const useSyncing = () => useStore((s) => s.syncing);
export const useLastSyncAt = () => useStore((s) => s.lastSyncAt);
