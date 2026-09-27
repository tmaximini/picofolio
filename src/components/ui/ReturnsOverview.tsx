import type { CSSProperties } from "react";
import { Card, Stat } from "@/components/primitives";
import { formatPct, toneOf } from "@/lib/money";
import type { PeriodReturns } from "@/lib/monthlyReturns";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A month this size (either way) gets the full tint. */
const FULL_TINT = 0.12;

type ReturnsOverviewProps = {
  returns: PeriodReturns;
  openPositions: number;
  closedPositions: number;
  /** Mean hold of closed trades, ms. null when none have a hold time. */
  avgHoldMs: number | null;
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
}: ReturnsOverviewProps) {
  const { years, ytd, ytdYear, asOf, inception } = returns;
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
        <Stat label="Since inception" value={<Pct value={inception} />} />
      </div>

      {years.length > 0 && (
        <div className="returns__heat">
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
                  {y.months.map((m, i) => (
                    <span
                      role="cell"
                      key={i}
                      className={`returns__cell num returns__cell--${m == null ? "empty" : toneOf(m)}`}
                      style={
                        m == null
                          ? undefined
                          : ({ "--m": Math.min(1, Math.abs(m) / FULL_TINT) } as CSSProperties)
                      }
                      title={m == null ? undefined : `${MONTHS[i]} ${y.year} · ${formatPct(m)}`}
                    >
                      {m == null ? "" : formatShortPct(m)}
                    </span>
                  ))}
                  <span role="cell" className="returns__total num">
                    <Pct value={y.total} />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="returns__foot">
            Month-end value vs the prior month-end. Deposits and withdrawals
            aren't netted out.
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

function formatAvgHold(ms: number | null): string {
  if (ms == null) return "—";
  const hours = ms / 3_600_000;
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`;
  const days = hours / 24;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} d`;
  return `${(days / 30.44).toFixed(1)} mo`;
}
