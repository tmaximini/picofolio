import { Pencil } from "lucide-react";
import { Button } from "@/components/primitives";
import { formatMoney } from "@/lib/money";
import type { Account } from "@/lib/mock";
import { useIbkrConnections } from "@/store/selectors";

const USE_LABEL = { trading: "Trading", investing: "Investing", mixed: "Mixed" } as const;

/** The account at a glance — identity, source and the figures that feed its
 *  returns. Editing happens in the account modal (one place to change them). */
export function AccountDetailsCard({ account, onEdit }: { account: Account; onEdit: () => void }) {
  const connections = useIbkrConnections();
  const conn = connections.find((c) => c.id === account.flexConnectionId);
  const base = account.baseCurrency ?? "USD";
  const ibkrIds = conn?.lastSummary?.accountIds ?? [];

  return (
    <section className="settingsCard acctHead">
      <div className="settingsCard__head">
        <div className="acctHead__id">
          <span className="acctHead__dot" style={{ background: account.color }} aria-hidden />
          <div>
            <h2 className="acctHead__name">{account.name}</h2>
            <div className="settingsCard__sub">
              {conn
                ? `Synced from Interactive Brokers${ibkrIds.length ? ` · ${ibkrIds.join(", ")}` : ""}`
                : "Manual account"}
            </div>
          </div>
        </div>
        <Button onClick={onEdit}>
          <Pencil size={12} strokeWidth={1.75} />
          <span>Edit details</span>
        </Button>
      </div>
      <dl className="acctFacts">
        <div>
          <dt>Base currency</dt>
          <dd className="mono">{base}</dd>
        </div>
        <div>
          <dt>Cash</dt>
          <dd className="num">{formatMoney(account.cashCents, base)}</dd>
        </div>
        <div>
          <dt title="Deposits minus withdrawals — the basis for rate of return">Net contributions</dt>
          <dd className="num">{formatMoney(account.netContributionsCents, base)}</dd>
        </div>
        <div>
          <dt>Primary use</dt>
          <dd>{USE_LABEL[account.primaryUse ?? "mixed"]}</dd>
        </div>
      </dl>
    </section>
  );
}
