import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ACCOUNT_COLORS,
  ACCOUNT_LONG_TERM_COLOR,
  ACCOUNT_TRADING_COLOR,
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
import type { ParsedPosition } from "@/lib/ibkr/flexParser";

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

/** Sentinel scope = the consolidated "All Accounts" roll-up. */
export const ALL_ACCOUNTS = "ALL" as const;

export type NewAccountInput = {
  name: string;
  color?: string;
  cashCents?: number;
  netContributionsCents?: number;
  flexConnectionId?: string;
  source?: "demo" | "manual" | "ibkr";
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

  /** Active scope for Overview/Activity/Holdings/Calendar. ALL = roll-up. */
  selectedAccountId: string;

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

  // Account actions
  setSelectedAccount: (id: string) => void;
  addAccount: (input: NewAccountInput) => string;
  updateAccount: (
    id: string,
    patch: Partial<
      Pick<
        Account,
        "name" | "color" | "cashCents" | "netContributionsCents" | "flexConnectionId"
      >
    >,
  ) => void;
  removeAccount: (id: string) => void;

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
    targetAccountId?: string,
  ) => { added: number; skipped: number; warnings: string[] };

  // Toast actions
  pushToast: (t: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;
};

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * IBKR <OpenPositions> → Holding records. Stocks are valued live via Yahoo;
 * options/futures (no Yahoo source) carry the broker's mark price as a
 * fallback so they still contribute to account value. A position with neither
 * a Yahoo source (non-stock) nor a mark price is skipped — it can't be valued.
 */
