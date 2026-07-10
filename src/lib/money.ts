/**
 * Money stored as integer cents. Formatters here are the only place
 * floats appear — purely for render.
 */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function formatCents(cents: number, compact = false): string {
  const dollars = cents / 100;
  return (compact ? usdCompact : usd).format(dollars);
}

// Per-currency formatters, cached. Non-compact omits fraction-digit
// overrides so Intl's per-currency defaults apply (USD → 2, KRW → 0).
const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${compact ? "c" : "f"}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        ...(compact
          ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
          : {}),
      });
    } catch {
      // Malformed ISO code from a broker attr must not crash render.
      f = compact ? usdCompact : usd;
    }
    moneyFormatters.set(key, f);
  }
  return f;
}

/** Like formatCents, but in any ISO 4217 currency. Cents here means
 *  hundredths of the major unit regardless of the currency's own minor
 *  unit (₩42,200 is stored as 4220000). */
export function formatMoney(
  cents: number,
  currency = "USD",
  compact = false,
): string {
  return moneyFormatter(currency, compact).format(cents / 100);
}

export function formatDelta(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  const abs = Math.abs(cents) / 100;
  return `${sign}${usd.format(abs)}`;
}

/** Signed delta in any currency (− is U+2212 to match formatDelta). */
export function formatMoneyDelta(cents: number, currency = "USD"): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${moneyFormatter(currency, false).format(Math.abs(cents) / 100)}`;
}

export function formatPct(ratio: number): string {
  return pct.format(ratio);
}

export type Tone = "gain" | "loss" | "neutral";

export function toneOf(n: number): Tone {
  if (n > 0) return "gain";
  if (n < 0) return "loss";
  return "neutral";
}
