import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/layout";
import { Button, Kbd } from "@/components/primitives";
import {
  DateRangePills,
  JournalStats,
  TradeSetupRow,
  TradeTable,
} from "@/components/ui";
import { labelForRange } from "@/lib/dateRange";
import { deriveTotals } from "@/lib/tradeMath";
import type { TradeStatus } from "@/lib/trades";
import { TradeViewModal } from "@/features/trades/TradeViewModal";
import { NewTradeModal } from "@/features/trades/NewTradeModal";
import {
  useFilteredTrades,
  useJournalRange,
  useSetJournalRange,
  useSetups,
} from "@/store/selectors";

const STATUS_FILTERS: {
  key: TradeStatus;
  label: string;
  tone: "gain" | "loss" | "neutral";
}[] = [
  { key: "WIN", label: "Wins", tone: "gain" },
  { key: "LOSS", label: "Losses", tone: "loss" },
  { key: "OPEN", label: "Open", tone: "neutral" },
];

export function Trading() {
  const range = useJournalRange();
  const setRange = useSetJournalRange();
  const trades = useFilteredTrades();
  const setups = useSetups();

  // Empty set = show all; otherwise show trades whose status is selected.
  const [statuses, setStatuses] = useState<Set<TradeStatus>>(new Set());
  const [viewTradeId, setViewTradeId] = useState<string | null>(null);
  const [newTradeOpen, setNewTradeOpen] = useState(false);

  const visibleTrades = useMemo(() => {
    if (statuses.size === 0) return trades;
    return trades.filter((t) => statuses.has(deriveTotals(t).status));
  }, [trades, statuses]);

  const toggleStatus = (k: TradeStatus) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <>
      <Topbar
        title="Trading Journal"
        subtitle={labelForRange(range)}
        actions={
          <Button
            onClick={() => setNewTradeOpen(true)}
            style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}
          >
            <Plus size={13} strokeWidth={2} />
            <span>New trade</span>
            <Kbd>N</Kbd>
          </Button>
        }
      />

      <DateRangePills value={range} onChange={setRange} />

      <JournalStats />

      {setups.length > 0 && (
        <div className="journalSetups">
          {setups.map((s) => (
            <TradeSetupRow key={s.id} setup={s} />
          ))}
        </div>
      )}

      <div className="journalListHead">
        <div className="statusFilter" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => {
            const active = statuses.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                className={`statusChip statusChip--${f.tone}${active ? " statusChip--active" : ""}`}
                onClick={() => toggleStatus(f.key)}
              >
                <span className="statusChip__dot" />
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="journalListHead__count">
          {visibleTrades.length} {visibleTrades.length === 1 ? "trade" : "trades"}
        </span>
      </div>

      <div className="card card--flush" style={{ overflow: "hidden" }}>
        <TradeTable trades={visibleTrades} onRowClick={setViewTradeId} />
      </div>

      {viewTradeId && (
        <TradeViewModal
          tradeId={viewTradeId}
          onClose={() => setViewTradeId(null)}
        />
      )}

      {newTradeOpen && (
        <NewTradeModal onClose={() => setNewTradeOpen(false)} />
      )}
    </>
  );
}
