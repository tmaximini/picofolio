import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Topbar } from "@/components/layout";
import { Badge, Button, Card, Kbd } from "@/components/primitives";
import {
  AccountStatCard,
  HoldingsTable,
  PortfolioPerformanceCard,
  WeeklyPLSparks,
} from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  useAccounts,
  useHoldings,
  useRefreshAll,
  useSyncing,
  useWeeklyPnl,
} from "@/store/selectors";

export function Overview() {
  const accounts = useAccounts();
  const holdings = useHoldings();
  const weeklyPnl = useWeeklyPnl();
  const refreshAll = useRefreshAll();
  const syncing = useSyncing();

  // Initial load on mount — kicks off Yahoo fetches for every holding.
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const tradingPnlYtd = weeklyPnl.reduce((a, w) => a + w.pnlCents, 0);

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

      <Card style={{ marginBottom: "var(--space-6)" }}>
        <div className="cardHead">
          <div>
            <div className="cardHead__name">Trading — Weekly P&amp;L</div>
            <div className="cardHead__sub">
              Absolute $ generated per week · last 14 weeks
            </div>
          </div>
          <Badge variant="gain">{formatCents(tradingPnlYtd, true)} YTD</Badge>
        </div>
        <WeeklyPLSparks />
      </Card>

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
