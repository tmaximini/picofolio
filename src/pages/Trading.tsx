import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/layout";
import { Button, Kbd } from "@/components/primitives";
import {
  DateRangePills,
  JournalStats,
  NoteRow,
  TradeSetupRow,
  TradeTable,
} from "@/components/ui";
import { NewNoteModal } from "@/features/notes";
import { NewSetupModal } from "@/features/setups";
import type { Note } from "@/lib/notes";
import {
  DEFAULT_DATE_RANGE,
  labelForRange,
  paramToRangeKey,
  rangeKeyToParam,
  type DateRangeKey,
} from "@/lib/dateRange";
import { deriveTotals } from "@/lib/tradeMath";
import type { TradeSetup, TradeStatus } from "@/lib/trades";
import { TradeViewModal } from "@/features/trades/TradeViewModal";
import { NewTradeModal } from "@/features/trades/NewTradeModal";
import { ALL_ACCOUNTS } from "@/store";
import {
  useAccountById,
  useAccounts,
  useDeleteSetup,
  useFilteredTrades,
  useFilteredNotes,
  usePushToast,
  useSelectedAccountId,
  useSetJournalRange,
  useSetups,
} from "@/store/selectors";

/** How many notes the strip shows before collapsing behind "+N more". */
const NOTE_STRIP_LIMIT = 3;

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
  const scope = useSelectedAccountId();
  const isAll = scope === ALL_ACCOUNTS;
  const account = useAccountById(isAll ? undefined : scope);
  const accounts = useAccounts();

  // The selected range lives in the URL (`?range=last-30-days`) so it's
  // shareable and survives reload; default is a rolling 30-day window. The
  // store's journalRange is what the trade/note selectors filter by, so we
  // mirror the URL into it.
  const [searchParams, setSearchParams] = useSearchParams();
  const setStoreRange = useSetJournalRange();
  const range = paramToRangeKey(searchParams.get("range")) ?? DEFAULT_DATE_RANGE;
  useEffect(() => {
    setStoreRange(range);
  }, [range, setStoreRange]);
  const setRange = (key: DateRangeKey) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("range", rangeKeyToParam(key));
        return next;
      },
      { replace: true },
    );

  const trades = useFilteredTrades(scope);
  const allSetups = useSetups();
  const setups = isAll ? allSetups : allSetups.filter((s) => s.accountId === scope);

  const accountNameById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  // Empty set = show all; otherwise show trades whose status is selected.
  const [statuses, setStatuses] = useState<Set<TradeStatus>>(new Set());
  const [viewTradeId, setViewTradeId] = useState<string | null>(null);
  const [newTradeOpen, setNewTradeOpen] = useState(false);
  // Setup being converted into a trade — prefills the New Trade modal.
  const [convertSetup, setConvertSetup] = useState<TradeSetup | null>(null);
  // Setup being edited — reopens the terminal prefilled.
  const [editSetup, setEditSetup] = useState<TradeSetup | null>(null);
  const deleteSetup = useDeleteSetup();
  const pushToast = usePushToast();
  // Market notes strip — scoped to the selected period like trades are.
  // Setups stay unscoped on purpose: a pending plan is current regardless
  // of which period you're reviewing.
  const notes = useFilteredNotes(scope);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const visibleNotes = notesExpanded ? notes : notes.slice(0, NOTE_STRIP_LIMIT);

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
        title="Journal"
        subtitle={`${isAll ? "All accounts" : account?.name ?? "Account"} · ${labelForRange(range)}`}
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

      <JournalStats scope={scope} onOpenTrade={setViewTradeId} />

      {setups.length > 0 && (
        <div className="journalSetups">
          {setups.map((s) => (
            <TradeSetupRow
              key={s.id}
              setup={s}
              onConvert={() => setConvertSetup(s)}
              onEdit={() => setEditSetup(s)}
            />
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="journalSetups">
          {visibleNotes.map((n) => (
            <NoteRow key={n.id} note={n} onEdit={() => setEditNote(n)} />
          ))}
          {notes.length > NOTE_STRIP_LIMIT && (
            <button
              type="button"
              className="noteStrip__more"
              onClick={() => setNotesExpanded((v) => !v)}
            >
              {notesExpanded
                ? "Show fewer"
                : `+${notes.length - NOTE_STRIP_LIMIT} more ${notes.length - NOTE_STRIP_LIMIT === 1 ? "note" : "notes"}`}
            </button>
          )}
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
        <TradeTable
          trades={visibleTrades}
          onRowClick={setViewTradeId}
          accountNameById={isAll ? accountNameById : undefined}
        />
      </div>

      {viewTradeId && (
        <TradeViewModal
          tradeId={viewTradeId}
          onClose={() => setViewTradeId(null)}
        />
      )}

      {editNote && (
        <NewNoteModal note={editNote} onClose={() => setEditNote(null)} />
      )}

      {editSetup && (
        <NewSetupModal setup={editSetup} onClose={() => setEditSetup(null)} />
      )}

      {newTradeOpen && (
        <NewTradeModal onClose={() => setNewTradeOpen(false)} />
      )}

      {convertSetup && (
        <NewTradeModal
          onClose={() => setConvertSetup(null)}
          prefill={{
            symbol: convertSetup.symbol,
            side: convertSetup.side,
            market: convertSetup.market,
            targetCents: convertSetup.targetCents,
            stopCents: convertSetup.stopCents,
            entryCents: convertSetup.entryCents,
            notes: convertSetup.notes,
          }}
          onSaved={() => {
            // The plan became a trade — retire the setup, thesis carried over.
            deleteSetup(convertSetup.id);
            pushToast({
              kind: "success",
              title: "Setup converted to trade",
              duration: 3000,
            });
          }}
        />
      )}
    </>
  );
}
