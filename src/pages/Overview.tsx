import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/layout";
import { Badge, Button, Card, Kbd, Tabs } from "@/components/primitives";
import {
  AccountStatCard,
  AllocationBar,
  HeroValueCard,
  HoldingsTable,
  WeeklyPLSparks,
} from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  useAccounts,
  useHoldings,
  usePortfolioDeltaCents,
  useRefreshAll,
  useSyncing,
  useWeeklyPnl,
} from "@/store/selectors";

const RANGES = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "YTD", label: "YTD" },
  { value: "All", label: "All" },
] as const;

type Range = (typeof RANGES)[number]["value"];

export function Overview() {
  const [range, setRange] = useState<Range>("1W");
  const accounts = useAccounts();
  const holdings = useHoldings();
  const weeklyPnl = useWeeklyPnl();
  const refreshAll = useRefreshAll();
  const syncing = useSyncing();
  const ytdDelta = usePortfolioDeltaCents("YTD");

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
          <>
            <Tabs<Range> value={range} onChange={setRange} options={RANGES} />
            <Button onClick={() => refreshAll()} disabled={syncing}>
              <RefreshCw
                size={13}
                strokeWidth={1.75}
                className={syncing ? "spin" : undefined}
              />
              <span>{syncing ? "Syncing…" : "Sync prices"}</span>
              <Kbd>⌘R</Kbd>
            </Button>
          </>
        }
      />

      <div className="heroRow">
        <HeroValueCard />
        {accounts.map((a) => (
          <AccountStatCard key={a.id} accountName={a.name} />
        ))}
      </div>

      <div className="grid2">
        <Card>
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

        <Card>
          <div className="cardHead">
            <div>
              <div className="cardHead__name">Allocation</div>
              <div className="cardHead__sub">By account</div>
            </div>
            {ytdDelta != null && (
              <Badge>{formatCents(ytdDelta, true)} YTD</Badge>
            )}
          </div>
          <AllocationBar />
        </Card>
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
