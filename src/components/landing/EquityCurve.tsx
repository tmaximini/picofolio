import { useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { formatPct } from "@/lib/money";

type EquityCurveProps = {
  /** Cumulative return series, in percent points. */
  data: number[];
  /** Line draws itself in once active. */
  active: boolean;
};

const W = 1000;
const H = 260;
const PAD = 12;

/**
 * The hero chart: a return curve that draws itself, a sage wash beneath it,
 * and the live-price dot at the end (the same dot as the brand mark).
 * Hover scrubs a crosshair — the page is a demo, so it should feel like one.
 */
export function EquityCurve({ data, active }: EquityCurveProps) {
  const [hover, setHover] = useState<number | null>(null);

  const { line, area, pts, zeroY } = useMemo(() => {
    const min = Math.min(0, ...data);
    const max = Math.max(...data);
    const x = (i: number) => (i / (data.length - 1)) * W;
    const y = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);
    const pts = data.map((v, i) => [x(i), y(v)] as const);
    const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");
    return { line, area: `${line}L${W} ${H}L0 ${H}Z`, pts, zeroY: y(0) };
  }, [data]);

  const last = pts[pts.length - 1]!;
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(t * (data.length - 1)));
  };
  const hp = hover != null ? pts[hover] : null;

  return (
    <div
      className={active ? "curve curve--on" : "curve"}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="curve-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--gain)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--gain)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="curve__grid" x1="0" x2={W} y1={H * f} y2={H * f} />
        ))}
        <line className="curve__zero" x1="0" x2={W} y1={zeroY} y2={zeroY} />
        <path className="curve__area" d={area} fill="url(#curve-wash)" />
        <path className="curve__line" d={line} pathLength={1} />
      </svg>
      <span
        className="curve__dot"
        style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%` } as CSSProperties}
      />
      {hp && hover != null && (
        <>
          <span className="curve__cross" style={{ left: `${(hp[0] / W) * 100}%` }} />
          <span
            className="curve__tip num"
            style={{ left: `${(hp[0] / W) * 100}%`, top: `${(hp[1] / H) * 100}%` }}
          >
            {formatPct(data[hover]! / 100)}
          </span>
        </>
      )}
    </div>
  );
}
