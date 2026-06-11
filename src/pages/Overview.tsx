import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout";
import { Badge, Button, Card, Kbd, Stat } from "@/components/primitives";
import {
  AccountStatCard,
  HoldingsTable,
  PerformanceCard,
  PortfolioPerformanceCard,
} from "@/components/ui";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { ALL_ACCOUNTS } from "@/store";
import {
  useAccountById,
  useAccountDeltaCents,
  useAccountReturn,
  useAccountValueCents,
  useAccountValueSeries,
  useAccounts,
  useHoldings,
  usePushToast,
  useRefreshAll,
  useSelectedAccountId,
  useSetSelectedAccount,
  useSyncIbkrConnection,
  useTrades,
  useSyncing,
} from "@/store/selectors";

/**
 * One Sync button: pulls fresh trades/positions/cash from every linked IBKR
 * connection in scope (one account, or all of them at "All Accounts"), then
 * refreshes Yahoo prices. Toasts narrate progress; the per-connection sync
 * pushes its own success/up-to-date/failure toast.
 */
function SyncButton({ accountId }: { accountId?: string }) {
  const accounts = useAccounts();
  const refreshAll = useRefreshAll();
  const pricesSyncing = useSyncing();
  const syncConn = useSyncIbkrConnection();
  const pushToast = usePushToast();
  const [running, setRunning] = useState(false);

  // Connections to pull: the scoped account's, or all linked accounts at ALL.
  const connIds = useMemo(() => {
    const scoped = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
    return scoped
      .map((a) => a.flexConnectionId)
      .filter((id): id is string => Boolean(id));
  }, [accounts, accountId]);

  const onSync = async () => {
    if (running) return;
    setRunning(true);
    try {
      if (connIds.length > 0) {
        pushToast({
          kind: "info",
          title:
            connIds.length === 1
              ? "Syncing from IBKR…"
              : `Syncing ${connIds.length} accounts from IBKR…`,
          body: "Pulling trades, positions & cash — can take up to a minute.",
          duration: 4000,
        });
      }
      for (const id of connIds) {
        await syncConn(id); // pushes its own result toast
      }
      await refreshAll({ force: true }); // user asked — bypass the freshness window
      if (connIds.length === 0) {
        pushToast({ kind: "info", title: "Prices updated", duration: 2500 });
      }
    } finally {
      setRunning(false);
    }
  };

  const busy = running || pricesSyncing;
  return (
    <Button onClick={onSync} disabled={busy}>
      <RefreshCw size={13} strokeWidth={1.75} className={busy ? "spin" : undefined} />
      <span>{busy ? "Syncing…" : "Sync"}</span>
      <Kbd>R</Kbd>
    </Button>
  );
}

export function Overview() {
  const scope = useSelectedAccountId();
  const refreshAll = useRefreshAll();

  // Initial load on mount — kicks off Yahoo fetches for every holding.
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  if (scope === ALL_ACCOUNTS) return <ConsolidatedOverview />;
  return <AccountOverview accountId={scope} />;
}

// ---------- All Accounts (consolidated) ----------

