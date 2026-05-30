import { Plus } from "lucide-react";
import { useState } from "react";
import { Topbar } from "@/components/layout";
import { Button, Kbd } from "@/components/primitives";
import {
  DateRangePills,
  JournalStats,
  TradeSetupRow,
  TradeTable,
} from "@/components/ui";
import { labelForRange } from "@/lib/dateRange";
import { TradeViewModal } from "@/features/trades/TradeViewModal";
import { NewTradeModal } from "@/features/trades/NewTradeModal";
import {
  useFilteredTrades,
  useJournalRange,
  useSetJournalRange,
  useSetups,
} from "@/store/selectors";

export function Trading() {
  const range = useJournalRange();
  const setRange = useSetJournalRange();
  const trades = useFilteredTrades();
  const setups = useSetups();

  const [viewTradeId, setViewTradeId] = useState<string | null>(null);
  const [newTradeOpen, setNewTradeOpen] = useState(false);

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
        <div style={{ marginBottom: "var(--space-3)" }}>
          {setups.map((s) => (
            <TradeSetupRow key={s.id} setup={s} />
          ))}
        </div>
      )}

      <div className="card card--flush" style={{ overflow: "hidden" }}>
        <TradeTable trades={trades} onRowClick={setViewTradeId} />
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
