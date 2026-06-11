/**
 * Parser for the "New Setup" terminal input. One forgiving line in,
 * structured setup out:
 *
 *   long nvda @142 t160 s135 watch for breakout
 *
 * Grammar (whitespace-tokenized, order-insensitive):
 *   side    "long" | "short" (case-insensitive; defaults LONG)
 *   symbol  "$TSLA" anywhere always wins; otherwise the first bare
 *           alpha token that isn't a keyword (bare "t"/"s" are reserved
 *           for target/stop — use "$T" / "$S" for those tickers)
 *   entry   "@142" or "@ 142"
 *   target  "t160" / "t:160" / "t 160"
 *   stop    "s135" / "s:135" / "s 135"
 *   numbers support thousands commas and decimals ("1,234.50")
 *   positional fallback: leftover bare numbers fill entry → target → stop
 *   notes   everything unconsumed, in original order
 */

import type { Side, TradeSetup } from "./trades";

export type ParsedSetup = {
  side: Side;
  symbol: string | null;
  entryCents: number | null;
  targetCents: number | null;
  stopCents: number | null;
  notes: string;
  missing: ("symbol" | "entry" | "target" | "stop")[];
};

const NUM = /^\d+(?:,\d{3})*(?:\.\d+)?$/;
const TICKER = /^[a-z]{1,6}(?:[.\-][a-z])?$/i;

/** Serialize a setup back into its command-line form — used to reopen a
 *  saved setup in the terminal for editing. Round-trips through
 *  parseSetupCommand. */
export function setupToCommand(setup: TradeSetup): string {
  const num = (cents: number) => String(parseFloat((cents / 100).toFixed(2)));
  const parts = [
    setup.side.toLowerCase(),
    `$${setup.symbol.toLowerCase()}`,
    `@${num(setup.entryCents)}`,
    `t${num(setup.targetCents)}`,
    `s${num(setup.stopCents)}`,
  ];
  if (setup.notes) parts.push(setup.notes);
  return parts.join(" ");
}

function toCents(raw: string): number {
  return Math.round(parseFloat(raw.replace(/,/g, "")) * 100);
}

export function parseSetupCommand(input: string): ParsedSetup {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const consumed = new Array<boolean>(tokens.length).fill(false);

  let side: Side = "LONG";
  let sideSet = false;
  let symbol: string | null = null;
  let entryCents: number | null = null;
  let targetCents: number | null = null;
  let stopCents: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue;
    const tok = tokens[i];
    const lower = tok.toLowerCase();
    const next = i + 1 < tokens.length && !consumed[i + 1] ? tokens[i + 1] : null;

    if (!sideSet && (lower === "long" || lower === "short")) {
      side = lower === "long" ? "LONG" : "SHORT";
      sideSet = true;
      consumed[i] = true;
      continue;
    }

    // "$NVDA" — explicit symbol sigil always wins.
    if (symbol == null && tok.startsWith("$") && TICKER.test(tok.slice(1))) {
      symbol = tok.slice(1).toUpperCase();
      consumed[i] = true;
      continue;
    }

    // "@142" / "@ 142"
    if (entryCents == null) {
      const joined = tok.match(/^@(.+)$/);
      if (joined && NUM.test(joined[1])) {
        entryCents = toCents(joined[1]);
        consumed[i] = true;
        continue;
      }
      if (tok === "@" && next && NUM.test(next)) {
        entryCents = toCents(next);
        consumed[i] = consumed[i + 1] = true;
        continue;
      }
    }

    // "t160" / "t:160" / "s135" / "s:135"
    const prefixed = tok.match(/^([ts]):?(.+)$/i);
    if (prefixed && NUM.test(prefixed[2])) {
      const isTarget = prefixed[1].toLowerCase() === "t";
      if (isTarget && targetCents == null) {
        targetCents = toCents(prefixed[2]);
        consumed[i] = true;
        continue;
      }
      if (!isTarget && stopCents == null) {
        stopCents = toCents(prefixed[2]);
        consumed[i] = true;
        continue;
      }
    }

    // bare "t 160" / "s 135"
    if ((lower === "t" || lower === "s") && next && NUM.test(next)) {
      if (lower === "t" && targetCents == null) {
        targetCents = toCents(next);
        consumed[i] = consumed[i + 1] = true;
        continue;
      }
      if (lower === "s" && stopCents == null) {
        stopCents = toCents(next);
        consumed[i] = consumed[i + 1] = true;
        continue;
      }
    }
  }

  // Symbol fallback: first unconsumed bare alpha token. Bare "t"/"s" stay
  // reserved (dangling prefixes read as notes, real tickers use "$T").
  if (symbol == null) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumed[i]) continue;
      const lower = tokens[i].toLowerCase();
      if (lower === "t" || lower === "s") continue;
      if (TICKER.test(tokens[i])) {
        symbol = tokens[i].toUpperCase();
        consumed[i] = true;
        break;
      }
    }
  }

  // Positional fallback: leftover bare numbers fill entry → target → stop.
  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i] || !NUM.test(tokens[i])) continue;
    if (entryCents == null) entryCents = toCents(tokens[i]);
    else if (targetCents == null) targetCents = toCents(tokens[i]);
    else if (stopCents == null) stopCents = toCents(tokens[i]);
    else continue;
    consumed[i] = true;
  }

  const notes = tokens.filter((_, i) => !consumed[i]).join(" ");

  const missing: ParsedSetup["missing"] = [];
  if (symbol == null) missing.push("symbol");
  if (entryCents == null) missing.push("entry");
  if (targetCents == null) missing.push("target");
  if (stopCents == null) missing.push("stop");

  return { side, symbol, entryCents, targetCents, stopCents, notes, missing };
}
