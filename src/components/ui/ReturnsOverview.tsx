import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Card, InfoTip, Stat } from "@/components/primitives";
import { formatMoney, formatMoneyDelta, formatPct, toneOf } from "@/lib/money";
import type { PeriodReturns } from "@/lib/monthlyReturns";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A month this size (either way) gets the full tint in % mode. */
const FULL_TINT = 0.12;

type Unit = "pct" | "abs";

type ReturnsOverviewProps = {
  returns: PeriodReturns;
  openPositions: number;
  closedPositions: number;
  /** Mean hold of closed trades, ms. null when none have a hold time. */
  avgHoldMs: number | null;
  /** Scope base currency for the absolute view. */
  currency: string;
  /** Whether deposits/withdrawals/transfers are known (and taken out). */
  flowsKnown: boolean;
};

/**
 * Headline period returns plus a month-by-year heatmap. Tints are muted
 * sage/terracotta scaled by magnitude — a quiet month reads as nearly flat.
 */
export function ReturnsOverview({
  returns,
  openPositions,
  closedPositions,
  avgHoldMs,
  currency,
  flowsKnown,
}: ReturnsOverviewProps) {
  const { years, ytd, ytdYear, asOf, inception } = returns;
  const [unit, setUnit] = useState<Unit>("pct");
  // In $ mode, tint scales to the biggest month on screen.
  const maxAbsCents = useMemo(
    () => Math.max(1, ...years.flatMap((y) => y.monthsCents.map((c) => Math.abs(c ?? 0)))),
    [years],
  );
  const prior = ytdYear != null ? years.find((y) => y.year === ytdYear - 1) : undefined;
  const asOfLabel = asOf
    ? new Date(`${asOf}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <Card className="returns">
      <div className="perfGrid returns__stats">
        <Stat label="Open positions" value={String(openPositions)} />
        <Stat label="Closed" value={String(closedPositions)} />
        <Stat label="Avg hold" value={formatAvgHold(avgHoldMs)} />
        <Stat
          label={ytdYear != null ? `${ytdYear} YTD${asOfLabel ? ` · ${asOfLabel}` : ""}` : "YTD"}
          value={<Pct value={ytd} />}
        />
        <Stat
          label={ytdYear != null ? `${ytdYear - 1} return` : "Last year"}
          value={<Pct value={prior?.total ?? null} />}
        />
        <Stat
          label={
            <>
              Since inception
              <InfoTip>
                {flowsKnown
                  ? "Time-weighted return since the first value on record: deposits, withdrawals and moves between sub-accounts are taken out, like IBKR's figures."
                  : "Change in account value since the first value on record. Deposits and transfers still count as returns until the Flex query includes Cash Transactions and Transfers."}
              </InfoTip>
            </>
          }
          value={<Pct value={inception} />}
        />
      </div>

      {years.length > 0 && (
        <div className="returns__heat">
          <div className="returns__heatHead">
            <span className="stat__label">Monthly returns</span>
            <div className="chartSource" role="tablist" aria-label="Units">
              {(
                [
                  ["pct", "%"],
                  ["abs", currencySymbol(currency)],
                ] as const
              ).map(([u, label]) => (
                <button
                  key={u}
                  type="button"
                  role="tab"
                  aria-selected={unit === u}
                  title={u === "pct" ? "Relative (percent)" : "Absolute (value change)"}
                  className={unit === u ? "chartSource__seg chartSource__seg--active" : "chartSource__seg"}
                  onClick={() => setUnit(u)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="returns__scroll">
            <div className="returns__grid" role="table" aria-label="Monthly returns">
              <div className="returns__row returns__row--head" role="row">
                <span role="columnheader" />
                {MONTHS.map((m) => (
                  <span role="columnheader" key={m}>{m}</span>
                ))}
                <span role="columnheader" className="returns__yearHead">Year</span>
              </div>
              {years.map((y) => (
                <div className="returns__row" role="row" key={y.year}>
                  <span role="rowheader" className="returns__year num">{y.year}</span>
                  {y.months.map((m, i) => {
                    const cents = y.monthsCents[i] ?? null;
                    const v = unit === "pct" ? m : cents;
                    const mag = m == null ? 0 : unit === "pct" ? Math.abs(m) / FULL_TINT : Math.abs(cents ?? 0) / maxAbsCents;
                    return (
                      <span
                        role="cell"
                        key={i}
                        className={`returns__cell num returns__cell--${v == null ? "empty" : toneOf(v)}`}
                        style={v == null ? undefined : ({ "--m": Math.min(1, mag) } as CSSProperties)}
                        title={
                          m == null
                            ? undefined
                            : `${MONTHS[i]} ${y.year} · ${formatPct(m)} · ${formatMoneyDelta(cents ?? 0, currency)}`
                        }
                      >
                        {v == null ? "" : unit === "pct" ? formatShortPct(v) : formatCompactDelta(v, currency)}
                      </span>
                    );
                  })}
                  <span role="cell" className="returns__total num">
                    {unit === "pct" ? (
                      <Pct value={y.total} />
                    ) : y.totalCents == null ? (
                      <Pct value={null} />
                    ) : (
                      <span style={{ color: toneOf(y.totalCents) === "neutral" ? undefined : `var(--${toneOf(y.totalCents)})` }}>
                        {`${y.totalCents > 0 ? "+" : y.totalCents < 0 ? "−" : ""}${formatMoney(Math.abs(y.totalCents), currency, true)}`}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="returns__foot">
            {flowsKnown
              ? unit === "pct"
                ? "Time-weighted, like IBKR: deposits, withdrawals and transfers between sub-accounts are taken out."
                : "Profit and loss per month — value change with deposits, withdrawals and transfers taken out."
              : (
                <>
                  Deposits, withdrawals and transfers between sub-accounts still count here — your
                  Flex query needs the Cash Transactions and Transfers sections.{" "}
                  <Link to="/settings?guide=open" className="returns__fix">
                    How to add them →
                  </Link>
                </>
              )}
          </p>
        </div>
      )}
    </Card>
  );
}

function Pct({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  const tone = toneOf(value);
  return (
    <span className="num" style={{ color: tone === "neutral" ? undefined : `var(--${tone})` }}>
      {formatPct(value)}
    </span>
  );
}

/** One decimal in the heatmap — two is noise at cell size. */
function formatShortPct(r: number): string {
  const v = (r * 100).toFixed(1);
  return r > 0 ? `+${v}%` : r < 0 ? `−${v.slice(1)}%` : "0.0%";
}

const compactFormatters = new Map<string, Intl.NumberFormat>();

/** "+$1.2k" / "−€845" — heatmap cells have room for about six characters.
 *  Whole units under 1k (no "$185.8"), one decimal once abbreviated. */
function formatCompactDelta(cents: number, currency: string): string {
  const abs = Math.abs(cents) / 100;
  const digits = abs < 1000 ? 0 : 1;
  const key = `${currency}|${digits}`;
  let f = compactFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: digits });
    } catch {
      f = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: digits });
    }
    compactFormatters.set(key, f);
  }
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${f.format(abs).replace("K", "k")}`;
}

/** "$", "€", "HK$"… for the unit toggle. */
function currencySymbol(currency: string): string {
  return formatMoney(0, currency, true).replace(/[\d.,\s]/g, "") || currency;
}

function formatAvgHold(ms: number | null): string {
  if (ms == null) return "—";
  const hours = ms / 3_600_000;
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`;
  const days = hours / 24;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} d`;
  return `${(days / 30.44).toFixed(1)} mo`;
}
