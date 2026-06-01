/**
 * Parse OCC option symbols of the form `UNDERLYING YYMMDD[CP]NNNNNNNN`.
 *
 *   - `MSFT 260529C00465000` → MSFT, 2026-05-29, Call, $465.00
 *   - `QQQ 260430P00620000`  → QQQ,  2026-04-30, Put,  $620.00
 *
 * Strike is encoded as 8 digits where the last 3 are thousandths of a
 * dollar (so $465.000 = "00465000"). Year is YY two-digit; the convention
 * is years <50 → 20YY, >=50 → 19YY.
 */

export type OptionType = "CALL" | "PUT";

export type ParsedOption = {
  underlying: string;
  /** ISO date YYYY-MM-DD */
  expiry: string;
  type: OptionType;
  strikeCents: number;
};

const OCC_RE = /^([A-Z0-9.\-]+)\s+(\d{6})([CP])(\d{8})$/;

/** Standard US equity/index option contract multiplier. */
export const OPTION_MULTIPLIER = 100;

/**
 * Price→value multiplier for a symbol. Options trade per share but settle
 * per 100-share contract, so qty × price × 100. Everything else is ×1.
 * (Futures multipliers vary by product; not modelled yet — they stay ×1.)
 */
export function contractMultiplier(symbol: string): number {
  return parseOccSymbol(symbol) ? OPTION_MULTIPLIER : 1;
}

export function parseOccSymbol(sym: string): ParsedOption | null {
  const m = sym.trim().match(OCC_RE);
  if (!m) return null;
  const [, underlying, dateStr, typeChar, strikeStr] = m;
  const yy = parseInt(dateStr!.slice(0, 2), 10);
  const mm = dateStr!.slice(2, 4);
  const dd = dateStr!.slice(4, 6);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  const expiry = `${year}-${mm}-${dd}`;
  // 8-digit strike: integer thousandths of a dollar → cents = int / 10
  const strikeCents = Math.round(parseInt(strikeStr!, 10) / 10);
  return {
    underlying: underlying!,
    expiry,
    type: typeChar === "C" ? "CALL" : "PUT",
    strikeCents,
  };
}

/** Short human label: `May 29, 2026 · $465 Call`. Year always included so
 *  close-dated and LEAPS contracts are distinguishable at a glance.
 *  Pass `includeType: false` when the surrounding UI already shows a
 *  CALL/PUT badge (avoids duplicating the word). */
export function formatOptionLabel(
  opt: ParsedOption,
  { includeType = true }: { includeType?: boolean } = {},
): string {
  const d = new Date(`${opt.expiry}T00:00:00`);
  const dateLabel = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const strikeDollars = opt.strikeCents / 100;
  const strikeLabel =
    strikeDollars % 1 === 0
      ? `$${strikeDollars.toFixed(0)}`
      : `$${strikeDollars.toFixed(2)}`;
  if (!includeType) return `${dateLabel} · ${strikeLabel}`;
  const typeLabel = opt.type === "CALL" ? "Call" : "Put";
  return `${dateLabel} · ${strikeLabel} ${typeLabel}`;
}
