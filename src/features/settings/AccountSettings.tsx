import { Button } from "@/components/primitives";
import type { Account } from "@/lib/mock";
import { useClearDemoForAccount, useHoldings, usePushToast, useTrades } from "@/store/selectors";
import { AccountDetailsCard } from "./AccountDetailsCard";
import { DangerZone } from "./DangerZone";
import { IbkrSyncCard } from "./IbkrSyncCard";

/** Everything scoped to one account, top (identity) to bottom (destructive). */
export function AccountSettings({ account, onEdit }: { account: Account; onEdit: () => void }) {
  return (
    <>
      <AccountDetailsCard account={account} onEdit={onEdit} />
      <DemoNotice account={account} />
      <IbkrSyncCard key={account.id} account={account} />
      <DangerZone account={account} />
    </>
  );
}

/** Shown only while the account still carries seeded sample data. */
function DemoNotice({ account }: { account: Account }) {
  const trades = useTrades();
  const holdings = useHoldings();
  const clear = useClearDemoForAccount();
  const pushToast = usePushToast();
  const demoTrades = trades.filter((t) => t.source === "demo" && t.accountId === account.id).length;
  const demoHoldings = holdings.filter((h) => h.source === "demo" && h.accountId === account.id).length;
  if (demoTrades === 0 && demoHoldings === 0) return null;

  return (
    <div className="demoNotice">
      <span>
        {account.name} holds sample data — <span className="num">{demoTrades}</span> trade
        {demoTrades === 1 ? "" : "s"}, <span className="num">{demoHoldings}</span> position
        {demoHoldings === 1 ? "" : "s"}. Clear it once your real data is in.
      </span>
      <Button
        size="sm"
        onClick={() => {
          clear(account.id);
          pushToast({ kind: "info", title: `Cleared sample data from ${account.name}`, duration: 3000 });
        }}
      >
        Clear sample data
      </Button>
    </div>
  );
}
