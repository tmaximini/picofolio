import type { CSSProperties } from "react";
import { formatMoneyDelta } from "@/lib/money";
import { useInView } from "@/lib/useInView";
import { WEEKLY_PNL } from "./demoData";

/** Twelve weeks of realized P&L, growing out of the zero line in sequence. */
export function WeeklyBars() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const max = Math.max(...WEEKLY_PNL.map(Math.abs));
  const total = WEEKLY_PNL.reduce((a, b) => a + b, 0);

  return (
    <div className={inView ? "wbars wbars--on" : "wbars"} ref={ref}>
      <div className="demoHead">
        <span className="eyebrow">Realized · last 12 weeks</span>
        <span className="demoHead__val num tone-gain">{formatMoneyDelta(total, "EUR")}</span>
      </div>
      <div className="wbars__plot">
        {WEEKLY_PNL.map((v, i) => (
          <div
            className={v >= 0 ? "wbars__col wbars__col--gain" : "wbars__col wbars__col--loss"}
            key={i}
            style={{ "--h": Math.abs(v) / max, "--i": i } as CSSProperties}
          >
            <span className="wbars__bar" />
            <span className="wbars__tip num">{formatMoneyDelta(v, "EUR")}</span>
          </div>
        ))}
      </div>
      <div className="wbars__axis num" aria-hidden>
        <span>W27</span>
        <span>W32</span>
        <span>W38</span>
      </div>
    </div>
  );
}
