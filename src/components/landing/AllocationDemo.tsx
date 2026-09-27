import { useEffect, useState, type CSSProperties } from "react";
import { prefersReducedMotion, useInView } from "@/lib/useInView";
import { ALLOC_BY_SECTOR, ALLOC_BY_SYMBOL } from "./demoData";

const VIEWS = [
  { id: "symbol", label: "By symbol", data: ALLOC_BY_SYMBOL },
  { id: "sector", label: "By sector", data: ALLOC_BY_SECTOR },
] as const;

/**
 * The long-term book's allocation bar. Alternates symbol ↔ sector on its own
 * until the visitor takes over by clicking a tab.
 */
export function AllocationDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [view, setView] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!inView || !auto || prefersReducedMotion()) return;
    const id = window.setInterval(() => setView((v) => (v + 1) % VIEWS.length), 3600);
    return () => window.clearInterval(id);
  }, [inView, auto]);

  const data = VIEWS[view]!.data;

  return (
    <div className={inView ? "alloc alloc--on" : "alloc"} ref={ref}>
      <div className="demoHead">
        <span className="eyebrow">Allocation</span>
        <div className="alloc__tabs" role="tablist">
          {VIEWS.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={i === view}
              className={i === view ? "alloc__tab alloc__tab--on" : "alloc__tab"}
              onClick={() => {
                setAuto(false);
                setView(i);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="alloc__bar">
        {data.map((a, i) => (
          <span
            key={i}
            className="alloc__seg"
            style={{ "--w": a.weight, "--i": i } as CSSProperties}
          />
        ))}
      </div>
      <ul className="alloc__legend">
        {data.map((a, i) => (
          <li key={`${view}-${a.label}`} style={{ "--i": i } as CSSProperties}>
            <i className="alloc__swatch" style={{ "--i": i } as CSSProperties} />
            <span className="alloc__label">{a.label}</span>
            <span className="num">{(a.weight * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
