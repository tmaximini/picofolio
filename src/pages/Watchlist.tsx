import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Topbar } from "@/components/layout";
import { Badge, Card } from "@/components/primitives";
import { Sparkline, SymbolChartModal, SymbolSearch } from "@/components/ui";
import { useHotkeys } from "@/lib/hotkeys";
import { formatMoney, formatPct, toneOf } from "@/lib/money";
import { watchMetrics, type WatchItem, type WatchMetrics } from "@/lib/watchlist";
import { useStore } from "@/store";
import {
  useAddToWatchlist,
  useLoadPrice,
  usePushToast,
  useRemoveFromWatchlist,
  useWatchlist,
} from "@/store/selectors";

type SortKey = "symbol" | "day" | "month" | "since" | "range";
type Sort = { key: SortKey; dir: 1 | -1 } | null;

type Row = WatchItem & { m: WatchMetrics | null; currency: string; loading: boolean };

const COLUMNS: { key: SortKey | null; label: string; num?: boolean; title?: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: null, label: "Last", num: true },
  { key: "day", label: "Day", num: true },
  { key: "month", label: "1M", num: true },
  { key: "since", label: "Since added", num: true },
  { key: "range", label: "52W range", title: "Where the last close sits between the 52-week low and high" },
  { key: null, label: "3M" },
];

function sortValue(r: Row, key: SortKey): number | string {
  if (key === "symbol") return r.symbol;
  const m = r.m;
  if (!m) return -Infinity;
  if (key === "day") return m.dayPct ?? -Infinity;
  if (key === "month") return m.monthPct ?? -Infinity;
  if (key === "since") return m.sinceAddedPct ?? -Infinity;
  return m.rangePos;
}

type WatchlistProps = {
  /** Open the new-trade modal prefilled with a symbol (owned by the app shell). */
  onNewTrade: (symbol: string) => void;
};

/**
 * Symbols you follow but don't hold. Keyboard-first: / adds, j/k move,
 * ↵ opens the chart, t starts a trade, x removes.
 */
