import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Topbar } from "@/components/layout";
import { Badge, Button, Card, Kbd } from "@/components/primitives";
import {
  AccountStatCard,
  HoldingsTable,
  PortfolioPerformanceCard,
} from "@/components/ui";
import {
  useAccounts,
  useHoldings,
  useRefreshAll,
  useSyncing,
} from "@/store/selectors";

export function Overview() {
  const accounts = useAccounts();
  const holdings = useHoldings();
  const refreshAll = useRefreshAll();
  const syncing = useSyncing();

  // Initial load on mount — kicks off Yahoo fetches for every holding.
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <>
      <Topbar
        title="Overview"
        subtitle="All accounts · Week of May 18 – 24, 2026"
        actions={
          <Button onClick={() => refreshAll()} disabled={syncing}>
            <RefreshCw
              size={13}
              strokeWidth={1.75}
              className={syncing ? "spin" : undefined}
            />
            <span>{syncing ? "Syncing…" : "Sync prices"}</span>
            <Kbd>⌘R</Kbd>
          </Button>
        }
      />

      <PortfolioPerformanceCard />

      <div className="accountRow">
        {accounts.map((a) => (
          <AccountStatCard key={a.id} accountName={a.name} />
        ))}
      </div>

      <div className="sectionHead">
        <h2 className="sectionTitle">Holdings</h2>
        <Badge>{holdings.length} positions</Badge>
      </div>

      <Card flush>
        <HoldingsTable />
      </Card>
    </>
  );
}
