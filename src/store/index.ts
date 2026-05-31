import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  accountsSeed,
  holdingsSeed,
  weeklyPnlSeed,
  type Account,
  type Holding,
  type WeekBar,
} from "@/lib/mock";
import { setupsSeed, tradesSeed } from "@/lib/mockTrades";
import type { PricePoint } from "@/lib/priceHistory";
import type { Trade, TradeSetup } from "@/lib/trades";
import type { DateRangeKey } from "@/lib/dateRange";
import { fetchYahooDaily, fetchYahooIntraday, type IntradayPoint } from "@/lib/yahoo";
import { fetchFlexStatement, parseFlexXml } from "@/lib/ibkr";

export type PriceStatus = "idle" | "loading" | "ready" | "error";

export type PriceEntry = {
  points: PricePoint[];
  status: PriceStatus;
  error?: string;
  /** epoch ms */
  fetchedAt?: number;
};

/** Intraday cache entry. `null` points = no data available (e.g. outside Yahoo retention). */
export type IntradayEntry = {
  points: IntradayPoint[] | null;
  status: PriceStatus;
  error?: string;
  fetchedAt?: number;
};

export type IbkrStatus = "idle" | "sending" | "polling" | "parsing" | "error";

export type IbkrConnection = {
  id: string;
  /** User-facing label (e.g. "Paper", "Live Cash"). Imported trades are
   *  tagged with this so each connection's trades segregate cleanly. */
  label: string;
  token: string;
  queryId: string;
  lastSyncAt: number | null;
  status: IbkrStatus;
  error: string | null;
  lastSummary: {
    added: number;
    skipped: number;
    warnings: string[];
    accountIds: string[];
  } | null;
};

export type ToastKind = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Auto-dismiss after this many ms. Omit = sticky (errors). */
  duration?: number;
};

