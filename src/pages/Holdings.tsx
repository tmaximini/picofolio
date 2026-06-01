import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Topbar } from "@/components/layout";
import { Badge, Button, Card, Kbd } from "@/components/primitives";
import { HoldingsTable } from "@/components/ui";
import { ALL_ACCOUNTS } from "@/store";
import {
  useAccountById,
  useHoldings,
  useRefreshAll,
  useSelectedAccountId,
  useSyncing,
} from "@/store/selectors";

export function Holdings() {
  const scope = useSelectedAccountId();
  const account = useAccountById(scope === ALL_ACCOUNTS ? undefined : scope);
  const holdings = useHoldings();
  const refreshAll = useRefreshAll();
  const syncing = useSyncing();

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const isAll = scope === ALL_ACCOUNTS;
  const rows = isAll ? holdings : holdings.filter((h) => h.accountId === scope);

  return (
    <>
      <Topbar
        title="Holdings"
        subtitle={isAll ? "All accounts" : (account?.name ?? "Account")}
        actions={
          <Button onClick={() => refreshAll()} disabled={syncing}>
            <RefreshCw size={13} strokeWidth={1.75} className={syncing ? "spin" : undefined} />
            <span>{syncing ? "Syncing…" : "Sync prices"}</span>
            <Kbd>⌘R</Kbd>
          </Button>
        }
      />

      <div className="sectionHead">
        <h2 className="sectionTitle">Positions</h2>
        <Badge>{rows.length} positions</Badge>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="emptyState">
            <div className="emptyState__title">No positions</div>
            <div className="emptyState__body">
              {isAll
                ? "Connect an IBKR account or add trades to see holdings here."
                : `${account?.name ?? "This account"} has no open positions yet.`}
            </div>
          </div>
        </Card>
      ) : (
        <Card flush>
          {isAll ? (
            <HoldingsTable />
          ) : (
            <HoldingsTable accountId={scope} cashCents={account?.cashCents} />
          )}
        </Card>
      )}
    </>
  );
}
