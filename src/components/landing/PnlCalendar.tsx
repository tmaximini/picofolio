import { useMemo, type CSSProperties } from "react";
import { formatMoney, formatMoneyDelta } from "@/lib/money";
import { useInView } from "@/lib/useInView";
import { calendarMonth } from "./demoData";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
/** The sample month opens on a Wednesday — two blank cells lead. */
const LEAD = 2;

function compact(cents: number): string {
  const abs = Math.abs(cents);
  const s = abs >= 100000 ? `€${(abs / 100000).toFixed(1)}k` : formatMoney(abs, "EUR", true);
  return `${cents > 0 ? "+" : "−"}${s}`;
}

/** A month of sessions, lit in a diagonal wave — intensity is magnitude. */
export function PnlCalendar() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });
  const days = useMemo(() => calendarMonth(), []);
  const max = Math.max(...days.map(Math.abs));
  const total = days.reduce((a, b) => a + b, 0);
  const traded = days.filter((d) => d !== 0);
  const wins = traded.filter((d) => d > 0).length;
  const best = Math.max(...days);

  const cells: (number | null)[] = [...Array<null>(LEAD).fill(null), ...days];
  while (cells.length % 5) cells.push(null);

  return (
    <div className={inView ? "cal cal--on" : "cal"} ref={ref}>
      <div className="cal__head">
        <span className="cal__month">September <span className="num">2026</span></span>
        <span className="demoHead__val num tone-gain">{formatMoneyDelta(total, "EUR")}</span>
      </div>
      <div className="cal__grid">
        {WEEKDAYS.map((d) => (
          <span className="cal__dow" key={d}>{d}</span>
        ))}
        {cells.map((v, i) => {
          const row = Math.floor(i / 5);
          const col = i % 5;
          if (v == null) return <span className="cal__cell cal__cell--blank" key={i} />;
          const tone = v > 0 ? "gain" : v < 0 ? "loss" : "flat";
          return (
            <span
              key={i}
              className={`cal__cell cal__cell--${tone}`}
              style={{ "--m": Math.abs(v) / max, "--w": row + col } as CSSProperties}
            >
              <span className="cal__day num">{i - LEAD + 1}</span>
              <span className="cal__amt num">{v === 0 ? "—" : compact(v)}</span>
            </span>
          );
        })}
      </div>
      <div className="cal__stats">
        <div>
          <span className="eyebrow">Win rate</span>
          <span className="num">{Math.round((wins / traded.length) * 100)}%</span>
        </div>
        <div>
          <span className="eyebrow">Sessions</span>
          <span className="num">{traded.length}</span>
        </div>
        <div>
          <span className="eyebrow">Best day</span>
          <span className="num tone-gain">{formatMoneyDelta(best, "EUR")}</span>
        </div>
      </div>
    </div>
  );
}
