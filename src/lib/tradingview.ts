/**
 * TradingView URL + embed helpers. Two surfaces:
 *  - tradingViewChartUrl  → external "open chart on tradingview.com" link
 *  - tradingViewEmbedUrl  → iframe src for the advanced-chart widget
 *
 * For options trades, link/embed the *underlying* ticker since TradingView
 * doesn't deep-link to individual contract chains.
 */

import { parseOccSymbol } from "./optionSymbol";
import type { Trade } from "./trades";

/** Pick the right symbol for a TradingView URL given a Trade. */
export function tradingViewSymbolFor(trade: Trade): string {
  if (trade.market === "OPTION") {
    const opt = parseOccSymbol(trade.symbol);
    if (opt) return opt.underlying;
  }
  // Strip any embedded space/extension just in case (e.g. share-class forms).
  return trade.symbol.split(" ")[0]!;
}

/** Public chart page on tradingview.com — opens in a new tab. */
export function tradingViewChartUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
}

/** Default overlay studies: 10/20/50 simple moving averages. */
const DEFAULT_MA_STUDIES = [10, 20, 50].map((length) => ({
  id: "MASimple@tv-basicstudies",
  inputs: { length },
}));

/** Embeddable widget URL (advanced-chart). Dark theme, day interval default. */
export function tradingViewEmbedUrl(
  symbol: string,
  opts: { interval?: string; theme?: "dark" | "light" } = {},
): string {
  const params = new URLSearchParams({
    symbol,
    interval: opts.interval ?? "D",
    theme: opts.theme ?? "dark",
    style: "1",
    locale: "en",
    timezone: "Etc/UTC",
    hide_side_toolbar: "0",
    allow_symbol_change: "0",
    save_image: "1",
    withdateranges: "1",
    studies: JSON.stringify(DEFAULT_MA_STUDIES),
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}
