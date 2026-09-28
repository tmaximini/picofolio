import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Topbar } from "@/components/layout";
import { Card } from "@/components/primitives";
import { ReviewPanel, orderedLabels } from "@/features/review";
import { TradeViewModal } from "@/features/trades/TradeViewModal";
import { useHotkeys } from "@/lib/hotkeys";
import { formatMoney, toneOf } from "@/lib/money";
import { parseOccSymbol } from "@/lib/optionSymbol";
import { isReviewed } from "@/lib/review";
import { deriveTotals, tradeDateKey } from "@/lib/tradeMath";
import {
  useDeleteTrade,
  usePushToast,
  useReviewLabels,
  useReviews,
  useSelectedAccountId,
  useSetTradeReview,
  useTrades,
} from "@/store/selectors";
import { ALL_ACCOUNTS } from "@/store";

type Outcome = "all" | "wins" | "losses";

const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "all", label: "All" },
  { id: "wins", label: "Wins" },
  { id: "losses", label: "Losses" },
];

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Trade review: step through closed trades and label what went right or
 * wrong. Keyboard-first — j/k move, 1–9 toggle labels, e writes a note,
 * ↵ marks reviewed and moves on, o opens the full trade.
 */
export function Review() {
  const scope = useSelectedAccountId();
  const trades = useTrades();
  const reviews = useReviews();
  const labels = useReviewLabels();
  const setReview = useSetTradeReview();
  const deleteTrade = useDeleteTrade();
  const pushToast = usePushToast();
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [openTrade, setOpenTrade] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Closed trades in scope, newest close first.
  const closed = useMemo(
    () =>
      trades
        .filter((t) => scope === ALL_ACCOUNTS || t.accountId === scope)
        .map((t) => ({ t, tot: deriveTotals(t), closedOn: tradeDateKey(t) }))
        .filter((x) => x.tot.status !== "OPEN")
        .sort((a, b) => b.closedOn.localeCompare(a.closedOn)),
    [trades, scope],
  );
  const unreviewedTotal = closed.filter((x) => !isReviewed(reviews[x.t.id])).length;

  const queue = useMemo(
    () =>
      closed.filter((x) => {
        if (outcome === "wins" && x.tot.status !== "WIN") return false;
        if (outcome === "losses" && x.tot.status !== "LOSS") return false;
        // Keep the trade on screen right after it's marked, so "undo" works.
        if (unreviewedOnly && isReviewed(reviews[x.t.id]) && x.t.id !== currentId) return false;
        return true;
      }),
    [closed, outcome, unreviewedOnly, reviews, currentId],
  );

  const index = Math.max(0, queue.findIndex((x) => x.t.id === currentId));
  const current = queue[index] ?? null;

  // Land on the first trade in the queue whenever the current one leaves it.
  useEffect(() => {
    if (!queue.some((x) => x.t.id === currentId)) setCurrentId(queue[0]?.t.id ?? null);
  }, [queue, currentId]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-id="${current?.t.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current?.t.id]);

  const go = (delta: number) => {
    const next = queue[Math.min(queue.length - 1, Math.max(0, index + delta))];
    if (next) setCurrentId(next.t.id);
  };

  const toggleLabel = (id: string) => {
    if (!current) return;
    const prev = reviews[current.t.id]?.labelIds ?? [];
    setReview(current.t.id, { labelIds: prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id] });
  };

  const markAndNext = () => {
    if (!current) return;
    // Pick the successor first: with "unreviewed only" the current trade is
    // about to leave the queue.
    const successor = queue[index + 1] ?? queue[index - 1] ?? null;
    setReview(current.t.id, { reviewedAt: new Date().toISOString() });
    noteRef.current?.blur();
    setCurrentId(successor?.t.id ?? null);
  };

  const ordered = orderedLabels(labels);
  const bindings = [
    { combo: "j", handler: () => go(1) },
    { combo: "arrowdown", handler: () => go(1) },
    { combo: "k", handler: () => go(-1) },
    { combo: "arrowup", handler: () => go(-1) },
    // Enter on a focused button keeps its meaning (the hotkey hook has already
    // cancelled the native activation, so press it here).
    {
      combo: "enter",
      handler: (e: KeyboardEvent) => {
        const el = e.target as HTMLElement | null;
        if (el instanceof HTMLButtonElement) el.click();
        else markAndNext();
      },
    },
    { combo: "cmd+enter", handler: markAndNext },
    { combo: "ctrl+enter", handler: markAndNext },
    { combo: "e", handler: () => requestAnimationFrame(() => noteRef.current?.focus()) },
    { combo: "o", handler: () => current && setOpenTrade(current.t.id) },
    ...ordered.slice(0, 9).map((l, i) => ({ combo: String(i + 1), handler: () => toggleLabel(l.id) })),
  ];
  useHotkeys(openTrade ? [] : bindings);

  return (
    <>
      <Topbar
        title="Trade review"
        subtitle={
          unreviewedTotal > 0
            ? `${unreviewedTotal} closed trade${unreviewedTotal === 1 ? "" : "s"} not reviewed yet`
            : "Every closed trade is reviewed"
        }
      />

      <div className="reviewBar">
        <div className="segGroup" role="group" aria-label="Outcome">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              className={outcome === o.id ? "segGroup__btn segGroup__btn--on" : "segGroup__btn"}
              aria-pressed={outcome === o.id}
              onClick={() => setOutcome(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="reviewBar__toggle">
          <input type="checkbox" checked={unreviewedOnly} onChange={(e) => setUnreviewedOnly(e.target.checked)} />
          <span>Unreviewed only</span>
        </label>
        <span className="reviewBar__keys">
          <span className="kbd">j</span>
          <span className="kbd">k</span> move <span className="kbd">1</span>–<span className="kbd">9</span> label{" "}
          <span className="kbd">e</span> note <span className="kbd">↵</span> done
        </span>
      </div>

      {queue.length === 0 ? (
        <Card>
          <div className="emptyState">
            <CheckCircle2 size={22} strokeWidth={1.5} style={{ color: "var(--gain)" }} />
            <div className="emptyState__title">
              {closed.length === 0 ? "No closed trades yet" : "All caught up"}
            </div>
            <div className="emptyState__body">
              {closed.length === 0
                ? "Close a trade and it shows up here for review."
                : unreviewedOnly
                  ? "Nothing left to review for this filter. Untick “Unreviewed only” to revisit past reviews."
                  : "No trades match this filter."}
            </div>
          </div>
        </Card>
      ) : (
        <div className="reviewLayout">
          <ul className="reviewQueue" ref={listRef} aria-label="Trades to review">
            {queue.map(({ t, tot, closedOn }) => {
              const r = reviews[t.id];
              const opt = parseOccSymbol(t.symbol);
              const dots = (r?.labelIds ?? []).map((id) => labels.find((l) => l.id === id)).filter(Boolean);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    data-id={t.id}
                    className={t.id === current?.t.id ? "reviewQueue__item reviewQueue__item--on" : "reviewQueue__item"}
                    onClick={() => setCurrentId(t.id)}
                  >
                    <span className={isReviewed(r) ? "reviewQueue__state reviewQueue__state--done" : "reviewQueue__state"} aria-label={isReviewed(r) ? "Reviewed" : "Not reviewed"} />
                    <span className="reviewQueue__sym">
                      {opt ? opt.underlying : t.symbol}
                      {opt && <small>{opt.type === "CALL" ? "C" : "P"}</small>}
                    </span>
                    <span className="reviewQueue__dots">
                      {dots.slice(0, 4).map((l) => (
                        <i key={l!.id} style={{ background: l!.color }} title={l!.name} />
                      ))}
                    </span>
                    <span className="reviewQueue__date num">{closedOn ? dayFmt.format(new Date(`${closedOn}T00:00:00Z`)) : ""}</span>
                    <span className={`reviewQueue__pnl num tone-${toneOf(tot.returnCents)}`}>
                      {formatMoney(tot.returnCents, t.currency ?? "USD", true)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {current && (
            <ReviewPanel
              key={current.t.id}
              ref={noteRef}
              trade={current.t}
              review={reviews[current.t.id]}
              position={{ index, total: queue.length }}
              onToggleLabel={toggleLabel}
              onNote={(note) => setReview(current.t.id, { note })}
              onMarkReviewed={markAndNext}
              onUnmark={() => setReview(current.t.id, { reviewedAt: undefined })}
              onOpenTrade={() => setOpenTrade(current.t.id)}
              onDelete={() => {
                const successor = queue[index + 1] ?? queue[index - 1] ?? null;
                const sym = current.t.symbol;
                deleteTrade(current.t.id);
                setCurrentId(successor?.t.id ?? null);
                pushToast({ kind: "info", title: `Deleted ${parseOccSymbol(sym)?.underlying ?? sym} trade`, duration: 2500 });
              }}
            />
          )}
        </div>
      )}

      {openTrade && <TradeViewModal tradeId={openTrade} onClose={() => setOpenTrade(null)} />}
    </>
  );
}