function buildIbkrHoldings(accountId: string, positions: ParsedPosition[]): Holding[] {
  return positions
    .filter((p) => {
      if (p.qty === 0) return false;
      if (p.market === "STOCK") return true; // priceable via Yahoo
      return p.markPriceCents > 0; // options/futures need a broker mark
    })
    .map((p) => ({
      symbol: p.symbol,
      name: p.symbol,
      accountId,
      qty: p.qty,
      avgCostCents: p.avgCostCents,
      ...(p.markPriceCents > 0 ? { lastPriceCents: p.markPriceCents } : {}),
      source: "ibkr" as const,
    }));
}

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
      selectedAccountId: ALL_ACCOUNTS,
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

      // ---------- accounts ----------

      setSelectedAccount: (id) => set({ selectedAccountId: id }),

      addAccount: (input) => {
        const id = genId("acct");
        const now = new Date().toISOString();
        const used = new Set(get().accounts.map((a) => a.color));
        const color =
          input.color ?? ACCOUNT_COLORS.find((c) => !used.has(c)) ?? ACCOUNT_COLORS[0];
        set((s) => ({
          accounts: [
            ...s.accounts,
            {
              id,
              name: input.name.trim() || "New account",
              color,
              cashCents: input.cashCents ?? 0,
              netContributionsCents: input.netContributionsCents ?? 0,
              flexConnectionId: input.flexConnectionId,
              createdAt: now,
              updatedAt: now,
              source: input.source ?? "manual",
            },
          ],
        }));
        return id;
      },

      updateAccount: (id, patch) =>
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...(patch.name != null ? { name: patch.name.trim() || a.name } : {}),
                  ...(patch.color != null ? { color: patch.color } : {}),
                  ...(patch.cashCents != null ? { cashCents: patch.cashCents } : {}),
                  ...(patch.netContributionsCents != null
                    ? { netContributionsCents: patch.netContributionsCents }
                    : {}),
                  // flexConnectionId is settable to a string or explicitly null/undefined
                  // (to unlink), so respect the key's presence rather than non-null.
                  ...("flexConnectionId" in patch
                    ? { flexConnectionId: patch.flexConnectionId }
                    : {}),
                  updatedAt: new Date().toISOString(),
                }
              : a,
          ),
        })),

      removeAccount: (id) =>
        set((s) => ({
          // Cascade: drop the account and everything scoped to it.
          accounts: s.accounts.filter((a) => a.id !== id),
          holdings: s.holdings.filter((h) => h.accountId !== id),
          trades: s.trades.filter((t) => t.accountId !== id),
          setups: s.setups.filter((sp) => sp.accountId !== id),
          // If it was the active scope, fall back to the roll-up.
          selectedAccountId:
            s.selectedAccountId === id ? ALL_ACCOUNTS : s.selectedAccountId,
        })),

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
            s.holdings.map((h) => `${h.accountId}|${h.symbol}`),
          );
          const freshAccounts = accountsSeed.filter(
            (a) => !existingAccountIds.has(a.id),
          );
          const freshHoldings = holdingsSeed.filter(
            (h) => !existingHoldingKeys.has(`${h.accountId}|${h.symbol}`),
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
        set((s) => ({
          ibkrConnections: s.ibkrConnections.filter((c) => c.id !== id),
          // Unlink any account this connection fed; the account + its trades stay.
          accounts: s.accounts.map((a) =>
            a.flexConnectionId === id ? { ...a, flexConnectionId: undefined } : a,
          ),
        })),

      importIbkrXml: (xml, targetAccountId) => {
        const result = parseFlexXml(xml);
        // Stamp each parsed trade with a real Picofolio Account.id. When a
        // target is given (paste-into-account flow), use it. Otherwise ensure
        // one account per distinct raw IBKR account id so trades never orphan.
        const ensureImportAccountId = (rawId: string): string => {
          const name = rawId ? `IBKR ${rawId}` : "Imported";
          const existing = get().accounts.find((a) => a.name === name);
          if (existing) return existing.id;
          return get().addAccount({ name, source: "ibkr" });
        };
        const stamped = result.trades.map((t) => ({
          ...t,
          accountId: targetAccountId ?? ensureImportAccountId(t.accountId),
        }));
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

        // Open positions → holdings, grouped by their resolved account.
        if (result.positions.length > 0) {
          const byAccount = new Map<string, ParsedPosition[]>();
          for (const p of result.positions) {
            const accId = targetAccountId ?? ensureImportAccountId(p.accountId);
            const arr = byAccount.get(accId) ?? [];
            arr.push(p);
            byAccount.set(accId, arr);
          }
          for (const [accId, ps] of byAccount) {
            const ibkrHoldings = buildIbkrHoldings(accId, ps);
            set((s) => ({
              holdings: [
                ...s.holdings.filter(
                  (h) => !(h.source === "ibkr" && h.accountId === accId),
                ),
                ...ibkrHoldings,
              ],
            }));
            if (result.cashCents !== 0) {
              get().updateAccount(accId, { cashCents: result.cashCents });
            }
          }
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
          // Resolve (or lazily create + link) the Account this connection
          // feeds, then stamp every imported trade with its stable id.
          const linked = get().accounts.find((a) => a.flexConnectionId === conn.id);
          const accountId =
            linked?.id ??
            get().addAccount({
              name: conn.label,
              flexConnectionId: conn.id,
              source: "ibkr",
            });
          const stamped = result.trades.map((t) => ({ ...t, accountId }));
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
          // Replace this account's IBKR positions + cash from the snapshot
          // (only when the query actually includes the OpenPositions section).
          if (result.positions.length > 0) {
            const ibkrHoldings = buildIbkrHoldings(accountId, result.positions);
            set((s) => ({
              holdings: [
                ...s.holdings.filter(
                  (h) => !(h.source === "ibkr" && h.accountId === accountId),
                ),
                ...ibkrHoldings,
              ],
            }));
            get().updateAccount(accountId, { cashCents: result.cashCents });
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
          // Holdings feedback: how many priceable positions landed, or a nudge
          // if the query has no Open Positions section (so the account is $0).
          const stockPositions = buildIbkrHoldings(accountId, result.positions).length;
          const posNote =
            result.positions.length > 0
              ? `${stockPositions} position${stockPositions === 1 ? "" : "s"} updated.`
              : "No Open Positions in this query — add that section for Holdings & value.";
          const join = (a: string | undefined, b: string) => (a ? `${a} ${b}` : b);

          if (summary.added > 0) {
            pushToast({
              kind: "success",
              title: `${conn.label}: synced ${summary.added} trade${summary.added === 1 ? "" : "s"}`,
              body: join(
                summary.skipped > 0 ? `Skipped ${summary.skipped} already-imported.` : undefined,
                posNote,
              ),
              duration: 6000,
            });
          } else {
            pushToast({
              kind: "info",
              title: `${conn.label}: up to date`,
              body: join(
                summary.skipped > 0
                  ? `${summary.skipped} trade${summary.skipped === 1 ? "" : "s"} already imported.`
                  : "No new trades in the Flex window.",
                posNote,
              ),
              duration: 6000,
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
        // Wipe IBKR-sourced trades that belong to this connection's linked
        // account, then run a fresh sync. Token + Query ID stay intact.
        const linked = get().accounts.find((a) => a.flexConnectionId === conn.id);
        if (linked) {
          set((s) => ({
            trades: s.trades.filter(
              (t) => !(t.source === "ibkr" && t.accountId === linked.id),
            ),
            holdings: s.holdings.filter(
              (h) => !(h.source === "ibkr" && h.accountId === linked.id),
            ),
          }));
        }
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
        selectedAccountId: s.selectedAccountId,
        prices: s.prices,
        lastSyncAt: s.lastSyncAt,
        // Never persist transient sync status/error — a sync in flight when
        // the page closes would otherwise rehydrate as a permanent "polling"
        // that blocks all future syncs (the action guards on status).
        ibkrConnections: s.ibkrConnections.map((c) => ({
          ...c,
          status: "idle" as const,
          error: null,
        })),
      }),
      version: 6,
      // Belt-and-suspenders: scrub any transient status that an older build
      // already wrote to storage, so existing stuck "polling" rows recover.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        for (const c of state.ibkrConnections) {
          if (c.status !== "idle") {
            c.status = "idle";
            c.error = null;
          }
        }
      },
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
        // → v6: account abstraction. Normalize every Account to the new shape
        // (color/contributions/timestamps; drop `kind`), and migrate
        // holding/trade/setup links from account-NAME to stable accountId.
        // Any referenced name without an account gets one seeded so nothing
        // orphans; connections link to accounts by matching label == name.
        // (Guarded < 6 to repair states stranded by an interrupted v5 run.)
        if (version < 6 && persistedState && typeof persistedState === "object") {
          const old = persistedState as Record<string, unknown>;
          const MIG_TS = "2026-01-01T00:00:00Z";

          type LegacyAccount = {
            id: string;
            name: string;
            kind?: "trading" | "long-term";
            color?: string;
            cashCents?: number;
            netContributionsCents?: number;
            flexConnectionId?: string;
            createdAt?: string;
            updatedAt?: string;
            source?: "demo" | "manual" | "ibkr";
          };
          type LegacyRow = {
            account?: string;
            accountId?: string;
            [k: string]: unknown;
          };

          // Demo accounts are refreshed from the current seed (correct color +
          // net contributions); real/manual/ibkr accounts are normalized in place.
          const seedById = new Map(accountsSeed.map((a) => [a.id, a]));
          const accounts: Account[] = ((old.accounts as LegacyAccount[]) ?? []).map(
            (a) => {
              const seed = seedById.get(a.id);
              if (a.source === "demo" && seed) return { ...seed };
              return {
                id: a.id,
                name: a.name,
                color:
                  a.color ??
                  (a.kind === "long-term"
                    ? ACCOUNT_LONG_TERM_COLOR
                    : ACCOUNT_TRADING_COLOR),
                cashCents: a.cashCents ?? 0,
                netContributionsCents: a.netContributionsCents ?? a.cashCents ?? 0,
                flexConnectionId: a.flexConnectionId,
                createdAt: a.createdAt ?? MIG_TS,
                updatedAt: a.updatedAt ?? MIG_TS,
                source: a.source,
              };
            },
          );

          const byName = new Map<string, string>();
          for (const a of accounts) byName.set(a.name, a.id);

          const ensureByName = (name: string): string => {
            const hit = byName.get(name);
            if (hit) return hit;
            const id = `acct-mig-${name.replace(/\W+/g, "-").toLowerCase()}-${accounts.length}`;
            accounts.push({
              id,
              name,
              color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]!,
              cashCents: 0,
              netContributionsCents: 0,
              createdAt: MIG_TS,
              updatedAt: MIG_TS,
              source: "ibkr",
            });
            byName.set(name, id);
            return id;
          };

          // Robust: keep an accountId only if it actually matches an account.
          // Otherwise recover from the legacy `account` NAME field. This also
          // repairs rows stranded by an interrupted earlier migration.
          const remap = <T extends LegacyRow>(rows: T[] | undefined): T[] =>
            (rows ?? []).map((row) => {
              if (row.accountId && accounts.some((a) => a.id === row.accountId)) {
                return row;
              }
              if (typeof row.account === "string" && row.account) {
                const { account, ...rest } = row;
                return { ...(rest as T), accountId: ensureByName(account) };
              }
              return row;
            });

          old.holdings = remap(old.holdings as LegacyRow[] | undefined);
          old.trades = remap(old.trades as LegacyRow[] | undefined);
          old.setups = remap(old.setups as LegacyRow[] | undefined);

          // Link each connection to the account whose name matches its label.
          for (const c of (old.ibkrConnections as IbkrConnection[]) ?? []) {
            const accId = byName.get(c.label);
            const acc = accId ? accounts.find((a) => a.id === accId) : undefined;
            if (acc && !acc.flexConnectionId) acc.flexConnectionId = c.id;
          }

          old.accounts = accounts;
          old.selectedAccountId = ALL_ACCOUNTS;
        }
        return persistedState as StoreState;
      },
    },
  ),
);