export function Watchlist({ onNewTrade }: WatchlistProps) {
  const items = useWatchlist();
  const prices = useStore((s) => s.prices);
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();
  const loadPrice = useLoadPrice();
  const pushToast = usePushToast();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableSectionElement | null>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [sel, setSel] = useState(0);
  const [chart, setChart] = useState<Row | null>(null);

  // Warm every series on mount; loadPrice's freshness guard keeps it cheap.
  useEffect(() => {
    for (const w of items) void loadPrice(w.symbol);
  }, [items, loadPrice]);

  const rows = useMemo<Row[]>(() => {
    const out = items.map((w) => {
      const entry = prices[w.symbol];
      return {
        ...w,
        m: entry ? watchMetrics(entry.points, w.addedAt) : null,
        currency: entry?.currency ?? "USD",
        loading: !entry || entry.status === "loading" || entry.status === "idle",
      };
    });
    if (!sort) return out;
    return [...out].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const c = typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return c * sort.dir;
    });
  }, [items, prices, sort]);

  const existing = useMemo(() => new Set(items.map((w) => w.symbol)), [items]);
  const selIdx = Math.min(sel, Math.max(0, rows.length - 1));
  const current = rows[selIdx];

  useEffect(() => {
    tableRef.current
      ?.querySelector<HTMLElement>(`[data-row="${selIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  const removeRow = useCallback(
    (r: Row) => {
      remove(r.symbol);
      pushToast({ kind: "info", title: `Removed ${r.symbol} from watchlist`, duration: 2500 });
    },
    [remove, pushToast],
  );

  const cycleSort = (key: SortKey) =>
    setSort((s) =>
      s?.key !== key ? { key, dir: key === "symbol" ? 1 : -1 } : s.dir === -1 ? { key, dir: 1 } : null,
    );

  const bindings = useMemo(
    () => [
      { combo: "/", handler: () => searchRef.current?.focus() },
      { combo: "j", handler: () => setSel((i) => Math.min(i + 1, rows.length - 1)) },
      { combo: "arrowdown", handler: () => setSel((i) => Math.min(i + 1, rows.length - 1)) },
      { combo: "k", handler: () => setSel((i) => Math.max(i - 1, 0)) },
      { combo: "arrowup", handler: () => setSel((i) => Math.max(i - 1, 0)) },
      { combo: "enter", handler: () => current && setChart(current) },
      { combo: "t", handler: () => current && onNewTrade(current.symbol) },
      { combo: "x", handler: () => current && removeRow(current) },
    ],
    [rows.length, current, onNewTrade, removeRow],
  );
  useHotkeys(chart ? [] : bindings);

  return (
    <>
      <Topbar
        title="Watchlist"
        subtitle="Symbols you follow, not hold"
      />

      <div className="sectionHead watch__head">
        <SymbolSearch
          ref={searchRef}
          placeholder="Add a symbol — ticker or company"
          existing={existing}
          onPick={(hit) => {
            if (existing.has(hit.symbol.toUpperCase())) {
              pushToast({ kind: "info", title: `Already watching ${hit.symbol}`, duration: 2000 });
              return;
            }
            add(hit);
            setSort(null);
            setSel(0);
          }}
        />
        <Badge>{items.length} symbols</Badge>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="emptyState">
            <div className="emptyState__title">Nothing on watch</div>
            <div className="emptyState__body">
              Press <span className="kbd">/</span> and type a ticker or company to
              start following it. Prices come from the same free feed as your holdings.
            </div>
          </div>
        </Card>
      ) : (
        <Card flush>
          <div className="tableScroll">
            <table className="table watch" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const active = sort && c.key === sort.key;
                    return (
                      <th key={c.label} className={c.num ? "num" : undefined} title={c.title}>
                        {c.key ? (
                          <button
                            type="button"
                            className={active ? "watch__sort watch__sort--on" : "watch__sort"}
                            onClick={() => cycleSort(c.key!)}
                          >
                            {c.label}
                            {active &&
                              (sort.dir === -1 ? (
                                <ArrowDown size={11} strokeWidth={1.75} />
                              ) : (
                                <ArrowUp size={11} strokeWidth={1.75} />
                              ))}
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody ref={tableRef}>
                {rows.map((r, i) => (
                  <tr
                    key={r.symbol}
                    data-row={i}
                    className={i === selIdx ? "watch__row watch__row--sel" : "watch__row"}
                    onClick={() => {
                      setSel(i);
                      setChart(r);
                    }}
                  >
                    <td>
                      <div className="watch__sym">
                        <span className="mono">{r.symbol}</span>
                        <small>{r.name ?? " "}</small>
                      </div>
                    </td>
                    <td className="num">
                      {r.m ? formatMoney(Math.round(r.m.last * 100), r.currency) : <Pending loading={r.loading} />}
                    </td>
                    <td className="num"><Pct v={r.m?.dayPct} /></td>
                    <td className="num"><Pct v={r.m?.monthPct} /></td>
                    <td className="num" title={`Since ${r.addedAt}`}>
                      <Pct v={r.m?.sinceAddedPct} />
                    </td>
                    <td>{r.m ? <RangeBar m={r.m} /> : null}</td>
                    <td className="watch__spark">{r.m ? <Sparkline values={r.m.spark} /> : null}</td>
                    <td className="watch__actions">
                      <button
                        type="button"
                        className="watch__remove"
                        aria-label={`Remove ${r.symbol}`}
                        title="Remove (x)"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRow(r);
                        }}
                      >
                        <X size={13} strokeWidth={1.75} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="watch__keys">
            <span><span className="kbd">j</span><span className="kbd">k</span> move</span>
            <span><span className="kbd">↵</span> chart</span>
            <span><span className="kbd">t</span> new trade</span>
            <span><span className="kbd">x</span> remove</span>
          </div>
        </Card>
      )}

      {chart && (
        <SymbolChartModal
          symbol={chart.symbol}
          name={chart.name}
          dayPct={chart.m?.dayPct}
          onClose={() => setChart(null)}
        />
      )}
    </>
  );
}

function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="watch__dim">—</span>;
  return <span className={`watch__pct watch__pct--${toneOf(v)}`}>{formatPct(v)}</span>;
}

function Pending({ loading }: { loading: boolean }) {
  return <span className="watch__dim">{loading ? "…" : "n/a"}</span>;
}

function RangeBar({ m }: { m: WatchMetrics }) {
  return (
    <div className="watch__range" title={`52W ${m.low52.toFixed(2)} – ${m.high52.toFixed(2)}`}>
      <span className="watch__rangeTrack">
        <span className="watch__rangeDot" style={{ "--p": m.rangePos } as CSSProperties} />
      </span>
    </div>
  );
}
