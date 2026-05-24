import { Fragment, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Holding } from "@/lib/mock";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  useHoldingDelta,
  useHoldingValueCents,
  useHoldings,
  useLatestPrice,
} from "@/store/selectors";
import { HoldingDetail } from "./HoldingDetail";

export function HoldingsTable() {
  const rows = useHoldings();
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (symbol: string) =>
    setExpanded((cur) => (cur === symbol ? null : symbol));

  return (
    <table className="table holdings">
      <thead>
        <tr>
          <th style={{ width: 18 }} />
          <th>Symbol</th>
          <th>Account</th>
          <th className="num">Qty</th>
          <th className="num">Price</th>
          <th className="num">Value</th>
          <th className="num">Day</th>
          <th className="num">Week</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <HoldingRow
            key={r.symbol}
            holding={r}
            isOpen={expanded === r.symbol}
            onToggle={toggle}
          />
        ))}
      </tbody>
    </table>
  );
}

type HoldingRowProps = {
  holding: Holding;
  isOpen: boolean;
  onToggle: (symbol: string) => void;
};

function HoldingRow({ holding, isOpen, onToggle }: HoldingRowProps) {
  const latest = useLatestPrice(holding.symbol);
  const value = useHoldingValueCents(holding.symbol);
  const dayDelta = useHoldingDelta(holding.symbol, "1D");
  const weekDelta = useHoldingDelta(holding.symbol, "1W");

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
        <td style={{ color: "var(--text-secondary)" }}>{holding.account}</td>
        <td className="num">{holding.qty.toLocaleString("en-US")}</td>
        <td className="num">{latest != null ? formatCents(Math.round(latest * 100)) : <Dash />}</td>
        <td className="num">{value != null ? formatCents(value) : <Dash />}</td>
        <td className="num">
          <Pct value={dayDelta} />
        </td>
        <td className="num">
          <Pct value={weekDelta} />
        </td>
      </tr>
      <ExpandRow holding={holding} open={isOpen} />
    </Fragment>
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

type ExpandRowProps = { holding: Holding; open: boolean };

function ExpandRow({ holding, open }: ExpandRowProps) {
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
      <td colSpan={8} className="holdings__expandCell">
        <div className={open ? "rowExpand rowExpand--open" : "rowExpand"}>
          <div className="rowExpand__inner">
            {render ? <HoldingDetail holding={holding} /> : null}
          </div>
        </div>
      </td>
    </tr>
  );
}
