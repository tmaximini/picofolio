/**
 * MarketData.app options-price provider.
 *
 * Hits the v1 options-quotes endpoint via the Vite dev proxy (/api/marketdata/*),
 * authenticated with a Bearer token (BYOK). When Tauri lands this moves to a
 * Rust command and the proxy goes away — mirrors the Yahoo/IBKR pattern.
 *
 * Symbology: IBKR gives us OCC symbols with a space (`GOOG 270617C00460000`);
 * MarketData wants the compact OSI form (`GOOG270617C00460000`). `toOsiSymbol`
 * handles the conversion — no other translation is needed.
 *
 * Docs: https://www.marketdata.app/docs/api/options/quotes
 */

import type { PricePoint } from "@/lib/priceHistory";
import { toOsiSymbol } from "@/lib/optionSymbol";
import {
  OptionsFetchError,
  OptionsNotFoundError,
  type OptionQuote,
  type OptionsPriceProvider,
} from "./provider";

/**
 * Columnar response shape — every field is an array, one element per data
 * point (a single quote is just length-1). `s` is the status; `updated` is a
 * unix timestamp (seconds). We only consume price + timestamp fields.
 */
type QuotesResponse = {
  s: "ok" | "no_data" | "error";
  errmsg?: string;
  optionSymbol?: string[];
  bid?: Array<number | null>;
  ask?: Array<number | null>;
  mid?: Array<number | null>;
  last?: Array<number | null>;
  updated?: number[];
};

function dollarsToCents(v: number | null | undefined): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return Math.round(v * 100);
}

async function request(
  osiSymbol: string,
  token: string,
  params: Record<string, string>,
): Promise<QuotesResponse> {
  const qs = new URLSearchParams(params).toString();
  const url = `/api/marketdata/v1/options/quotes/${encodeURIComponent(osiSymbol)}/${
    qs ? `?${qs}` : ""
  }`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new OptionsFetchError(
      err instanceof Error ? err.message : "Network error",
    );
  }

  // 404 is MarketData's "no data" signal (also surfaced as s:"no_data").
  if (res.status === 404) {
    throw new OptionsNotFoundError();
  }
  if (res.status === 401 || res.status === 403) {
    throw new OptionsFetchError("MarketData.app rejected the token");
  }
  if (res.status === 429) {
    throw new OptionsFetchError("MarketData.app rate limit reached");
  }
  if (!res.ok) {
    throw new OptionsFetchError(`MarketData.app ${res.status}`);
  }

  let json: QuotesResponse;
  try {
    json = (await res.json()) as QuotesResponse;
  } catch {
    throw new OptionsFetchError("Malformed MarketData.app response");
  }

  if (json.s === "no_data") {
    throw new OptionsNotFoundError(json.errmsg ?? undefined);
  }
  if (json.s !== "ok") {
    throw new OptionsFetchError(json.errmsg ?? "MarketData.app error");
  }
  return json;
}

/** Pick the mark for index `i`: mid, falling back to last. */
function markCentsAt(json: QuotesResponse, i: number): number | undefined {
  return dollarsToCents(json.mid?.[i]) ?? dollarsToCents(json.last?.[i]);
}

export const marketDataProvider: OptionsPriceProvider = {
  async getQuote(occSymbol, token, date) {
    const osi = toOsiSymbol(occSymbol);
    const json = await request(osi, token, date ? { date } : {});
    const markCents = markCentsAt(json, 0);
    if (markCents == null) {
      throw new OptionsNotFoundError();
    }
    return {
      markCents,
      bidCents: dollarsToCents(json.bid?.[0]),
      askCents: dollarsToCents(json.ask?.[0]),
      lastCents: dollarsToCents(json.last?.[0]),
    } satisfies OptionQuote;
  },

  async getHistory(occSymbol, token, from, to) {
    const osi = toOsiSymbol(occSymbol);
    const json = await request(osi, token, { from, to });
    const updated = json.updated ?? [];
    const out: PricePoint[] = [];
    for (let i = 0; i < updated.length; i++) {
      const mark = json.mid?.[i] ?? json.last?.[i];
      if (mark == null || !Number.isFinite(mark)) continue;
      const ts = updated[i];
      if (ts == null) continue;
      out.push({ time: new Date(ts * 1000).toISOString().slice(0, 10), value: mark });
    }
    if (out.length === 0) {
      throw new OptionsNotFoundError();
    }
    return out;
  },
};
