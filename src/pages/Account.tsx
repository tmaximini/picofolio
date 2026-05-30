import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Topbar } from "@/components/layout";
import { Badge, Button, Card, Kbd, Stat } from "@/components/primitives";
import { HoldingsTable } from "@/components/ui";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  useAccountById,
  useAccountDeltaCents,
  useAccountValueCents,
  useHoldings,
  useRefreshAll,
  useSyncing,
} from "@/store/selectors";

export function Account() {
  const { accountId } = useParams<{ accountId: string }>();
  const account = useAccountById(accountId);
  const allHoldings = useHoldings();
  const refreshAll = useRefreshAll();
  const syncing = useSyncing();
  const value = useAccountValueCents(account?.name ?? "");
  const dayDelta = useAccountDeltaCents(account?.name ?? "", "1D");
  const weekDelta = useAccountDeltaCents(account?.name ?? "", "1W");
  const monthDelta = useAccountDeltaCents(account?.name ?? "", "1M");
  const ytdDelta = useAccountDeltaCents(account?.name ?? "", "YTD");

  // Account page is the natural place to kick off a sync — if a user lands
  // here on first load, we'd otherwise show all dashes.
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  if (!accountId) return <Navigate to="/" replace />;
  if (!account) {
    return (
      <>
        <Topbar title="Account not found" subtitle={`No account with id "${accountId}"`} />
      </>
    );
  }

  const positions = allHoldings.filter((h) => h.account === account.name).length;
  const kindLabel = account.kind === "trading" ? "Active trading" : "Long-term";

  return (
    <>
      <Topbar
        title={account.name}
        subtitle={`${kindLabel} · ${formatCents(account.cashCents)} cash · ${positions} ${positions === 1 ? "position" : "positions"}`}
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

      <Card style={{ marginBottom: "var(--space-5)" }}>
        <div className="accountStatsRow">
          <Stat
            label="Total value"
            display
            value={value != null ? formatCents(value) : <Dash />}
          />
          <DeltaStat label="Day" cents={dayDelta} baseValue={value} />
          <DeltaStat label="Week" cents={weekDelta} baseValue={value} />
          <DeltaStat label="Month" cents={monthDelta} baseValue={value} />
          <DeltaStat label="YTD" cents={ytdDelta} baseValue={value} />
        </div>
      </Card>

      <div className="sectionHead">
        <h2 className="sectionTitle">Holdings</h2>
        <Badge>{positions} positions</Badge>
      </div>

      <Card flush>
        <HoldingsTable account={account.name} cashCents={account.cashCents} />
      </Card>
    </>
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
  if (cents == null) {
    return <Stat label={label} value={<Dash />} />;
  }
  const tone = toneOf(cents);
  const color = tone === "neutral" ? "var(--text-primary)" : `var(--${tone})`;
  // Express delta as % of the period-start value: start = current − delta.
  const start =
    baseValue != null && baseValue - cents !== 0 ? baseValue - cents : null;
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
