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
  useIntradayEntry,
  useLoadIntraday,
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

/** Daily (string time) or intraday (unix-seconds time) chart points. */
type ChartData = ReadonlyArray<{ time: string | number; value: number }>;

const RANGES = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1Y" },
  { value: "All", label: "All" },
] as const;

// Remember the user's last-picked range across holdings (and reloads). Kept in
// its own localStorage key so it survives store version bumps. Defaults to 1M.
const RANGE_STORAGE_KEY = "picofolio:holdingRange";

function loadStoredRange(): Range {
  try {
    const v = localStorage.getItem(RANGE_STORAGE_KEY);
    if (v && RANGES.some((r) => r.value === v)) return v as Range;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return "1M";
}

export function HoldingDetail({ holding }: HoldingDetailProps) {
  const [range, setRange] = useState<Range>(loadStoredRange);
  const [editing, setEditing] = useState(false);

  // Persist the choice so the next holding (and the next session) opens on it.
  const selectRange = (r: Range) => {
    setRange(r);
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, r);
    } catch {
      /* ignore write failures (private mode, etc.) */
    }
  };
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

  // Short ranges on a stock holding use intraday bars so the curve isn't a
  // clunky connect-the-dots of daily closes. One fetch (~1 month of 5-min
  // bars) covers both 1W and 1M; we slice it per range. Options have no
  // intraday feed — they stay on the daily/MarketData series.
  const wantsIntraday = !isOption && (range === "1W" || range === "1M");
  const loadIntraday = useLoadIntraday();
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  // today-7 maps to the valid 5m/1mo window (~30 days). One fetch covers both
  // 1W and 1M; we slice it per range. (today-31 would request the invalid
  // 5m/3mo and error out.)
  const intraStartKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const intraEntry = useIntradayEntry(holding.symbol, intraStartKey, todayKey);

  useEffect(() => {
    if (wantsIntraday) loadIntraday(holding.symbol, intraStartKey, todayKey);
  }, [wantsIntraday, holding.symbol, intraStartKey, todayKey, loadIntraday]);

  const valueCents = useHoldingValueCents(holding.symbol);
  const unrealizedCents = useUnrealizedCents(holding.symbol);
  const r1m = useHoldingDelta(holding.symbol, "1M");
  const ytd = useHoldingDelta(holding.symbol, "YTD");
  const r1y = useHoldingDelta(holding.symbol, "1Y");

  useEffect(() => {
    if (isOption) loadOptionPrice(holding.symbol);
    else loadPrice(holding.symbol);
  }, [isOption, loadOptionPrice, loadPrice, holding.symbol]);

  // Prefer the intraday series for short ranges; fall back to daily closes
  // until it loads (or if the symbol has no intraday coverage), so the chart
  // is never empty and progressively sharpens.
  const { data, intradayActive } = useMemo(() => {
    if (wantsIntraday && intraEntry?.points && intraEntry.points.length > 0) {
      const days = range === "1W" ? 7 : 31;
      const cutoff = Date.now() / 1000 - days * 86400;
      const sliced = intraEntry.points.filter((p) => p.time >= cutoff);
      if (sliced.length >= 2) return { data: sliced as ChartData, intradayActive: true };
    }
    const daily = points ? sliceRange(points, range) : [];
    return { data: daily as ChartData, intradayActive: false };
  }, [wantsIntraday, intraEntry, points, range]);

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
          <Tabs<Range> value={range} onChange={selectRange} options={RANGES} />
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
          <PriceChart data={data} height={260} timeVisible={intradayActive} />
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
