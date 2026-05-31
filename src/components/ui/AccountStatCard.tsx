import { Card, Delta } from "@/components/primitives";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  useAccountDeltaCents,
  useAccountValueCents,
  usePortfolioValueCents,
} from "@/store/selectors";

type AccountStatCardProps = {
  /** Account name (matches Account.name in the store). */
  accountName: string;
};

export function AccountStatCard({ accountName }: AccountStatCardProps) {
  const valueCents = useAccountValueCents(accountName);
  const deltaCents = useAccountDeltaCents(accountName, "1W");
  const portfolioCents = usePortfolioValueCents();

  if (valueCents == null) {
    return (
      <Card>
        <div className="stat">
          <span className="stat__label">{accountName}</span>
          <span className="stat__value">
            <Dash />
          </span>
        </div>
      </Card>
    );
  }

  const tone = deltaCents == null ? "neutral" : toneOf(deltaCents);
  const pct = deltaCents == null || valueCents === 0 ? null : deltaCents / valueCents;
  const share =
    portfolioCents != null && portfolioCents > 0 ? valueCents / portfolioCents : null;

  return (
    <Card>
      <div className="stat">
        <div className="accountStat__head">
          <span className="stat__label">{accountName}</span>
          {share != null && (
            <span className="accountStat__share" title="Share of total portfolio">
              {(share * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <span className="stat__value">{formatCents(valueCents, true)}</span>
        {pct != null && <Delta tone={tone}>{formatPct(pct)}</Delta>}
      </div>
    </Card>
  );
}

function Dash() {
  return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
}