type StoreState = {
  // Raw, seeded from mock; real data via actions
  accounts: Account[];
  holdings: Holding[];
  weeklyPnl: WeekBar[];

  // Journal
  trades: Trade[];
  setups: TradeSetup[];
  journalRange: DateRangeKey;
  /** Calendar viewing month — first-of-month ISO date. */
  calendarMonth: string;

  // IBKR — list of broker connections (paper + live + any extra accounts).
  ibkrConnections: IbkrConnection[];

  // Async price data, keyed by symbol
  prices: Record<string, PriceEntry>;

  /** Intraday cache keyed by `${symbol}|${YYYY-MM-DD}`. */
  intraday: Record<string, IntradayEntry>;

  // Toasts
  toasts: Toast[];

  lastSyncAt: number | null;
  syncing: boolean;

  // Price actions
  loadPrice: (symbol: string) => Promise<void>;
  /** Fetch + cache intraday for [startKey, endKey] (single-day when endKey omitted). */
  loadIntraday: (symbol: string, startKey: string, endKey?: string) => Promise<void>;
  refreshAll: () => Promise<void>;

  // Journal actions
  addTrade: (t: Trade) => void;
  updateTrade: (id: string, patch: Partial<Trade>) => void;
  deleteTrade: (id: string) => void;
  addSetup: (s: TradeSetup) => void;
  deleteSetup: (id: string) => void;
  setJournalRange: (key: DateRangeKey) => void;
  setCalendarMonth: (iso: string) => void;
  clearDemoTrades: () => void;
  restoreDemoTrades: () => void;
  clearDemoPortfolio: () => void;
  restoreDemoPortfolio: () => void;

  // IBKR actions — per-connection
  addIbkrConnection: (label: string) => string;
  updateIbkrConnection: (
    id: string,
    patch: Partial<Pick<IbkrConnection, "label" | "token" | "queryId">>,
  ) => void;
  removeIbkrConnection: (id: string) => void;
  syncIbkrConnection: (id: string) => Promise<void>;
  /** Wipe IBKR trades for this connection's label, then sync. */
  resyncIbkrConnection: (id: string) => Promise<void>;
  importIbkrXml: (
    xml: string,
    accountLabel?: string,
  ) => { added: number; skipped: number; warnings: string[] };

  // Toast actions
  pushToast: (t: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;
};

function firstOfThisMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const STALE_MS = 60 * 60 * 1000; // 1h

function isFresh(entry: PriceEntry | undefined): boolean {
  return (
    entry?.status === "ready" &&
    entry.fetchedAt != null &&
    Date.now() - entry.fetchedAt < STALE_MS
  );
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      accounts: accountsSeed,
      holdings: holdingsSeed,
      weeklyPnl: weeklyPnlSeed,
      trades: tradesSeed,
      setups: setupsSeed,
      journalRange: "ALL",
      calendarMonth: firstOfThisMonthISO(),
      ibkrConnections: [],
      toasts: [],
      prices: {},
      intraday: {},
      lastSyncAt: null,
      syncing: false,

      loadPrice: async (symbol) => {
        const cur = get().prices[symbol];
        if (isFresh(cur) || cur?.status === "loading") return;

        set((s) => ({
          prices: {
            ...s.prices,
            [symbol]: { points: cur?.points ?? [], status: "loading" },
          },
        }));

        try {
          const points = await fetchYahooDaily(symbol, "2y");
          set((s) => ({
            prices: {
              ...s.prices,
              [symbol]: {
                points,
                status: "ready",
                fetchedAt: Date.now(),
              },
            },
          }));
        } catch (err) {
          set((s) => ({
            prices: {
              ...s.prices,
              [symbol]: {
                points: cur?.points ?? [],
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              },
            },
          }));
        }
      },

      loadIntraday: async (symbol, startKey, endKey = startKey) => {
        const key = `${symbol}|${startKey}|${endKey}`;
        const cur = get().intraday[key];
        if (cur?.status === "loading") return;
        if (cur?.status === "ready" && cur.fetchedAt && Date.now() - cur.fetchedAt < STALE_MS) {
          return;
        }
        set((s) => ({
          intraday: {
            ...s.intraday,
            [key]: { points: cur?.points ?? null, status: "loading" },
          },
        }));
        try {
          const points = await fetchYahooIntraday(symbol, startKey, endKey);
          set((s) => ({
            intraday: {
              ...s.intraday,
              [key]: { points, status: "ready", fetchedAt: Date.now() },
            },
          }));
        } catch (err) {
          set((s) => ({
            intraday: {
              ...s.intraday,
              [key]: {
                points: null,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              },
            },
          }));
        }
      },

      refreshAll: async () => {
        if (get().syncing) return;
        set({ syncing: true });
        const symbols = get().holdings.map((h) => h.symbol);
        await Promise.allSettled(symbols.map((s) => get().loadPrice(s)));
        set({ syncing: false, lastSyncAt: Date.now() });
      },

      addTrade: (t) =>
        set((s) => {
          // First non-demo addition (no real trades yet) graduates the
          // journal from sample data → silently clear the demo seed.
          // Once any real trade exists, this skip lets the user restore
          // demos and keep adding without losing them again.
          const hasReal = s.trades.some((x) => x.source !== "demo");
          if (t.source && t.source !== "demo" && !hasReal) {
            return {
              trades: [t, ...s.trades.filter((x) => x.source !== "demo")],
            };
          }
          return { trades: [t, ...s.trades] };
        }),
      updateTrade: (id, patch) =>
        set((s) => ({
          trades: s.trades.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      deleteTrade: (id) =>
        set((s) => ({ trades: s.trades.filter((t) => t.id !== id) })),

      addSetup: (sp) => set((s) => ({ setups: [sp, ...s.setups] })),
      deleteSetup: (id) =>
        set((s) => ({ setups: s.setups.filter((sp) => sp.id !== id) })),

      setJournalRange: (key) => set({ journalRange: key }),
      setCalendarMonth: (iso) => set({ calendarMonth: iso }),

      clearDemoTrades: () =>
        set((s) => ({ trades: s.trades.filter((t) => t.source !== "demo") })),
      restoreDemoTrades: () =>
        set((s) => {
          const existing = new Set(s.trades.map((t) => t.id));
          const fresh = tradesSeed.filter((t) => !existing.has(t.id));
          return { trades: [...s.trades, ...fresh] };
        }),

      clearDemoPortfolio: () =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.source !== "demo"),
          holdings: s.holdings.filter((h) => h.source !== "demo"),
        })),
      restoreDemoPortfolio: () =>
        set((s) => {
          const existingAccountIds = new Set(s.accounts.map((a) => a.id));
          const existingHoldingKeys = new Set(
            s.holdings.map((h) => `${h.account}|${h.symbol}`),
          );
          const freshAccounts = accountsSeed.filter(
            (a) => !existingAccountIds.has(a.id),
          );
          const freshHoldings = holdingsSeed.filter(
            (h) => !existingHoldingKeys.has(`${h.account}|${h.symbol}`),
          );
          return {
            accounts: [...s.accounts, ...freshAccounts],
            holdings: [...s.holdings, ...freshHoldings],
          };
        }),

      // ---------- IBKR (multi-connection) ----------

      addIbkrConnection: (label) => {
        const id = `ibkr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({
          ibkrConnections: [
            ...s.ibkrConnections,
            {
              id,
              label: label.trim() || "New connection",
              token: "",
              queryId: "",
              lastSyncAt: null,
              status: "idle",
              error: null,
              lastSummary: null,
            },
          ],
        }));
        return id;
      },
      updateIbkrConnection: (id, patch) =>
        set((s) => ({
          ibkrConnections: s.ibkrConnections.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(patch.label != null ? { label: patch.label.trim() || c.label } : {}),
                  ...(patch.token != null ? { token: patch.token.trim() } : {}),
                  ...(patch.queryId != null ? { queryId: patch.queryId.trim() } : {}),
                }
              : c,
          ),
        })),
      removeIbkrConnection: (id) =>
        set((s) => ({ ibkrConnections: s.ibkrConnections.filter((c) => c.id !== id) })),

      importIbkrXml: (xml, accountLabel) => {
        const result = parseFlexXml(xml);
        // If a label is provided (sync via connection), override the
        // raw IBKR accountId with the user's friendly label so trades
        // segregate by connection in the sidebar.
        const stamped = accountLabel
          ? result.trades.map((t) => ({ ...t, account: accountLabel }))
          : result.trades;
        const existing = new Set(get().trades.map((t) => t.id));
        const fresh = stamped.filter((t) => !existing.has(t.id));
        if (fresh.length > 0) {
          set((s) => {
            const hadReal = s.trades.some((t) => t.source !== "demo");
            if (!hadReal) {
              return {
                trades: [...fresh, ...s.trades.filter((t) => t.source !== "demo")],
              };
            }
            return { trades: [...fresh, ...s.trades] };
          });
        }
        return {
          added: fresh.length,
          skipped: result.trades.length - fresh.length,
          warnings: result.warnings,
        };
      },

      syncIbkrConnection: async (id) => {
        const conn = get().ibkrConnections.find((c) => c.id === id);
        const { pushToast } = get();
        if (!conn) return;
        if (conn.status === "sending" || conn.status === "polling") return;

        const patch = (p: Partial<IbkrConnection>) =>
          set((s) => ({
            ibkrConnections: s.ibkrConnections.map((c) =>
              c.id === id ? { ...c, ...p } : c,
            ),
          }));

        if (!conn.token || !conn.queryId) {
          patch({ status: "error", error: "Missing token or Query ID" });
          pushToast({
            kind: "error",
            title: `${conn.label}: missing credentials`,
            body: "Add a Flex token and Query ID before syncing.",
          });
          return;
        }
        patch({ status: "sending", error: null });
        try {
          patch({ status: "polling" });
          const xml = await fetchFlexStatement(conn.token, conn.queryId);
          patch({ status: "parsing" });
          const result = parseFlexXml(xml);
          const stamped = result.trades.map((t) => ({ ...t, account: conn.label }));
          const existing = new Set(get().trades.map((t) => t.id));
          const fresh = stamped.filter((t) => !existing.has(t.id));
          if (fresh.length > 0) {
            set((s) => {
              const hadReal = s.trades.some((t) => t.source !== "demo");
              if (!hadReal) {
                return {
                  trades: [...fresh, ...s.trades.filter((t) => t.source !== "demo")],
                };
              }
              return { trades: [...fresh, ...s.trades] };
            });
          }
          const summary = {
            added: fresh.length,
            skipped: result.trades.length - fresh.length,
            warnings: result.warnings,
            accountIds: result.accountIds,
          };
          patch({
            status: "idle",
            lastSyncAt: Date.now(),
            lastSummary: summary,
          });
          if (summary.added > 0) {
            pushToast({
              kind: "success",
              title: `${conn.label}: synced ${summary.added} trade${summary.added === 1 ? "" : "s"}`,
              body:
                summary.skipped > 0
                  ? `Skipped ${summary.skipped} already-imported.`
                  : undefined,
              duration: 5000,
            });
          } else {
            pushToast({
              kind: "info",
              title: `${conn.label}: up to date`,
              body:
                summary.skipped > 0
                  ? `${summary.skipped} trade${summary.skipped === 1 ? "" : "s"} already imported.`
                  : "No new trades in the Flex window.",
              duration: 5000,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          patch({ status: "error", error: msg });
          pushToast({
            kind: "error",
            title: `${conn.label}: sync failed`,
            body: msg,
          });
        }
      },

      resyncIbkrConnection: async (id) => {
        const conn = get().ibkrConnections.find((c) => c.id === id);
        if (!conn) return;
        // Wipe IBKR-sourced trades that belong to this connection's label,
        // then run a fresh sync. Token + Query ID stay intact.
        set((s) => ({
          trades: s.trades.filter(
            (t) => !(t.source === "ibkr" && t.account === conn.label),
          ),
        }));
        await get().syncIbkrConnection(id);
      },

      pushToast: (t) => {
        const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
        return id;
      },
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "picofolio:store:v1",
      storage: createJSONStorage(() => localStorage),
      // Persist trades + setups + price cache + IBKR credentials.
      // Persisting trades is what lets the demo seed stay cleared after a
      // real import survives a reload, and what keeps manual / synced
      // entries across sessions.
      // NOTE: IBKR token is sensitive — localStorage is fine for the PoC
      // but production needs OS keychain (Tauri) or Web Crypto encryption.
      partialize: (s) => ({
        accounts: s.accounts,
        holdings: s.holdings,
        trades: s.trades,
        setups: s.setups,
        prices: s.prices,
        lastSyncAt: s.lastSyncAt,
        ibkrConnections: s.ibkrConnections,
      }),
      version: 4,
      migrate: (persistedState, version) => {
        // v1 → v2: collapse the single ibkrToken/ibkrQueryId/ibkrLastSyncAt
        // into a one-element ibkrConnections array (labelled "Default") so
        // existing users don't lose their saved credentials on upgrade.
        if (version < 2 && persistedState && typeof persistedState === "object") {
          const old = persistedState as Record<string, unknown>;
          const token = (old.ibkrToken as string | undefined) ?? "";
          const queryId = (old.ibkrQueryId as string | undefined) ?? "";
          const lastSyncAt =
            (old.ibkrLastSyncAt as number | null | undefined) ?? null;
          const ibkrConnections: IbkrConnection[] = [];
          if (token || queryId) {
            ibkrConnections.push({
              id: "ibkr-default",
              label: "Default",
              token,
              queryId,
              lastSyncAt,
              status: "idle",
              error: null,
              lastSummary: null,
            });
          }
          delete old.ibkrToken;
          delete old.ibkrQueryId;
          delete old.ibkrLastSyncAt;
          delete old.ibkrStatus;
          delete old.ibkrError;
          delete old.ibkrLastSummary;
          old.ibkrConnections = ibkrConnections;
        }
        // → v4: reseed the demo data (coherent barbell — trade notionals
        // now fit inside the trading account; positive-expectancy journal).
        // Drop demo-sourced rows and graft the fresh seed back on; real /
        // manual / imported entries are preserved untouched.
        if (version < 4 && persistedState && typeof persistedState === "object") {
          const old = persistedState as Record<string, unknown>;
          const realTrades = ((old.trades as Trade[] | undefined) ?? []).filter(
            (t) => t.source && t.source !== "demo",
          );
          old.trades = [...tradesSeed, ...realTrades];
          const realHoldings = ((old.holdings as Holding[] | undefined) ?? []).filter(
            (h) => h.source !== "demo",
          );
          old.holdings = [...holdingsSeed, ...realHoldings];
          const realAccounts = ((old.accounts as Account[] | undefined) ?? []).filter(
            (a) => a.source !== "demo",
          );
          old.accounts = [...accountsSeed, ...realAccounts];
          old.weeklyPnl = weeklyPnlSeed;
        }
        return persistedState as StoreState;
      },
    },
  ),
);
