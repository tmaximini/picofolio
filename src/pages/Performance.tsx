import { useMemo, useState } from "react";
import { Topbar } from "@/components/layout";
import { Card, Stat } from "@/components/primitives";
import { BreakdownBars, PerformanceChart, type BreakdownBar } from "@/components/ui";
import { formatMoney, formatPct, toneOf } from "@/lib/money";
import { breakdownBy, type BreakdownDimension } from "@/lib/performance";
import { ALL_ACCOUNTS } from "@/store";
import {
  useAccountBaseCurrency,
  useAccountById,
  usePerformanceStats,
  useSelectedAccountId,
} from "@/store/selectors";

const DIMENSIONS: { key: BreakdownDimension; label: string }[] = [
  { key: "tag", label: "Setup" },
  { key: "symbol", label: "Symbol" },
  { key: "side", label: "Side" },
  { key: "market", label: "Market" },
  { key: "weekday", label: "Day" },
  { key: "hold", label: "Hold" },
];

/** Trading edge & risk analytics — all-time, range-independent. The aggregate
 *  "where does my edge come from" view that the descriptive tabs don't cover. */
export function Performance() {
  const scope = useSelectedAccountId();
  const isAll = scope === ALL_ACCOUNTS;
  const account = useAccountById(isAll ? undefined : scope);
  const perf = usePerformanceStats(scope);
  const baseCurrency = useAccountBaseCurrency(scope);
  const s = perf.summary;
  const [dim, setDim] = useState<BreakdownDimension>("tag");

  // Collapse the per-trade equity to one point per day (last cumulative) and
  // anchor at $0 the day before the first close — Lightweight Charts needs
  // ascending, unique times.
  const equitySeries = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const p of perf.equity) byDay.set(p.at, p.valueCents);
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (days.length === 0) return [];
    const pts = days.map(([time, cents]) => ({ time, value: cents / 100 }));
    return [{ time: dayBefore(days[0]![0]), value: 0 }, ...pts];
  }, [perf.equity]);

  const segBars = useMemo<BreakdownBar[]>(() => {
    const rows = breakdownBy(perf.rows, dim);
    // Show the biggest movers (either direction), not just top winners.
    return [...rows]
      .sort((a, b) => Math.abs(b.pnlCents) - Math.abs(a.pnlCents))
      .slice(0, 10)
      .map((r) => ({
        label: r.label,
        amount: r.pnlCents,
        tone: toneOf(r.pnlCents),
        value: formatMoney(r.pnlCents, baseCurrency, true),
        sub: `${r.count} · ${Math.round(r.winRate * 100)}%`,
      }));
  }, [perf.rows, dim, baseCurrency]);

  const hasR = perf.rBuckets.some((b) => b.count > 0);
  const rBars: BreakdownBar[] = perf.rBuckets.map((b) => ({
    label: b.label,
    amount: b.count,
    tone: b.positive ? "gain" : "loss",
    value: String(b.count),
    sub: b.pnlCents !== 0 ? formatMoney(b.pnlCents, baseCurrency, true) : undefined,
  }));

  const subtitle = `All-time · ${isAll ? "All accounts" : account?.name ?? "Account"}`;

  if (s.trades === 0) {
    return (
      <>
        <Topbar title="Performance" subtitle={subtitle} />
        <Card>
          <div className="emptyState">
            <div className="emptyState__title">No closed trades yet</div>
            <div className="emptyState__body">
              Close a few trades and your edge — expectancy, drawdown, what works
              and what doesn't — shows up here.
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <Topbar title="Performance" subtitle={subtitle} />

      {/* Hero: all-time equity curve + the headline edge/risk figures. Net P&L
          is the one number that matters most — it leads at display scale; the
          rest support it a tier down. */}
      <Card>
        <div className="perfHero__chartLabel">Equity curve</div>
        <PerformanceChart data={equitySeries} height={220} format="currency" step currency={baseCurrency} />
        <div className="perfHero__stats">
          <div className="perfHero__primary">
            <span className="stat__label">Net P&L</span>
            <span className="perfHero__primaryValue" style={colorFor(s.netCents)}>
              {formatMoney(s.netCents, baseCurrency, true)}
            </span>
            <span className="perfHero__primaryMeta">all-time realized</span>
          </div>
          <div className="perfHero__secondary">
            <Stat
              label="Max Drawdown"
              value={<span style={colorFor(-1)}>−{formatMoney(s.maxDrawdownCents, baseCurrency)}</span>}
              delta={
                s.maxDrawdownPct != null
                  ? { value: formatPct(s.maxDrawdownPct), tone: "loss" }
                  : undefined
              }
            />
            <Stat
              label="Win Rate"
              value={`${Math.round(s.winRate * 100)}%`}
              delta={{ value: `${s.wins}W · ${s.losses}L`, tone: "neutral" }}
            />
            <Stat
              label="Expectancy"
              value={
                <span style={colorFor(s.expectancyCents)}>
                  {formatMoney(s.expectancyCents, baseCurrency, true)}
                </span>
              }
              delta={{ value: "per trade", tone: "neutral" }}
            />
          </div>
        </div>
      </Card>

      {/* Edge */}
      <div className="sectionHead">
        <h2 className="sectionTitle">Edge</h2>
      </div>
      <Card>
        <div className="perfGrid perfGrid--detail">
          <Stat
            label="Profit Factor"
            value={
              s.profitFactor != null ? (
                <span style={colorFor(s.profitFactor >= 1 ? 1 : -1)}>
                  {s.profitFactor.toFixed(2)}×
                </span>
              ) : (
                <Dash />
              )
            }
          />
          <Stat
            label="Payoff Ratio"
            value={s.payoffRatio != null ? `${s.payoffRatio.toFixed(2)}×` : <Dash />}
          />
          <Stat
            label="Avg R"
            value={
              s.avgR != null ? (
                <span style={colorFor(s.avgR)}>{`${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(2)}R`}</span>
              ) : (
                <Dash />
              )
            }
          />
          <Stat
            label="Avg Win"
            value={<span style={colorFor(1)}>{formatMoney(s.avgWinCents, baseCurrency, true)}</span>}
          />
          <Stat
            label="Avg Loss"
            value={<span style={colorFor(-1)}>{formatMoney(s.avgLossCents, baseCurrency, true)}</span>}
          />
          <Stat label="Trades" value={String(s.trades)} />
        </div>
      </Card>

      {/* Consistency */}
      <div className="sectionHead">
        <h2 className="sectionTitle">Consistency</h2>
      </div>
      <Card>
        <div className="perfGrid perfGrid--detail">
          <Stat
            label="Current Streak"
            value={
              s.currentStreak === 0 ? (
                <Dash />
              ) : (
                <span style={colorFor(s.currentStreak)}>
                  {`${Math.abs(s.currentStreak)} ${s.currentStreak > 0 ? "W" : "L"}`}
                </span>
              )
            }
          />
          <Stat label="Longest Win" value={<span style={colorFor(1)}>{`${s.longestWinStreak}W`}</span>} />
          <Stat label="Longest Loss" value={<span style={colorFor(-1)}>{`${s.longestLossStreak}L`}</span>} />
          <Stat
            label="Green Days"
            value={`${Math.round(s.pctGreenDays * 100)}%`}
            delta={{ value: `${s.greenDays} / ${s.greenDays + s.redDays}`, tone: "neutral" }}
          />
          <Stat label="Avg Up Day" value={<span style={colorFor(1)}>{formatMoney(s.avgUpDayCents, baseCurrency, true)}</span>} />
          <Stat label="Avg Down Day" value={<span style={colorFor(-1)}>{formatMoney(s.avgDownDayCents, baseCurrency, true)}</span>} />
        </div>
      </Card>

      {/* Breakdown by dimension */}
      <div className="sectionHead">
        <h2 className="sectionTitle">Breakdown</h2>
        <div className="chartSource" role="tablist" aria-label="Breakdown dimension">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={dim === d.key}
              className={
                dim === d.key ? "chartSource__seg chartSource__seg--active" : "chartSource__seg"
              }
              onClick={() => setDim(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <Card>
        <BreakdownBars bars={segBars} />
      </Card>

      {/* R-multiple distribution */}
      {hasR && (
        <>
          <div className="sectionHead">
            <h2 className="sectionTitle">R-Multiple Distribution</h2>
          </div>
          <Card>
            <BreakdownBars bars={rBars} />
          </Card>
        </>
      )}
    </>
  );
}

function colorFor(signed: number): { color: string } {
  const tone = toneOf(signed);
  return { color: tone === "neutral" ? "var(--text-primary)" : `var(--${tone})` };
}

function Dash() {
  return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
}

/** ISO date one day before the given YYYY-MM-DD key. */
function dayBefore(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
