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

export function formatDelta(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  const abs = Math.abs(cents) / 100;
  return `${sign}${usd.format(abs).replace("$", "$")}`;
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
