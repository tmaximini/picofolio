/**
 * Date-range helpers for the journal. All ranges are inclusive [start, end)
 * in local time and serialize down to ISO date keys (YYYY-MM-DD) for fast
 * comparison against execution timestamps.
 *
 * Week boundaries are Sun–Sat (matches the calendar grid).
 */

export type DateRangeKey =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_3_MONTHS"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "ALL";

/** Default journal range — a rolling 30-day window. */
export const DEFAULT_DATE_RANGE: DateRangeKey = "LAST_30_DAYS";

export type DateRange = {
  /** ISO date key (YYYY-MM-DD), inclusive. null = no lower bound. */
  fromKey: string | null;
  /** ISO date key (YYYY-MM-DD), inclusive. null = no upper bound. */
  toKey: string | null;
};

function isoDateKey(d: Date): string {
  // Local-time YYYY-MM-DD (not UTC) so "today" matches user expectation.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function startOfWeekSun(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

export function rangeFor(key: DateRangeKey, now = new Date()): DateRange {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  switch (key) {
    case "TODAY":
      return { fromKey: isoDateKey(today), toKey: isoDateKey(today) };
    case "YESTERDAY": {
      const y = addDays(today, -1);
      return { fromKey: isoDateKey(y), toKey: isoDateKey(y) };
    }
    case "THIS_WEEK": {
      // Running periods end today — there's nothing to show in the future.
      return { fromKey: isoDateKey(startOfWeekSun(today)), toKey: isoDateKey(today) };
    }
    case "LAST_WEEK": {
      const lastSun = addDays(startOfWeekSun(today), -7);
      return { fromKey: isoDateKey(lastSun), toKey: isoDateKey(addDays(lastSun, 6)) };
    }
    case "LAST_7_DAYS":
      return { fromKey: isoDateKey(addDays(today, -6)), toKey: isoDateKey(today) };
    case "LAST_30_DAYS":
      // Rolling window: today and the 29 days before it (30 days inclusive).
      return { fromKey: isoDateKey(addDays(today, -29)), toKey: isoDateKey(today) };
    case "LAST_90_DAYS":
      return { fromKey: isoDateKey(addDays(today, -89)), toKey: isoDateKey(today) };
    case "THIS_MONTH": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(today) };
    }
    case "LAST_MONTH": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(last) };
    }
    case "LAST_3_MONTHS": {
      const first = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(today) };
    }
    case "THIS_YEAR": {
      const first = new Date(today.getFullYear(), 0, 1);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(today) };
    }
    case "LAST_YEAR": {
      const first = new Date(today.getFullYear() - 1, 0, 1);
      const last = new Date(today.getFullYear() - 1, 11, 31);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(last) };
    }
    case "ALL":
      return { fromKey: null, toKey: null };
  }
}

/** Local YYYY-MM-DD for a Date. */
export function dateKeyOf(d: Date): string {
  return isoDateKey(d);
}

/** Today's local date key (YYYY-MM-DD). */
export function todayKey(): string {
  return isoDateKey(new Date());
}

/** Every local date key in [fromKey, toKey] inclusive. Empty if inverted. */
export function eachDayKey(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let d = new Date(`${fromKey}T00:00:00`);
  const end = new Date(`${toKey}T00:00:00`);
  while (d <= end) {
    out.push(isoDateKey(d));
    d = addDays(d, 1);
  }
  return out;
}

export function inRange(dateKey: string, range: DateRange): boolean {
  if (range.fromKey && dateKey < range.fromKey) return false;
  if (range.toKey && dateKey > range.toKey) return false;
  return true;
}

/** Presets, in menu order, with a full label (menus, subtitles) and a short
 *  one (segmented quick filters). */
export const DATE_RANGE_OPTIONS: ReadonlyArray<{ key: DateRangeKey; label: string; short?: string }> = [
  { key: "TODAY",         label: "Today" },
  { key: "YESTERDAY",     label: "Yesterday" },
  { key: "THIS_WEEK",     label: "This week" },
  { key: "LAST_WEEK",     label: "Last week" },
  { key: "LAST_7_DAYS",   label: "Last 7 days",   short: "7D" },
  { key: "LAST_30_DAYS",  label: "Last 30 days",  short: "30D" },
  { key: "LAST_90_DAYS",  label: "Last 90 days",  short: "90D" },
  { key: "THIS_MONTH",    label: "This month" },
  { key: "LAST_MONTH",    label: "Last month" },
  { key: "LAST_3_MONTHS", label: "Last 3 months" },
  { key: "THIS_YEAR",     label: "This year" },
  { key: "LAST_YEAR",     label: "Last year" },
  { key: "ALL",           label: "All time" },
];

