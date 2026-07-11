/**
 * FX conversion helpers. Money stays integer cents of each instrument's
 * *native major currency unit* (see money.ts); conversion to an account's
 * base currency happens at the aggregation seams in store/selectors.
 *
 * Rates ride the same Yahoo chart pipeline as equity prices: an FX series
 * is just another symbol in the prices map, keyed "{FROM}{TO}=X"
 * (e.g. "KRWUSD=X"), with daily closes for historical conversion.
 */

import type { Account, Holding } from "./mock";
import type { Trade } from "./trades";

/** Minimal structural view of a prices-map entry (avoids importing the store). */
export type FxSeriesSource = Record<
  string,
  { points?: { time: string; value: number }[]; currency?: string } | undefined
>;

/**
 * Quote "currencies" that are really 1/100 of a major unit. Yahoo quotes
 * LSE in pence (GBp/GBX), JSE in cents (ZAc), TASE in agorot (ILA);
 * normalize to the major unit at the fetch boundary (yahoo.ts).
 */
export const MINOR_UNIT_CURRENCIES: Record<string, string> = {
  GBp: "GBP",
  GBX: "GBP",
  ZAc: "ZAR",
  ILA: "ILS",
};

/**
 * Currencies Yahoo doesn't quote FX crosses for, aliased to the sibling it
 * does quote. IBKR reports offshore yuan (CNH) on China Connect trades and
 * positions, but Yahoo only lists CNY pairs ("CNHEUR=X" 404s, "CNYEUR=X"
 * exists). The two track within basis points — without the alias the rate
 * lookup falls back to 1 and CNH amounts aggregate as base currency 1:1.
 */
const FX_ALIASES: Record<string, string> = { CNH: "CNY" };

function fxCurrency(c: string): string {
  return FX_ALIASES[c] ?? c;
}

export function fxPairSymbol(from: string, to: string): string {
  return `${fxCurrency(from)}${fxCurrency(to)}=X`;
}

export function isFxSymbol(symbol: string): boolean {
  return /=X$/.test(symbol);
}

/** Latest close of the from→to series. 1 when identical; null when absent. */
export function latestFxRate(
  from: string,
  to: string,
  prices: FxSeriesSource,
): number | null {
  if (fxCurrency(from) === fxCurrency(to)) return 1;
  const points = prices[fxPairSymbol(from, to)]?.points;
  const last = points?.[points.length - 1];
  return last != null && Number.isFinite(last.value) ? last.value : null;
}

/**
 * Carry-forward rate for a YYYY-MM-DD key: the last close on or before
 * that date (FX markets close on weekends too). Null when the series is
 * missing or starts after the date.
 */
export function fxRateOnOrBefore(
  from: string,
  to: string,
  dateKey: string,
  prices: FxSeriesSource,
): number | null {
  if (fxCurrency(from) === fxCurrency(to)) return 1;
  const points = prices[fxPairSymbol(from, to)]?.points;
  if (!points || points.length === 0) return null;
  let rate: number | null = null;
  for (const p of points) {
    if (p.time > dateKey) break;
    if (Number.isFinite(p.value)) rate = p.value;
  }
  return rate;
}

export function convertCents(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

/** Native currency of a holding: explicit field, else the Yahoo quote
 *  currency of its price series, else USD. */
export function holdingCurrencyOf(h: Holding, prices: FxSeriesSource): string {
  return h.currency ?? prices[h.symbol]?.currency ?? "USD";
}

/** Portfolio-level base for the ALL view: the accounts' shared base when
 *  uniform, else USD (mixing bases has no single obvious anchor). */
export function portfolioBaseOf(accounts: Account[]): string {
  const bases = new Set(accounts.map((a) => a.baseCurrency ?? "USD"));
  return bases.size === 1 ? [...bases][0]! : "USD";
}

/**
 * Distinct FX pair symbols the app needs loaded: every holding/trade
 * currency that differs from its account's base, plus each account base
 * that differs from the portfolio base (for the ALL view).
 */
export function fxPairsNeeded(
  holdings: Holding[],
  trades: Trade[],
  accounts: Account[],
  portfolioBase: string,
  prices: FxSeriesSource,
): string[] {
  const baseOf = new Map(accounts.map((a) => [a.id, a.baseCurrency ?? "USD"]));
  const pairs = new Set<string>();
  const need = (from: string, to: string) => {
    if (from && to && fxCurrency(from) !== fxCurrency(to)) {
      pairs.add(fxPairSymbol(from, to));
    }
  };
  for (const h of holdings) {
    need(holdingCurrencyOf(h, prices), baseOf.get(h.accountId) ?? "USD");
  }
  for (const t of trades) {
    need(t.currency ?? "USD", baseOf.get(t.accountId) ?? "USD");
  }
  for (const base of baseOf.values()) {
    need(base, portfolioBase);
  }
  return [...pairs];
}
