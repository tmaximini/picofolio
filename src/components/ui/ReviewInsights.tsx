import { Link } from "react-router-dom";
import { Card, InfoTip, Stat } from "@/components/primitives";
import { formatMoney, formatMoneyDelta, toneOf } from "@/lib/money";
import type { LabelStat, ReviewInsights as Insights } from "@/lib/review";

type ReviewInsightsProps = { insights: Insights; currency: string };

const pct = (r: number) => `${Math.round(r * 100)}%`;

/**
 * What the trade reviews say: which mistakes cost the most, which habits pay,
 * and how trades with a mistake compare with clean ones.
 */
export function ReviewInsights({ insights, currency }: ReviewInsightsProps) {
  const { reviewed, closed, mistakes, good, withMistakes, clean } = insights;

  if (reviewed === 0) {
    return (
      <Card className="returns">
        <div className="emptyState">
          <div className="emptyState__title">No reviewed trades yet</div>
          <div className="emptyState__body">
            Label your closed trades with the mistakes and habits behind them, and this shows
            which ones cost you money and which ones pay.
          </div>
          <Link to="/review" className="btn">Start reviewing</Link>
        </div>
      </Card>
    );
  }

  const tone = (c: number) => {
    const t = toneOf(c);
    return t === "neutral" ? undefined : { color: `var(--${t})` };
  };

  return (
    <Card className="returns">
      <div className="insights__head">
        <Stat label="Reviewed" value={`${reviewed} / ${closed}`} delta={{ value: `${pct(closed ? reviewed / closed : 0)} of closed trades`, tone: "neutral" }} />
        <Stat
          label={
            <>
              Trades with mistakes
              <InfoTip>Net P&amp;L of every reviewed trade tagged with at least one mistake — what those trades cost (or earned despite the mistake).</InfoTip>
            </>
          }
          value={<span style={tone(withMistakes.netCents)}>{formatMoneyDelta(withMistakes.netCents, currency)}</span>}
          delta={{ value: `${withMistakes.trades} trades · ${pct(withMistakes.winRate)} win`, tone: "neutral" }}
        />
        <Stat
          label={
            <>
              Clean trades
              <InfoTip>Reviewed trades with no mistake label — the baseline your mistakes are measured against.</InfoTip>
            </>
          }
          value={<span style={tone(clean.netCents)}>{formatMoneyDelta(clean.netCents, currency)}</span>}
          delta={{ value: `${clean.trades} trades · ${pct(clean.winRate)} win`, tone: "neutral" }}
        />
        <Stat
          label="Win rate gap"
          value={withMistakes.trades && clean.trades ? `${Math.round((clean.winRate - withMistakes.winRate) * 100)} pts` : "—"}
          delta={{ value: "clean vs with mistakes", tone: "neutral" }}
        />
      </div>

      <div className="insights__cols">
        <Column title="Costliest mistakes" stats={mistakes} currency={currency} empty="No mistakes tagged yet." />
        <Column title="What works" stats={good} currency={currency} empty="No good habits tagged yet." />
      </div>
    </Card>
  );
}

function Column({ title, stats, currency, empty }: { title: string; stats: LabelStat[]; currency: string; empty: string }) {
  return (
    <div>
      <div className="insights__colTitle">{title}</div>
      {stats.length === 0 ? (
        <div className="insights__empty">{empty}</div>
      ) : (
        stats.map((s) => (
          <div className="insightRow" key={s.label.id}>
            <i style={{ background: s.label.color }} aria-hidden />
            <span>
              {s.label.name}
              <div className="insightRow__meta num">
                {s.trades} trade{s.trades === 1 ? "" : "s"} · {pct(s.winRate)} win · avg {formatMoney(s.avgCents, currency, true)}
              </div>
            </span>
            <span />
            <span className={`insightRow__value num tone-${toneOf(s.netCents)}`}>{formatMoneyDelta(s.netCents, currency)}</span>
          </div>
        ))
      )}
    </div>
  );
}
