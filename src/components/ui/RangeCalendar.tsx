import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateKeyOf, formatSpan, todayKey, type DateRange } from "@/lib/dateRange";

type RangeCalendarProps = {
  /** The currently applied range — highlighted until a new pick starts. */
  value: DateRange;
  onSelect: (fromKey: string, toKey: string) => void;
  onClose: () => void;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const monthTitle = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
function shiftKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return dateKeyOf(d);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/**
 * Two-month range picker. Click a start day, then an end day (hover previews
 * the span; either order works). Keyboard: arrows move a day / week,
 * PageUp/PageDown a month, Enter picks, Esc closes. Weeks run Sun–Sat to
 * match the P&L calendar.
 */
export function RangeCalendar({ value, onSelect, onClose }: RangeCalendarProps) {
  const today = todayKey();
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string>(value.toKey && value.toKey < today ? value.toKey : today);
  // Right-hand month shows the focused day's month; the left one precedes it.
  const [rightMonth, setRightMonth] = useState(() => {
    const d = keyToDate(focus);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-key="${focus}"]`)?.focus();
  }, [focus, rightMonth]);

  // Keep the focused day on screen when the keyboard walks off the edge.
  const moveFocus = (key: string) => {
    const d = keyToDate(key);
    const first = addMonths(rightMonth, -1);
    const lastExclusive = addMonths(rightMonth, 1);
    if (d < first) setRightMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (d >= lastExclusive) setRightMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setFocus(key);
  };

  const pick = (key: string) => {
    if (!anchor) {
      setAnchor(key);
      setHover(key);
      return;
    }
    onSelect(anchor, key);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in moves) {
      e.preventDefault();
      const next = shiftKey(focus, moves[e.key]!);
      moveFocus(next);
      if (anchor) setHover(next);
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const d = keyToDate(focus);
      d.setMonth(d.getMonth() + (e.key === "PageUp" ? -1 : 1));
      moveFocus(dateKeyOf(d));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focus);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (anchor) setAnchor(null);
      else onClose();
    }
  };

  // What to paint: the in-progress pick, or the applied range.
  const shown = useMemo<DateRange>(() => {
    if (anchor) {
      const other = hover ?? anchor;
      return anchor <= other ? { fromKey: anchor, toKey: other } : { fromKey: other, toKey: anchor };
    }
    return value;
  }, [anchor, hover, value]);

  const months = [addMonths(rightMonth, -1), rightMonth];

  return (
    <div className="rangeCal" role="dialog" aria-label="Choose a date range" onKeyDown={onKeyDown}>
      <div className="rangeCal__nav">
        <button type="button" className="rangeCal__navBtn" aria-label="Previous month" onClick={() => setRightMonth((m) => addMonths(m, -1))}>
          <ChevronLeft size={14} strokeWidth={1.75} />
        </button>
        <button type="button" className="rangeCal__navBtn" aria-label="Next month" onClick={() => setRightMonth((m) => addMonths(m, 1))}>
          <ChevronRight size={14} strokeWidth={1.75} />
        </button>
      </div>

      <div className="rangeCal__months" ref={gridRef}>
        {months.map((m) => (
          <Month
            key={m.toISOString()}
            month={m}
            today={today}
            range={shown}
            focus={focus}
            picking={anchor != null}
            onPick={pick}
            onHover={(k) => {
              if (anchor) setHover(k);
            }}
            onFocusDay={setFocus}
          />
        ))}
      </div>

      <div className="rangeCal__foot">
        <span className="rangeCal__hint">
          {anchor ? (
            <>
              <span className="mono">{formatSpan(shown)}</span> — pick an end date
            </>
          ) : (
            "Pick a start date"
          )}
        </span>
        <span className="rangeCal__keys">
          <span className="kbd">←→</span> day <span className="kbd">↵</span> pick <span className="kbd">esc</span>{" "}
          {anchor ? "restart" : "close"}
        </span>
      </div>
    </div>
  );
}

function Month({
  month,
  today,
  range,
  focus,
  picking,
  onPick,
  onHover,
  onFocusDay,
}: {
  month: Date;
  today: string;
  range: DateRange;
  focus: string;
  picking: boolean;
  onPick: (key: string) => void;
  onHover: (key: string) => void;
  onFocusDay: (key: string) => void;
}) {
  const lead = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => dateKeyOf(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  const { fromKey, toKey } = range;

  return (
    <div className="rangeCal__month">
      <div className="rangeCal__title">{monthTitle.format(month)}</div>
      <div className="rangeCal__grid" role="grid">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="rangeCal__dow" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((key, i) => {
          if (!key) return <span key={`b${i}`} />;
          const inRange = fromKey != null && toKey != null && key >= fromKey && key <= toKey;
          const cls = [
            "rangeCal__day",
            inRange && "rangeCal__day--in",
            key === fromKey && "rangeCal__day--start",
            key === toKey && "rangeCal__day--end",
            key === today && "rangeCal__day--today",
            key > today && "rangeCal__day--future",
            picking && "rangeCal__day--picking",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={key}
              type="button"
              data-key={key}
              className={cls}
              tabIndex={key === focus ? 0 : -1}
              aria-selected={inRange}
              aria-label={keyToDate(key).toDateString()}
              onClick={() => onPick(key)}
              onMouseEnter={() => onHover(key)}
              onFocus={() => onFocusDay(key)}
            >
              <span className="num">{Number(key.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
