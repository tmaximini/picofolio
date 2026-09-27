import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import {
  DATE_RANGE_OPTIONS,
  customRange,
  formatSpan,
  isPreset,
  labelForRange,
  monthRange,
  recentMonths,
  resolveRange,
  shortMonthLabel,
  type DateRangeKey,
  type RangeValue,
} from "@/lib/dateRange";
import { RangeCalendar } from "./RangeCalendar";

type DateRangeControlProps = {
  value: RangeValue;
  onChange: (next: RangeValue) => void;
};

const QUICK: DateRangeKey[] = ["LAST_7_DAYS", "LAST_30_DAYS", "LAST_90_DAYS"];

/**
 * Journal period picker: rolling windows (7D / 30D / 90D), the last three
 * calendar months, a two-month range calendar for anything custom, and a
 * menu of every named period. Exactly one of them reads as active.
 */
export function DateRangeControl({ value, onChange }: DateRangeControlProps) {
  const [open, setOpen] = useState<"calendar" | "menu" | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const months = recentMonths(3);
  const span = formatSpan(resolveRange(value));
  const menuPreset = isPreset(value) && !QUICK.includes(value) ? value : null;

  // Click outside closes whichever popover is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (v: RangeValue) => {
    onChange(v);
    setOpen(null);
  };

  return (
    <div className="rangeBar" ref={rootRef}>
      <div className="segGroup" role="group" aria-label="Rolling window">
        {QUICK.map((k) => (
          <button
            key={k}
            type="button"
            className={value === k ? "segGroup__btn segGroup__btn--on" : "segGroup__btn"}
            aria-pressed={value === k}
            title={labelForRange(k)}
            onClick={() => choose(k)}
          >
            {DATE_RANGE_OPTIONS.find((o) => o.key === k)?.short}
          </button>
        ))}
      </div>

      <div className="segGroup" role="group" aria-label="Month">
        {months.map((ym) => {
          const v = monthRange(ym);
          return (
            <button
              key={ym}
              type="button"
              className={value === v ? "segGroup__btn segGroup__btn--on" : "segGroup__btn"}
              aria-pressed={value === v}
              title={labelForRange(v)}
              onClick={() => choose(v)}
            >
              {shortMonthLabel(ym)}
            </button>
          );
        })}
      </div>

      <div className="rangeBar__pop">
        <button
          type="button"
          className={value.startsWith("custom:") ? "rangeBar__btn rangeBar__btn--on" : "rangeBar__btn"}
          aria-haspopup="dialog"
          aria-expanded={open === "calendar"}
          onClick={() => setOpen((o) => (o === "calendar" ? null : "calendar"))}
        >
          <CalendarDays size={14} strokeWidth={1.5} />
          <span className="num">{span}</span>
        </button>
        {open === "calendar" && (
          <RangeCalendar
            value={resolveRange(value)}
            onSelect={(a, b) => choose(customRange(a, b))}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      <div className="rangeBar__pop">
        <button
          type="button"
          className={menuPreset ? "rangeBar__btn rangeBar__btn--menu rangeBar__btn--on" : "rangeBar__btn rangeBar__btn--menu"}
          aria-haspopup="listbox"
          aria-expanded={open === "menu"}
          onClick={() => setOpen((o) => (o === "menu" ? null : "menu"))}
        >
          <span>{menuPreset ? labelForRange(menuPreset) : "More periods"}</span>
          <ChevronDown size={13} strokeWidth={1.75} />
        </button>
        {open === "menu" && <PresetMenu value={value} onPick={choose} onClose={() => setOpen(null)} />}
      </div>
    </div>
  );
}

function PresetMenu({
  value,
  onPick,
  onClose,
}: {
  value: RangeValue;
  onPick: (v: RangeValue) => void;
  onClose: () => void;
}) {
  const items = DATE_RANGE_OPTIONS.filter((o) => !QUICK.includes(o.key));
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((o) => o.key === value)));
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(items[active]!.key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <ul
      className="rangeMenu"
      role="listbox"
      tabIndex={-1}
      ref={listRef}
      aria-label="Periods"
      aria-activedescendant={`range-opt-${items[active]!.key}`}
      onKeyDown={onKeyDown}
    >
      {items.map((o, i) => (
        <li
          key={o.key}
          id={`range-opt-${o.key}`}
          role="option"
          aria-selected={o.key === value}
          className={i === active ? "rangeMenu__item rangeMenu__item--active" : "rangeMenu__item"}
          onMouseEnter={() => setActive(i)}
          onClick={() => onPick(o.key)}
        >
          <span>{o.label}</span>
          <span className="rangeMenu__span num">{o.key === "ALL" ? "" : formatSpan(resolveRange(o.key))}</span>
          {o.key === value && <Check size={13} strokeWidth={2} className="rangeMenu__check" />}
        </li>
      ))}
    </ul>
  );
}
