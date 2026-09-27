import { useId } from "react";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
};

/** Tiny close-price line with a fading wash; tone follows first → last. */
export function Sparkline({ values, width = 96, height = 28 }: SparklineProps) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return <span className="spark spark--empty" style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    1.5 + (1 - (v - min) / span) * (height - 3),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x!.toFixed(1)} ${y!.toFixed(1)}`).join("");
  const tone = values[values.length - 1]! >= values[0]! ? "gain" : "loss";
  return (
    <svg className={`spark spark--${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${width} ${height}L0 ${height}Z`} fill={`url(#${id}-w)`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}