function ConsolidatedOverview() {
  const accounts = useAccounts();
  const holdings = useHoldings();
  const setSelected = useSetSelectedAccount();

  return (
    <>
      <Topbar title="Overview" subtitle="All accounts" actions={<SyncButton />} />

      <PortfolioPerformanceCard />

      <div className="accountRow">
        {accounts.map((a) => (
          <AccountStatCard
            key={a.id}
            accountId={a.id}
            onClick={() => setSelected(a.id)}
          />
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

// ---------- Single account ----------

function AccountOverview({ accountId }: { accountId: string }) {
  const account = useAccountById(accountId);
  const allHoldings = useHoldings();
  const trades = useTrades();
  const value = useAccountValueCents(accountId);
  const valueSeries = useAccountValueSeries(accountId);
  const ret = useAccountReturn(accountId);
  const dayDelta = useAccountDeltaCents(accountId, "1D");
  const weekDelta = useAccountDeltaCents(accountId, "1W");
  const monthDelta = useAccountDeltaCents(accountId, "1M");

  if (!account) {
    return <Topbar title="Account not found" subtitle="Pick another from the switcher" />;
  }

  const positions = allHoldings.filter((h) => h.accountId === accountId).length;
  const accountTrades = trades.filter((t) => t.accountId === accountId).length;
  const isEmpty = positions === 0 && accountTrades === 0;

  return (
    <>
      <Topbar
        title={account.name}
        subtitle={`${formatCents(account.cashCents)} cash · ${positions} ${positions === 1 ? "position" : "positions"}`}
        actions={<SyncButton accountId={accountId} />}
      />

      {isEmpty ? (
        <EmptyAccount name={account.name} hasConnection={Boolean(account.flexConnectionId)} />
      ) : (
        <>
          <PerformanceCard
            label="Account Value"
            valueCents={value}
            series={valueSeries}
            scope={accountId}
          />

          <Card style={{ marginBottom: "var(--space-5)" }}>
            <div className="accountStatsRow accountStatsRow--deltas">
              <ReturnStatCell
                label="Total Return"
                gainCents={ret?.gainCents ?? null}
                pct={ret?.returnPct ?? null}
              />
              <DeltaStat label="Day" cents={dayDelta} baseValue={value} />
              <DeltaStat label="Week" cents={weekDelta} baseValue={value} />
              <DeltaStat label="Month" cents={monthDelta} baseValue={value} />
            </div>
          </Card>

          <div className="sectionHead">
            <h2 className="sectionTitle">Holdings</h2>
            <Badge>{positions} positions</Badge>
          </div>

          <Card flush>
            <HoldingsTable accountId={accountId} cashCents={account.cashCents} />
          </Card>
        </>
      )}
    </>
  );
}

function EmptyAccount({ name, hasConnection }: { name: string; hasConnection: boolean }) {
  return (
    <Card>
      <div className="emptyState">
        <div className="emptyState__title">{name} is empty</div>
        <div className="emptyState__body">
          {hasConnection
            ? "Sync this account's IBKR connection from Settings, or add a trade to get started."
            : "Connect an IBKR Flex Query in Settings, or add a trade to get started."}
        </div>
      </div>
    </Card>
  );
}

function ReturnStatCell({
  label,
  gainCents,
  pct,
}: {
  label: string;
  gainCents: number | null;
  pct: number | null;
}) {
  if (gainCents == null) return <Stat label={label} value={<Dash />} />;
  const tone = toneOf(gainCents);
  const color = tone === "neutral" ? "var(--text-primary)" : `var(--${tone})`;
  return (
    <Stat
      label={label}
      value={<span style={{ color }}>{formatCents(gainCents)}</span>}
      delta={
        pct != null
          ? { value: formatPct(pct), tone: tone === "neutral" ? "neutral" : tone }
          : undefined
      }
    />
  );
}

function DeltaStat({
  label,
  cents,
  baseValue,
}: {
  label: string;
  cents: number | null;
  baseValue?: number | null;
}) {
  if (cents == null) return <Stat label={label} value={<Dash />} />;
  const tone = toneOf(cents);
  const color = tone === "neutral" ? "var(--text-primary)" : `var(--${tone})`;
  // Express delta as % of the period-start value: start = current − delta.
  const start = baseValue != null && baseValue - cents !== 0 ? baseValue - cents : null;
  const pct = start != null ? cents / start : null;
  return (
    <Stat
      label={label}
      value={<span style={{ color }}>{formatCents(cents)}</span>}
      delta={
        pct != null
          ? { value: formatPct(pct), tone: tone === "neutral" ? "neutral" : tone }
          : undefined
      }
    />
  );
}

function Dash() {
  return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
}
