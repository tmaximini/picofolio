import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eyebrow } from "@/components/primitives";
import { formatPct } from "@/lib/money";
import { PERF_RANGES, computePctSeries, type PctPoint, type PerfRange } from "@/lib/perf";
import { useIntradayPctSeries, type ValuePoint } from "@/store/selectors";
import { PerformanceChart } from "./PerformanceChart";

type PerformanceCardProps = {
  /** Eyebrow label above the value (e.g. "Total Portfolio Value"). */
  label: string;
  valueCents: number | null;
  series: ValuePoint[];
  /** Scope (accountId or ALL_ACCOUNTS) used to reconstruct an intraday curve
   *  for short ranges (7D / MTD). Omit to always use the daily series. */
  scope?: string;
};

/**
 * Value + rate-of-return over a selected window + a green-above / red-below
 * performance curve. Daily value series drives the long ranges; short ranges
 * (7D / MTD) upgrade to an intraday-reconstructed curve when available.
 */
export function PerformanceCard({ label, valueCents, series, scope }: PerformanceCardProps) {
  const [range, setRange] = useState<PerfRange>("All");

  const dailyPct = useMemo(() => computePctSeries(series, range), [series, range]);
  const intraday = useIntradayPctSeries(scope ?? null, range);

  // While an intraday series is expected but its bars are still in flight
  // (e.g. right after a range toggle), hold the last settled curve instead
  // of flashing the low-detail daily fallback for a beat.
  const lastSettled = useRef<{ points: PctPoint[]; usingIntraday: boolean } | null>(null);
  let usingIntraday = intraday.active;
  let pct = usingIntraday ? intraday.points : dailyPct;
  const holding = intraday.pending && !intraday.active && lastSettled.current != null;
  if (holding) {
    pct = lastSettled.current!.points;
    usingIntraday = lastSettled.current!.usingIntraday;
  }
  useEffect(() => {
    if (!holding && pct.length >= 2) lastSettled.current = { points: pct, usingIntraday };
  });

  const periodReturn = pct.length > 0 ? pct[pct.length - 1]!.value / 100 : null;
  const tone =
    periodReturn == null ? "neutral" : periodReturn >= 0 ? "gain" : "loss";

  return (
    <div className="perfCard">
      <div className="perfCard__head">
        <div className="perfCard__value">
          <Eyebrow>{label}</Eyebrow>
          {valueCents == null ? (
            <div className="heroValue" style={{ color: "var(--text-tertiary)" }}>
              $—
            </div>
          ) : (
            <BigValue cents={valueCents} />
          )}
        </div>

        <div className="perfCard__ror">
          <span className="perfCard__rorLabel">Rate of Return ({range})</span>
          {periodReturn == null ? (
            <span className="perfCard__rorValue perfCard__rorValue--neutral">—</span>
          ) : (
            <span className={`perfCard__rorValue perfCard__rorValue--${tone}`}>
              {tone === "loss" ? (
                <ArrowDownRight size={18} strokeWidth={1.75} />
              ) : (
                <ArrowUpRight size={18} strokeWidth={1.75} />
              )}
              {formatPct(periodReturn)}
            </span>
          )}
        </div>
      </div>

      {pct.length < 2 ? (
        <div className="perfCard__chartEmpty">
          {series.length < 2 ? "Loading performance…" : "Not enough history for this range"}
        </div>
      ) : (
        <PerformanceChart
          data={pct}
          height={300}
          format="percent"
          timeVisible={usingIntraday}
        />
      )}

      <div className="perfRanges" role="tablist" aria-label="Performance range">
        {PERF_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            className={
              range === r ? "perfRanges__pill perfRanges__pill--active" : "perfRanges__pill"
            }
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

function BigValue({ cents }: { cents: number }) {
  const dollars = Math.trunc(cents / 100);
  const frac = Math.abs(cents % 100)
    .toString()
    .padStart(2, "0");
  return (
    <div className="heroValue">
      ${dollars.toLocaleString("en-US")}
      <span className="heroValue__cents">.{frac}</span>
    </div>
  );
}
