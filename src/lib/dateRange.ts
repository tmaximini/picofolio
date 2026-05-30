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
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_3_MONTHS"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "ALL";

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
      const sun = startOfWeekSun(today);
      return { fromKey: isoDateKey(sun), toKey: isoDateKey(addDays(sun, 6)) };
    }
    case "LAST_WEEK": {
      const lastSun = addDays(startOfWeekSun(today), -7);
      return { fromKey: isoDateKey(lastSun), toKey: isoDateKey(addDays(lastSun, 6)) };
    }
    case "THIS_MONTH": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(last) };
    }
    case "LAST_MONTH": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(last) };
    }
    case "LAST_3_MONTHS": {
      const first = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(last) };
    }
    case "THIS_YEAR": {
      const first = new Date(today.getFullYear(), 0, 1);
      const last = new Date(today.getFullYear(), 11, 31);
      return { fromKey: isoDateKey(first), toKey: isoDateKey(last) };
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

export function inRange(dateKey: string, range: DateRange): boolean {
  if (range.fromKey && dateKey < range.fromKey) return false;
  if (range.toKey && dateKey > range.toKey) return false;
  return true;
}

export const DATE_RANGE_OPTIONS: ReadonlyArray<{ key: DateRangeKey; label: string }> = [
  { key: "TODAY",         label: "Today"      },
  { key: "YESTERDAY",     label: "Yesterday"  },
  { key: "THIS_WEEK",     label: "This wk."   },
  { key: "LAST_WEEK",     label: "Last wk."   },
  { key: "THIS_MONTH",    label: "This mo."   },
  { key: "LAST_MONTH",    label: "Last mo."   },
  { key: "LAST_3_MONTHS", label: "Last 3 mo." },
  { key: "THIS_YEAR",     label: "This yr."   },
  { key: "LAST_YEAR",     label: "Last yr."   },
  { key: "ALL",           label: "Reset"      },
];

export function labelForRange(key: DateRangeKey): string {
  return DATE_RANGE_OPTIONS.find((o) => o.key === key)?.label ?? key;
}
