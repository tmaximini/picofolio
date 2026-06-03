/**
 * Options-price provider — the one swappable seam for option market data.
 *
 * Scope (deliberately narrow): options data is used ONLY to mark OPEN option
 * positions to market (current mark + price-history chart). Closed option
 * trades, realized P/L and fill prices all come from the IBKR import and never
 * touch this provider.
 *
 * Today this is bound to MarketData.app with a user-supplied (BYOK) token. The
 * future managed-cloud token is a config change here — `optionsPriceProvider`
 * is the single import site, and the token is passed in per call, so swapping
 * the implementation (or how the token is sourced) doesn't ripple outward.
 */

import type { PricePoint } from "@/lib/priceHistory";
import { marketDataProvider } from "./marketdata";

export type OptionQuote = {
  /** Current mark in integer cents (mid, falling back to last). */
  markCents: number;
  bidCents?: number;
  askCents?: number;
  lastCents?: number;
};

export interface OptionsPriceProvider {
  /** Single contract quote — current, or EOD for `date` (YYYY-MM-DD). */
  getQuote(occSymbol: string, token: string, date?: string): Promise<OptionQuote>;
  /** EOD price series for [from, to) — `time` is YYYY-MM-DD, `value` dollars. */
  getHistory(
    occSymbol: string,
    token: string,
    from: string,
    to: string,
  ): Promise<PricePoint[]>;
}

/**
 * No contract found / no data — covers a renamed-or-adjusted OCC symbol after a
 * corporate action (the provider returns "as listed" and 404s the old symbol).
 * Callers map this to the calm "couldn't fetch pricing for this contract"
 * treatment rather than a hard error. We do NOT try to resolve symbol changes.
 */
export class OptionsNotFoundError extends Error {
  constructor(message = "No data for this option contract") {
    super(message);
    this.name = "OptionsNotFoundError";
  }
}

/** Any other failure (network, rate limit, bad token, unexpected shape). */
export class OptionsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptionsFetchError";
  }
}

/** The single provider instance. Swap the binding here to change providers. */
export const optionsPriceProvider: OptionsPriceProvider = marketDataProvider;