/**
 * A journal range: a named preset, one calendar month, or an explicit span.
 * Serialized as a plain string so it can live in the store and the URL:
 *   preset  "LAST_30_DAYS"              ?range=last-30-days
 *   month   "month:2026-08"             ?range=2026-08
 *   custom  "custom:2026-01-01:2026-03-31"  ?range=2026-01-01_2026-03-31
 */
export type RangeValue = DateRangeKey | `month:${string}` | `custom:${string}:${string}`;

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function isPreset(v: RangeValue): v is DateRangeKey {
  return DATE_RANGE_OPTIONS.some((o) => o.key === v);
}

export function monthRange(ym: string): RangeValue {
  return `month:${ym}`;
}

/** A custom span; the two keys are ordered, so either click order works. */
export function customRange(a: string, b: string): RangeValue {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return `custom:${from}:${to}`;
}

/** Resolve any range value to inclusive date keys. */
export function resolveRange(v: RangeValue, now = new Date()): DateRange {
  if (v.startsWith("month:")) {
    const [y, m] = v.slice(6).split("-").map(Number);
    return {
      fromKey: isoDateKey(new Date(y!, m! - 1, 1)),
      toKey: isoDateKey(new Date(y!, m!, 0)),
    };
  }
  if (v.startsWith("custom:")) {
    const [, from, to] = v.split(":");
    return { fromKey: from!, toKey: to! };
  }
  return rangeFor(v as DateRangeKey, now);
}

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShortFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "3 Aug" / "3 Aug 2026" — built by hand so every surface says "Sep", not
 *  sometimes "Sept" (ICU's en-GB) next to "Sep" elsewhere. */
const dayFmt = { format: (d: Date) => `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}` };
const dayYearFmt = { format: (d: Date) => `${dayFmt.format(d)} ${d.getUTCFullYear()}` };

const utc = (key: string) => new Date(`${key}T00:00:00Z`);

/** "Sep 26" for a YYYY-MM month key — the quick-pick chip label. */
export function shortMonthLabel(ym: string): string {
  return monthShortFmt.format(utc(`${ym}-01`)).replace(" ", " ’").replace("’’", "’");
}

/** "1 Jan – 27 Sep 2026", "3 – 9 Aug 2026", "12 Aug 2026". Open ranges → "All time". */
export function formatSpan(range: DateRange): string {
  const { fromKey, toKey } = range;
  if (!fromKey || !toKey) return "All time";
  if (fromKey === toKey) return dayYearFmt.format(utc(fromKey));
  const sameYear = fromKey.slice(0, 4) === toKey.slice(0, 4);
  const sameMonth = sameYear && fromKey.slice(0, 7) === toKey.slice(0, 7);
  const from = sameMonth ? String(Number(fromKey.slice(8))) : sameYear ? dayFmt.format(utc(fromKey)) : dayYearFmt.format(utc(fromKey));
  return `${from} – ${dayYearFmt.format(utc(toKey))}`;
}

/** Human label: the preset's name, the month's name, or the span. */
export function labelForRange(v: RangeValue): string {
  if (v.startsWith("month:")) return monthFmt.format(utc(`${v.slice(6)}-01`));
  if (v.startsWith("custom:")) return formatSpan(resolveRange(v));
  return DATE_RANGE_OPTIONS.find((o) => o.key === v)?.label ?? v;
}

/** URL-param encoding (see RangeValue). */
export function rangeToParam(v: RangeValue): string {
  if (v.startsWith("month:")) return v.slice(6);
  if (v.startsWith("custom:")) {
    const [, from, to] = v.split(":");
    return `${from}_${to}`;
  }
  return v.toLowerCase().replace(/_/g, "-");
}

/** Parse a `?range=` param, or null if absent/invalid. */
export function paramToRange(param: string | null): RangeValue | null {
  if (!param) return null;
  if (MONTH_RE.test(param)) return monthRange(param);
  const custom = param.split("_");
  if (custom.length === 2 && KEY_RE.test(custom[0]!) && KEY_RE.test(custom[1]!)) {
    return customRange(custom[0]!, custom[1]!);
  }
  const key = param.toUpperCase().replace(/-/g, "_") as DateRangeKey;
  return isPreset(key) ? key : null;
}

/** The current and two previous calendar months, newest first (YYYY-MM). */
export function recentMonths(n = 3, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

const relativeFmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 minutes ago", "3 months ago" — for last-sync style labels. */
export function formatRelativeTime(ms: number, now = Date.now()): string {
  const s = Math.round((ms - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86_400],
    ["week", 604_800],
    ["month", 2_629_800],
    ["year", 31_557_600],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let size = 60;
  for (const [u, n] of units) {
    if (abs >= n * (u === "minute" ? 1 : 0.9)) {
      unit = u;
      size = n;
    }
  }
  return relativeFmt.format(Math.round(s / size), unit);
}
