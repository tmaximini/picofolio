import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { Button, Tabs } from "@/components/primitives";
import type { Holding } from "@/lib/mock";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { sliceRange, type Range } from "@/lib/priceHistory";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import {
  useHoldingDelta,
  useHoldingValueCents,
  useLoadOptionPrice,
  useLoadPrice,
  useOptionPriceError,
  useOptionPricePoints,
  useOptionPriceStatus,
  usePricePoints,
  usePriceStatus,
  usePushToast,
  useRemoveHolding,
  useUnrealizedCents,
} from "@/store/selectors";
import { HoldingFormModal } from "./HoldingFormModal";
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
  const [editing, setEditing] = useState(false);
  const removeHolding = useRemoveHolding();
  const pushToast = usePushToast();

  const opt = parseOccSymbol(holding.symbol);
  const isOption = opt != null;

  // Equities price via Yahoo; open options via MarketData.app. Both sets of
  // hooks run unconditionally (hooks rules) — we pick the active source below.
  const loadPrice = useLoadPrice();
  const loadOptionPrice = useLoadOptionPrice();
  const eqStatus = usePriceStatus(holding.symbol);
  const eqPoints = usePricePoints(holding.symbol);
  const optStatus = useOptionPriceStatus(holding.symbol);
  const optPoints = useOptionPricePoints(holding.symbol);
  const optErrorKind = useOptionPriceError(holding.symbol);

  const status = isOption ? optStatus : eqStatus;
  const points = isOption ? optPoints : eqPoints;

  const valueCents = useHoldingValueCents(holding.symbol);
  const unrealizedCents = useUnrealizedCents(holding.symbol);
  const r1m = useHoldingDelta(holding.symbol, "1M");
  const ytd = useHoldingDelta(holding.symbol, "YTD");
  const r1y = useHoldingDelta(holding.symbol, "1Y");

  useEffect(() => {
    if (isOption) loadOptionPrice(holding.symbol);
    else loadPrice(holding.symbol);
  }, [isOption, loadOptionPrice, loadPrice, holding.symbol]);

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
            <div className="holdingDetail__symbol">
              {opt ? opt.underlying : holding.symbol}
            </div>
            <div className="holdingDetail__name">
              {opt ? formatOptionLabel(opt) : holding.name}
            </div>
          </div>
          <Tabs<Range> value={range} onChange={setRange} options={RANGES} />
        </div>

        {isOption && optErrorKind === "no-token" ? (
          <OptionPricingHint />
        ) : isOption && optErrorKind != null ? (
          // Missing/renamed contract (corporate action) or a transient fetch
          // failure — calm, never a stack trace or broken chart.
          <ChartFallback>Couldn't fetch pricing for this contract</ChartFallback>
        ) : status === "error" ? (
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

        <div className="holdingDetail__divider" />
        <div className="holdingDetail__actions">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            <Pencil size={13} strokeWidth={1.75} />
            <span>Edit</span>
          </Button>
          <Button
            className="btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              if (!confirm(`Remove ${holding.symbol} from this account?`)) return;
              removeHolding(holding.accountId, holding.symbol);
              pushToast({ kind: "info", title: `${holding.symbol} removed`, duration: 2500 });
            }}
          >
            <Trash2 size={13} strokeWidth={1.75} />
            <span>Remove</span>
          </Button>
        </div>
      </div>

      {editing && (
        <HoldingFormModal
          accountId={holding.accountId}
          holding={holding}
          onClose={() => setEditing(false)}
        />
      )}
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

/** Calm, informational (not an error): one line, one action. Shown only for an
 *  open option position when no MarketData.app token is configured — the live
 *  mark + chart are gated, but the rest of the row still renders. */
function OptionPricingHint() {
  return (
    <div className="priceChart priceChart--fallback">
      <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
        Option pricing needs a free MarketData.app token.{" "}
        <Link
          to="/settings?focus=marketdata"
          style={{ color: "var(--accent)", fontWeight: 500 }}
        >
          Add token →
        </Link>
      </span>
    </div>
  );
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
