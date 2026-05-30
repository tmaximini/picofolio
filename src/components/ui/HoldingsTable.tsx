import { Fragment, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Holding } from "@/lib/mock";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  useAccountValueCents,
  useHoldingDelta,
  useHoldingValueCents,
  useHoldings,
  useLatestPrice,
  useUnrealizedCents,
} from "@/store/selectors";
import { HoldingDetail } from "./HoldingDetail";

type HoldingsTableProps = {
  /** Account NAME (matches Holding.account) to filter rows by. Omit = all accounts. */
  account?: string;
  /** When set together with `account`, renders a Cash row + Weight column
   *  so each position's share of total account value is visible. */
  cashCents?: number;
};

export function HoldingsTable({ account, cashCents }: HoldingsTableProps = {}) {
  const all = useHoldings();
  const rows = account ? all.filter((h) => h.account === account) : all;
  const [expanded, setExpanded] = useState<string | null>(null);

  // Total value of the filtered account (holdings + cash). Used as the
  // denominator for weight %. Computed here so each row gets a stable
  // shared value rather than recomputing per render.
  const totalValueCents = useAccountValueCents(account ?? "");

  const toggle = (symbol: string) =>
    setExpanded((cur) => (cur === symbol ? null : symbol));

  const showAccount = !account;
  const showWeight = Boolean(account);
  const showCashRow = Boolean(account) && cashCents != null;

  // Header column count for expand-row colSpan. Both filtered and
  // unfiltered shapes land at 8.
  const colSpan = 8;

  return (
    <table className="table holdings">
      <thead>
        <tr>
          <th style={{ width: 18 }} />
          <th>Symbol</th>
          {showAccount && <th>Account</th>}
          <th className="num">Qty</th>
          <th className="num">Price</th>
          <th className="num">Value</th>
          {showWeight && <th className="num">Weight</th>}
          <th className="num">Day</th>
          <th className="num">Unreal. P/L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <HoldingRow
            key={r.symbol}
            holding={r}
            isOpen={expanded === r.symbol}
            onToggle={toggle}
            showAccount={showAccount}
            showWeight={showWeight}
            totalValueCents={totalValueCents}
            colSpan={colSpan}
          />
        ))}
        {showCashRow && (
          <CashRow
            cashCents={cashCents!}
            totalValueCents={totalValueCents}
            showWeight={showWeight}
          />
        )}
      </tbody>
    </table>
  );
}

type HoldingRowProps = {
  holding: Holding;
  isOpen: boolean;
  onToggle: (symbol: string) => void;
  showAccount: boolean;
  showWeight: boolean;
  totalValueCents: number | null;
  colSpan: number;
};

function HoldingRow({
  holding,
  isOpen,
  onToggle,
  showAccount,
  showWeight,
  totalValueCents,
  colSpan,
}: HoldingRowProps) {
  const latest = useLatestPrice(holding.symbol);
  const value = useHoldingValueCents(holding.symbol);
  const dayDelta = useHoldingDelta(holding.symbol, "1D");
  const unrealizedCents = useUnrealizedCents(holding.symbol);

  const weight =
    showWeight && value != null && totalValueCents != null && totalValueCents > 0
      ? value / totalValueCents
      : null;

  // Unrealized return relative to cost basis (qty × avg cost).
  const basisCents = holding.qty * holding.avgCostCents;
  const unrealizedPct =
    unrealizedCents != null && basisCents > 0 ? unrealizedCents / basisCents : null;

  return (
    <Fragment>
      <tr
        className={isOpen ? "holdings__row holdings__row--open" : "holdings__row"}
        onClick={() => onToggle(holding.symbol)}
        aria-expanded={isOpen}
      >
        <td className="holdings__caret">
          <ChevronRight size={14} strokeWidth={1.75} />
        </td>
        <td>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 500 }}>{holding.symbol}</span>
            <span
              style={{
                color: "var(--text-tertiary)",
                fontSize: "var(--text-xs)",
              }}
            >
              {holding.name}
            </span>
          </div>
        </td>
        {showAccount && (
          <td style={{ color: "var(--text-secondary)" }}>{holding.account}</td>
        )}
        <td className="num">{holding.qty.toLocaleString("en-US")}</td>
        <td className="num">{latest != null ? formatCents(Math.round(latest * 100)) : <Dash />}</td>
        <td className="num">{value != null ? formatCents(value) : <Dash />}</td>
        {showWeight && (
          <td className="num" style={{ color: "var(--text-secondary)" }}>
            {weight != null ? formatPct(weight).replace("+", "") : <Dash />}
          </td>
        )}
        <td className="num">
          <Pct value={dayDelta} />
        </td>
        <td className="num">
          <UnrealizedCell cents={unrealizedCents} pct={unrealizedPct} />
        </td>
      </tr>
      <ExpandRow holding={holding} open={isOpen} colSpan={colSpan} />
    </Fragment>
  );
}

function UnrealizedCell({
  cents,
  pct,
}: {
  cents: number | null;
  pct: number | null;
}) {
  if (cents == null) return <Dash />;
  const tone = toneOf(cents);
  const color = tone === "neutral" ? "var(--text-primary)" : `var(--${tone})`;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        lineHeight: 1.2,
      }}
    >
      <span style={{ color }}>{formatCents(cents)}</span>
      {pct != null && (
        <span style={{ color, fontSize: "var(--text-xs)", opacity: 0.85 }}>
          {formatPct(pct)}
        </span>
      )}
    </div>
  );
}

function CashRow({
  cashCents,
  totalValueCents,
  showWeight,
}: {
  cashCents: number;
  totalValueCents: number | null;
  showWeight: boolean;
}) {
  const weight =
    totalValueCents != null && totalValueCents > 0
      ? cashCents / totalValueCents
      : null;
  return (
    <tr className="holdings__row holdings__row--cash">
      <td />
      <td>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 500 }}>Cash</span>
          <span
            style={{
              color: "var(--text-tertiary)",
              fontSize: "var(--text-xs)",
            }}
          >
            Available balance
          </span>
        </div>
      </td>
      <td className="num">
        <Dash />
      </td>
      <td className="num">
        <Dash />
      </td>
      <td className="num">{formatCents(cashCents)}</td>
      {showWeight && (
        <td className="num" style={{ color: "var(--text-secondary)" }}>
          {weight != null ? formatPct(weight).replace("+", "") : <Dash />}
        </td>
      )}
      <td className="num">
        <Dash />
      </td>
      <td className="num">
        <Dash />
      </td>
    </tr>
  );
}

function Pct({ value }: { value: number | null }) {
  if (value == null) return <Dash />;
  const tone = toneOf(value);
  const color = tone === "neutral" ? "var(--text-secondary)" : `var(--${tone})`;
  return <span style={{ color }}>{formatPct(value)}</span>;
}

function Dash() {
  return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
}

type ExpandRowProps = { holding: Holding; open: boolean; colSpan: number };

function ExpandRow({ holding, open, colSpan }: ExpandRowProps) {
  const [render, setRender] = useState(open);

  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    const t = window.setTimeout(() => setRender(false), 280);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <tr className="holdings__expand" aria-hidden={!open}>
      <td colSpan={colSpan} className="holdings__expandCell">
        <div className={open ? "rowExpand rowExpand--open" : "rowExpand"}>
          <div className="rowExpand__inner">
            {render ? <HoldingDetail holding={holding} /> : null}
          </div>
        </div>
      </td>
    </tr>
  );
}
