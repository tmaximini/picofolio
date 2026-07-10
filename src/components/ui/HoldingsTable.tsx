import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Holding } from "@/lib/mock";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import { formatMoney, formatPct, toneOf } from "@/lib/money";
import {
  useAccountBaseCurrency,
  useAccountValueCents,
  useAccounts,
  useHoldingsMetrics,
  type HoldingMetrics,
} from "@/store/selectors";
import { HoldingDetail } from "./HoldingDetail";
import { SortableTable } from "./SortableTable";

type HoldingsTableProps = {
  /** Account.id to filter rows by. Omit = all accounts (shows Account column). */
  accountId?: string;
  /** When set together with `accountId`, renders a Cash row + Weight column. */
  cashCents?: number;
};

export function HoldingsTable({ accountId, cashCents }: HoldingsTableProps = {}) {
  const metrics = useHoldingsMetrics(accountId);
  const accounts = useAccounts();
  const totalValueCents = useAccountValueCents(accountId ?? "");
  const baseCurrency = useAccountBaseCurrency(accountId);
  const [expanded, setExpanded] = useState<string | null>(null);

  const accountNameById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const toggle = (symbol: string) =>
    setExpanded((cur) => (cur === symbol ? null : symbol));

  const showAccount = !accountId;
  const showWeight = Boolean(accountId);
  const showCashRow = Boolean(accountId) && cashCents != null;

  // Headless column model — drives the header row + sorting. The numbers come
  // from the precomputed metrics so Value/Day/P&L sort correctly.
  const columns = useMemo<ColumnDef<HoldingMetrics>[]>(() => {
    const numMeta = { meta: { align: "right" as const }, sortUndefined: "last" as const };
    const cols: ColumnDef<HoldingMetrics>[] = [
      { id: "caret", header: "", enableSorting: false },
      {
        id: "symbol",
        header: "Symbol",
        accessorFn: (m) => parseOccSymbol(m.holding.symbol)?.underlying ?? m.holding.symbol,
      },
    ];
    if (showAccount) {
      cols.push({
        id: "account",
        header: "Account",
        accessorFn: (m) => accountNameById.get(m.holding.accountId) ?? "",
      });
    }
    cols.push(
      { id: "qty", header: "Qty", accessorFn: (m) => m.holding.qty, ...numMeta },
      { id: "price", header: "Price", accessorFn: (m) => m.priceCents ?? undefined, ...numMeta },
      { id: "value", header: "Value", accessorFn: (m) => m.valueCents ?? undefined, ...numMeta },
    );
    if (showWeight) {
      cols.push({
        id: "weight",
        header: "Weight",
        accessorFn: (m) =>
          m.valueCents != null && totalValueCents != null && totalValueCents > 0
            ? m.valueCents / totalValueCents
            : undefined,
        ...numMeta,
      });
    }
    cols.push(
      { id: "day", header: "Day", accessorFn: (m) => m.dayPct ?? undefined, ...numMeta },
      { id: "unreal", header: "Unreal. P/L", accessorFn: (m) => m.unrealCents ?? undefined, ...numMeta },
    );
    return cols;
  }, [showAccount, showWeight, accountNameById, totalValueCents]);

  const colSpan = columns.length;

  return (
    <SortableTable
      className="holdings"
      minWidth={760}
      data={metrics}
      columns={columns}
      getRowId={(m) => m.holding.symbol}
      initialSorting={[{ id: "value", desc: true }]}
      renderRow={(m) => (
        <HoldingRow
          metrics={m}
          accountName={accountNameById.get(m.holding.accountId) ?? "—"}
          isOpen={expanded === m.holding.symbol}
          onToggle={toggle}
          showAccount={showAccount}
          showWeight={showWeight}
          totalValueCents={totalValueCents}
          colSpan={colSpan}
        />
      )}
      footer={
        showCashRow ? (
          <CashRow
            cashCents={cashCents!}
            currency={baseCurrency}
            totalValueCents={totalValueCents}
            showAccount={showAccount}
            showWeight={showWeight}
          />
        ) : null
      }
    />
  );
}

type HoldingRowProps = {
  metrics: HoldingMetrics;
  accountName: string;
  isOpen: boolean;
  onToggle: (symbol: string) => void;
  showAccount: boolean;
  showWeight: boolean;
  totalValueCents: number | null;
  colSpan: number;
};

function HoldingRow({
  metrics,
  accountName,
  isOpen,
  onToggle,
  showAccount,
  showWeight,
  totalValueCents,
  colSpan,
}: HoldingRowProps) {
  const { holding, priceCents, currency, baseCurrency, valueCents, dayPct, unrealCents, unrealPct } =
    metrics;

  const weight =
    showWeight && valueCents != null && totalValueCents != null && totalValueCents > 0
      ? valueCents / totalValueCents
      : null;

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
          <HoldingSymbolCell holding={holding} />
        </td>
        {showAccount && (
          <td style={{ color: "var(--text-secondary)" }}>{accountName}</td>
        )}
        <td className="num" style={{ color: "var(--text-secondary)" }}>{holding.qty.toLocaleString("en-US")}</td>
        <td className="num" style={{ color: "var(--text-secondary)" }}>
          {priceCents != null ? formatMoney(priceCents, currency) : <Dash />}
        </td>
        <td className="num">
          {valueCents != null ? formatMoney(valueCents, baseCurrency) : <Dash />}
        </td>
        {showWeight && (
          <td className="num" style={{ color: "var(--text-secondary)" }}>
            {weight != null ? formatPct(weight).replace("+", "") : <Dash />}
          </td>
        )}
        <td className="num">
          <Pct value={dayPct} />
        </td>
        <td className="num">
          <UnrealizedCell cents={unrealCents} pct={unrealPct} currency={baseCurrency} />
        </td>
      </tr>
      <ExpandRow holding={holding} open={isOpen} colSpan={colSpan} />
    </Fragment>
  );
}

/** Symbol cell — options render as underlying + CALL/PUT badge + a
 *  "expiry · $strike" label (matching the Activity table); stocks stay plain. */
function HoldingSymbolCell({ holding }: { holding: Holding }) {
  const opt = parseOccSymbol(holding.symbol);
  if (opt) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontWeight: 500 }}>{opt.underlying}</span>
          <span
            className={`tradeTable__marketBadge tradeTable__marketBadge--${
              opt.type === "CALL" ? "call" : "put"
            }`}
          >
            {opt.type}
          </span>
        </span>
        <span
          style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatOptionLabel(opt, { includeType: false })}
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontWeight: 500 }}>{holding.symbol}</span>
      <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)" }}>
        {holding.name}
      </span>
    </div>
  );
}

function UnrealizedCell({
  cents,
  pct,
  currency,
}: {
  cents: number | null;
  pct: number | null;
  currency: string;
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
      <span style={{ color }}>{formatMoney(cents, currency)}</span>
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
  currency,
  totalValueCents,
  showAccount,
  showWeight,
}: {
  cashCents: number;
  currency: string;
  totalValueCents: number | null;
  showAccount: boolean;
  showWeight: boolean;
}) {
  const weight =
    totalValueCents != null && totalValueCents > 0 ? cashCents / totalValueCents : null;
  return (
    <tr className="holdings__row holdings__row--cash">
      <td />
      <td>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 500 }}>Cash</span>
          <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)" }}>
            Available balance
          </span>
        </div>
      </td>
      {showAccount && <td />}
      <td className="num">
        <Dash />
      </td>
      <td className="num">
        <Dash />
      </td>
      <td className="num">{formatMoney(cashCents, currency)}</td>
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
