import { useMemo, useRef, useState } from "react";
import { formatCents } from "@/lib/money";

type Point = { at: string; cumulativeCents: number };

type JournalSparkProps = {
  series: Point[];
};

export function JournalSpark({ series }: JournalSparkProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Pick ~4 evenly-spaced indices for date labels along the x-axis.
  // (Hook must run unconditionally — the empty-series early return lives
  // below so hook order stays stable across renders.)
  const labelIdxs = useMemo(() => {
    const n = series.length;
    if (n <= 1) return [0];
    if (n <= 4) return series.map((_, i) => i);
    const out = [0];
    out.push(Math.round(n / 3));
    out.push(Math.round((2 * n) / 3));
    out.push(n - 1);
    return [...new Set(out)];
  }, [series]);

  if (series.length === 0) {
    return <div className="journalSpark__empty">No closed trades in range</div>;
  }

  const width = 320;
  const height = 110;
  const padX = 4;
  const padBottom = 18;
  const padTop = 12;
  const plotH = height - padBottom - padTop;

  const values = series.map((p) => p.cumulativeCents);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const x = (i: number) =>
    padX + (i / Math.max(1, series.length - 1)) * (width - padX * 2);
  const y = (v: number) =>
    padTop + (1 - (v - min) / range) * plotH;

  const zeroY = y(0);

  const pathLine = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.cumulativeCents)}`)
    .join(" ");

  const pathArea = [
    `M ${x(0)} ${zeroY}`,
    ...series.map((p, i) => `L ${x(i)} ${y(p.cumulativeCents)}`),
    `L ${x(series.length - 1)} ${zeroY}`,
    "Z",
  ].join(" ");

  const last = values[values.length - 1] ?? 0;
  const tone = last >= 0 ? "gain" : "loss";

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(relX * (series.length - 1));
    const clamped = Math.max(0, Math.min(series.length - 1, idx));
    setHoverIdx(clamped);
  };

  const hoverPoint = hoverIdx != null ? series[hoverIdx] : null;
  const tooltipX = hoverIdx != null ? x(hoverIdx) : 0;
  const tooltipY = hoverPoint != null ? y(hoverPoint.cumulativeCents) : 0;

  // Tooltip horizontal positioning: clamp so it stays within bounds.
  const tooltipPctX = hoverIdx != null
    ? Math.max(8, Math.min(92, (tooltipX / width) * 100))
    : 0;
  const tooltipAbovePlot = tooltipY > padTop + plotH / 2;

  return (
    <div className="journalSpark__wrap">
      <svg
        ref={ref}
        className="journalSpark"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <line
          className="journalSpark__baseline"
          x1={padX}
          x2={width - padX}
          y1={zeroY}
          y2={zeroY}
        />
        <path className={`journalSpark__area--${tone}`} d={pathArea} />
        <path
          className={`journalSpark__line--${tone}`}
          d={pathLine}
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Y-axis min/max labels */}
        <text className="journalSpark__axisLabel" x={padX} y={padTop - 2}>
          {formatCents(max, true)}
        </text>
        <text
          className="journalSpark__axisLabel"
          x={padX}
          y={height - padBottom + 10}
        >
          {formatCents(min, true)}
        </text>

        {/* X-axis date labels */}
        {labelIdxs.map((i) => (
          <text
            key={i}
            className="journalSpark__axisLabel"
            x={x(i)}
            y={height - 4}
            textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
          >
            {formatAxisDate(series[i]!.at)}
          </text>
        ))}

        {/* Crosshair on hover */}
        {hoverIdx != null && hoverPoint && (
          <>
            <line
              className="journalSpark__crosshair"
              x1={tooltipX}
              x2={tooltipX}
              y1={padTop}
              y2={padTop + plotH}
            />
            <circle
              className={`journalSpark__dot--${tone}`}
              cx={tooltipX}
              cy={tooltipY}
              r={3.5}
            />
          </>
        )}
      </svg>

      {hoverIdx != null && hoverPoint && (
        <div
          className={`journalSpark__tip ${tooltipAbovePlot ? "journalSpark__tip--above" : "journalSpark__tip--below"}`}
          style={{
            left: `${tooltipPctX}%`,
            top: tooltipAbovePlot ? "4px" : "auto",
            bottom: tooltipAbovePlot ? "auto" : `${padBottom + 4}px`,
          }}
        >
          <div className="journalSpark__tipDate">
            {formatTipDate(hoverPoint.at)}
          </div>
          <div
            className={`journalSpark__tipValue journalSpark__tipValue--${
              hoverPoint.cumulativeCents >= 0 ? "gain" : "loss"
            }`}
          >
            {formatCents(hoverPoint.cumulativeCents)}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAxisDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTipDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
