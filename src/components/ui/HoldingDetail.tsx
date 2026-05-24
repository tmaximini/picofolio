import { useEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/primitives";
import type { Holding } from "@/lib/mock";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { sliceRange, type Range } from "@/lib/priceHistory";
import {
  useHoldingDelta,
  useHoldingValueCents,
  useLoadPrice,
  usePricePoints,
  usePriceStatus,
  useUnrealizedCents,
} from "@/store/selectors";
import { PriceChart } from "./PriceChart";

type HoldingDetailProps = {
  holding: Holding;
};

const RANGES = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1Y" },
  { value: "All", label: "All" },
] as const;

export function HoldingDetail({ holding }: HoldingDetailProps) {
  const [range, setRange] = useState<Range>("3M");

  const loadPrice = useLoadPrice();
  const status = usePriceStatus(holding.symbol);
  const points = usePricePoints(holding.symbol);
  const valueCents = useHoldingValueCents(holding.symbol);
  const unrealizedCents = useUnrealizedCents(holding.symbol);
  const r1m = useHoldingDelta(holding.symbol, "1M");
  const ytd = useHoldingDelta(holding.symbol, "YTD");
  const r1y = useHoldingDelta(holding.symbol, "1Y");

  useEffect(() => {
    loadPrice(holding.symbol);
  }, [loadPrice, holding.symbol]);

  const data = useMemo(
    () => (points ? sliceRange(points, range) : []),
    [points, range],
  );

  const unrealizedTone = unrealizedCents == null ? "neutral" : toneOf(unrealizedCents);

  return (
    <div className="holdingDetail">
      <div className="holdingDetail__chart">
        <div className="holdingDetail__chartHead">
          <div>
            <div className="holdingDetail__symbol">{holding.symbol}</div>
            <div className="holdingDetail__name">{holding.name}</div>
          </div>
          <Tabs<Range> value={range} onChange={setRange} options={RANGES} />
        </div>

        {status === "error" ? (
          <ChartFallback>Couldn't load price data</ChartFallback>
        ) : data.length === 0 ? (
          <ChartFallback>Loading…</ChartFallback>
        ) : (
          <PriceChart data={data} height={260} />
        )}
      </div>

      <div className="holdingDetail__side">
        <StatLine label="Avg Cost" value={formatCents(holding.avgCostCents)} />
        <StatLine
          label="Mkt Value"
          value={valueCents != null ? formatCents(valueCents) : "—"}
        />
        <StatLine
          label="Unrealized"
          value={
            unrealizedCents == null
              ? "—"
              : `${unrealizedCents >= 0 ? "+" : "−"}${formatCents(Math.abs(unrealizedCents))}`
          }
          tone={unrealizedTone}
        />
        <div className="holdingDetail__divider" />
        <StatLine label="1M" value={fmtPct(r1m)} tone={pctTone(r1m)} />
        <StatLine label="YTD" value={fmtPct(ytd)} tone={pctTone(ytd)} />
        <StatLine label="1Y" value={fmtPct(r1y)} tone={pctTone(r1y)} />
      </div>
    </div>
  );
}

function fmtPct(n: number | null): string {
  return n == null ? "—" : formatPct(n);
}

function pctTone(n: number | null): "gain" | "loss" | "neutral" {
  if (n == null || n === 0) return "neutral";
  return toneOf(n);
}

function ChartFallback({ children }: { children: React.ReactNode }) {
  return <div className="priceChart priceChart--fallback">{children}</div>;
}

type StatLineProps = {
  label: string;
  value: string;
  tone?: "gain" | "loss" | "neutral";
};

function StatLine({ label, value, tone }: StatLineProps) {
  const color =
    tone === "gain"
      ? "var(--gain)"
      : tone === "loss"
        ? "var(--loss)"
        : "var(--text-primary)";
  return (
    <div className="holdingDetail__row">
      <span className="holdingDetail__rowLabel">{label}</span>
      <span className="holdingDetail__rowValue" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
