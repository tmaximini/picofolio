import { Card, Stat } from "@/components/primitives";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  useAccountDeltaCents,
  useAccountValueCents,
} from "@/store/selectors";

type AccountStatCardProps = {
  /** Account name (matches Account.name in the store). */
  accountName: string;
};

export function AccountStatCard({ accountName }: AccountStatCardProps) {
  const valueCents = useAccountValueCents(accountName);
  const deltaCents = useAccountDeltaCents(accountName, "1W");

  if (valueCents == null) {
    return (
      <Card>
        <Stat label={accountName} value={<Dash />} />
      </Card>
    );
  }

  const tone = deltaCents == null ? "neutral" : toneOf(deltaCents);
  const pct = deltaCents == null || valueCents === 0 ? null : deltaCents / valueCents;

  return (
    <Card>
      <Stat
        label={accountName}
        value={formatCents(valueCents, true)}
        delta={
          pct == null
            ? undefined
            : { value: formatPct(pct), tone }
        }
      />
    </Card>
  );
}

function Dash() {
  return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
}
