import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Topbar } from "@/components/layout";
import { Badge, Button, Card, EmptyState, Kbd, Stat } from "@/components/primitives";
import {
  AccountStatCard,
  HoldingsTable,
  JournalStats,
  PerformanceCard,
  PortfolioPerformanceCard,
} from "@/components/ui";
import { TradeViewModal } from "@/features/trades/TradeViewModal";
import type { AccountUse } from "@/lib/mock";
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
  useSeedDemoData,
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
  const setSelected = useSetSelectedAccount();
  const seedDemo = useSeedDemoData();

  // Post-"Start empty" state: no accounts at all. Offer the two ways forward
  // rather than rendering a wall of zeroed-out cards.
  if (accounts.length === 0) {
    return (
      <>
        <Topbar title="Overview" subtitle="All accounts" />
        <EmptyState
          title="No accounts yet"
          body="Connect an Interactive Brokers account to track real positions and trades, or load the demo data to explore Picofolio first."
          action={
            <>
              <Button
                variant="primary"
                onClick={() => {
                  seedDemo();
                  window.location.reload();
                }}
              >
                Load demo data
              </Button>
              <Link to="/settings" className="btn">
                Connect IBKR
              </Link>
            </>
          }
        />
      </>
    );
  }

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

      {/* Combined: Investing leads (no single account's primaryUse to honor). */}
      <InvestingPanel />
      <TradingPanel scope={ALL_ACCOUNTS} />
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

          {/* Two lenses on the same account. Order follows the soft primaryUse
              hint; neither is ever hidden — an empty lens collapses to a line. */}
          {lensOrder(account.primaryUse).map((lens) =>
            lens === "investing" ? (
              <InvestingPanel
                key="investing"
                accountId={accountId}
                cashCents={account.cashCents}
              />
            ) : (
              <TradingPanel key="trading" scope={accountId} />
            ),
          )}
        </>
      )}
    </>
  );
}

/** Panel order from the account's soft lens hint: trading-led accounts show
 *  the Trading panel first; everything else leads with Investing. */
function lensOrder(use: AccountUse | undefined): ("investing" | "trading")[] {
  return use === "trading" ? ["trading", "investing"] : ["investing", "trading"];
}

// ---------- Lenses ----------

/** Investing lens — the holdings table. Combined when no accountId is given. */
function InvestingPanel({
  accountId,
  cashCents,
}: {
  accountId?: string;
  cashCents?: number;
}) {
  const holdings = useHoldings();
  const positions = accountId
    ? holdings.filter((h) => h.accountId === accountId).length
    : holdings.length;

  return (
    <section>
      <div className="sectionHead">
        <h2 className="sectionTitle">Investing</h2>
        <Badge>{positions} positions</Badge>
      </div>
      {positions === 0 ? (
        <LensEmpty>No positions yet</LensEmpty>
      ) : (
        <Card flush>
          <HoldingsTable accountId={accountId} cashCents={cashCents} />
        </Card>
      )}
    </section>
  );
}

/** Trading lens — the journal summary. Empty (no trades in scope) collapses. */
function TradingPanel({ scope }: { scope: string }) {
  const trades = useTrades();
  const count =
    scope === ALL_ACCOUNTS
      ? trades.length
      : trades.filter((t) => t.accountId === scope).length;
  const [viewTradeId, setViewTradeId] = useState<string | null>(null);

  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <div className="sectionHead">
        <h2 className="sectionTitle">Trading</h2>
        <Link to="/activity" className="sectionHead__link">
          View journal
          <ArrowRight size={13} strokeWidth={1.75} />
        </Link>
      </div>
      {count === 0 ? (
        <LensEmpty>No trades logged yet</LensEmpty>
      ) : (
        <JournalStats scope={scope} onOpenTrade={setViewTradeId} />
      )}
      {viewTradeId && (
        <TradeViewModal tradeId={viewTradeId} onClose={() => setViewTradeId(null)} />
      )}
    </section>
  );
}

/** One-line collapsed state for a lens with no data — keeps the two-panel
 *  rhythm consistent instead of vanishing. */
function LensEmpty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <div className="overviewLensEmpty">{children}</div>
    </Card>
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
