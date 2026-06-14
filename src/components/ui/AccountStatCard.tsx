import { Card, Delta } from "@/components/primitives";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  useAccountById,
  useAccountReturn,
  useAccountValueCents,
  usePortfolioValueCents,
} from "@/store/selectors";

type AccountStatCardProps = {
  /** Account.id in the store. */
  accountId: string;
  /** Click handler — used to scope the app to this account. */
  onClick?: () => void;
};

export function AccountStatCard({ accountId, onClick }: AccountStatCardProps) {
  const account = useAccountById(accountId);
  const valueCents = useAccountValueCents(accountId);
  const ret = useAccountReturn(accountId);
  const portfolioCents = usePortfolioValueCents();

  if (!account) return null;

  if (valueCents == null) {
    return (
      <Card onClick={onClick} interactive={Boolean(onClick)}>
        <div className="stat">
          <span className="accountStat__head">
            <span className="accountStat__dot" style={{ background: account.color }} />
            <span className="stat__label">{account.name}</span>
          </span>
          <span className="stat__value">
            <Dash />
          </span>
        </div>
      </Card>
    );
  }

  // Headline delta = rate-of-return vs. net contributions (NOT Σ realized trades).
  const tone = ret?.gainCents == null ? "neutral" : toneOf(ret.gainCents);
  const share =
    portfolioCents != null && portfolioCents > 0 ? valueCents / portfolioCents : null;

  return (
    <Card onClick={onClick} interactive={Boolean(onClick)}>
      <div className="stat">
        <div className="accountStat__head">
          <span className="accountStat__headLeft">
            <span className="accountStat__dot" style={{ background: account.color }} />
            <span className="stat__label">{account.name}</span>
          </span>
          {share != null && (
            <span className="accountStat__share" title="Share of total portfolio">
              {(share * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <span className="stat__value">{formatCents(valueCents, true)}</span>
        {ret?.returnPct != null && <Delta tone={tone}>{formatPct(ret.returnPct)}</Delta>}
      </div>
    </Card>
  );
}

function Dash() {
  return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
}
