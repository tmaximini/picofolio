/**
 * Market notes — freeform journal entries, independent of any trade.
 * Symbols and tags are written inline ($NVDA, #earnings) and extracted
 * automatically; the body stays the single source of truth.
 */

export type Note = {
  id: string;
  /** Optional account scope; undefined = global market note. */
  accountId?: string;
  body: string;
  /** Inline $NVDA tokens — uppercased, deduped, in order of appearance. */
  symbols: string[];
  /** Inline #earnings tokens — lowercased, deduped. */
  tags: string[];
  /** ISO 8601 UTC */
  createdAt: string;
  updatedAt?: string;
};

const SYMBOL_RE = /\$([A-Za-z]{1,6}(?:[.\-][A-Za-z])?)\b/g;
const TAG_RE = /#([\w-]+)/g;

export function extractNoteTokens(body: string): { symbols: string[]; tags: string[] } {
  const symbols = [...new Set([...body.matchAll(SYMBOL_RE)].map((m) => m[1].toUpperCase()))];
  const tags = [...new Set([...body.matchAll(TAG_RE)].map((m) => m[1].toLowerCase()))];
  return { symbols, tags };
}
