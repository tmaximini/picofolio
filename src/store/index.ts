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
import {
  fetchYahooDaily,
  fetchYahooIntraday,
  intradayCacheKey,
  type IntradayPoint,
} from "@/lib/yahoo";
import { fetchFlexStatement, parseFlexXml } from "@/lib/ibkr";
import type { ParsedNavPoint, ParsedPosition } from "@/lib/ibkr/flexParser";
import { parseOccSymbol } from "@/lib/optionSymbol";
import { optionsPriceProvider, OptionsNotFoundError } from "@/lib/options";

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

/** Why an option-price load failed — drives the calm inline UX in the chart
 *  slot ("Add token →" vs "couldn't fetch this contract" vs generic). */
export type OptionPriceErrorKind = "no-token" | "not-found" | "fetch";

/** Option-price cache entry. Latest point = current mark. Separate from the
 *  equity `prices` map so option marking never touches the equity/journal
 *  path, and so the no-token state stays distinguishable. */
export type OptionPriceEntry = {
  points: PricePoint[];
  status: PriceStatus;
  error?: string;
  errorKind?: OptionPriceErrorKind;
  /** epoch ms */
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

/** One day of broker-reported account value (IBKR NAV-in-Base). */
export type NavPoint = { time: string; valueCents: number };

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

  /** Intraday cache keyed by resolved request (see intradayCacheKey). */
  intraday: Record<string, IntradayEntry>;

  /** Option-price cache keyed by OCC symbol (open positions only). */
  optionPrices: Record<string, OptionPriceEntry>;

  /** Broker-reported daily NAV per account (from the Flex NAV-in-Base
   *  section), date-ascending. The authoritative account-value history —
   *  charts prefer it over the price-reconstructed curve. */
  navHistory: Record<string, NavPoint[]>;

  /** MarketData.app token (BYOK) for options pricing. Optional — the app is
   *  fully functional without it; only open-option live marks + charts need it.
   *  PoC stores it in localStorage like the IBKR token; move to OS keychain on
   *  Tauri. */
  marketDataToken: string | null;

  // Toasts
  toasts: Toast[];

  lastSyncAt: number | null;
  syncing: boolean;

  // Price actions
  loadPrice: (symbol: string, opts?: { force?: boolean }) => Promise<void>;
  /** Fetch + cache intraday for [startKey, endKey] (single-day when endKey omitted). */
  loadIntraday: (symbol: string, startKey: string, endKey?: string) => Promise<void>;
  /** Fetch + cache the EOD price history (and thus current mark) for an open
   *  option position via MarketData.app. No-ops on non-option symbols; sets a
   *  "no-token" state without any network call when no token is configured. */
  loadOptionPrice: (symbol: string) => Promise<void>;
  /** `force` bypasses the freshness window — used by the explicit Sync
   *  button so a user-initiated sync always re-pulls prices. */
  refreshAll: (opts?: { force?: boolean }) => Promise<void>;

  /** Set or clear the MarketData.app token. */
  setMarketDataToken: (token: string | null) => void;

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
  /** Wipe an account's trades + positions + setups + cash, keeping the
   *  account record, its name/color, IBKR link, and contributions. */
  resetAccount: (id: string) => void;

  // Holding actions — manual positions + corrections. Identified by
  // (accountId, symbol), which is unique within an account.
  addHolding: (input: {
    accountId: string;
    symbol: string;
    name?: string;
    qty: number;
    avgCostCents: number;
  }) => void;
  updateHolding: (
    accountId: string,
    symbol: string,
    patch: Partial<Pick<Holding, "symbol" | "name" | "qty" | "avgCostCents">>,
  ) => void;
  removeHolding: (accountId: string, symbol: string) => void;

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
  /** Drop demo-sourced trades + holdings for a single account. */
  clearDemoForAccount: (accountId: string) => void;
  clearDemoPortfolio: () => void;
  restoreDemoPortfolio: () => void;

  // IBKR actions — per-connection
  addIbkrConnection: (label: string) => string;
  updateIbkrConnection: (
    id: string,
    patch: Partial<Pick<IbkrConnection, "label" | "token" | "queryId">>,
  ) => void;
  removeIbkrConnection: (id: string) => void;
  syncIbkrConnection: (id: string, opts?: { replace?: boolean }) => Promise<void>;
  /** Re-pull and atomically replace this account's IBKR trades + positions —
   *  old data is only dropped once the fresh statement parses successfully. */
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

/**
 * Merge freshly parsed NAV rows into an account's existing history. Rows for
 * the same date sum (a statement can span several raw IBKR accounts feeding
 * one Picofolio account); fresh dates overwrite, older history outside the
 * query window is kept — so a 365-day query never erodes a longer record.
 */
function mergeNavHistory(prev: NavPoint[] | undefined, rows: ParsedNavPoint[]): NavPoint[] {
  const fresh = new Map<string, number>();
  for (const r of rows) fresh.set(r.time, (fresh.get(r.time) ?? 0) + r.valueCents);
  const merged = new Map((prev ?? []).map((p) => [p.time, p.valueCents]));
  for (const [time, valueCents] of fresh) merged.set(time, valueCents);
  return [...merged.entries()]
    .map(([time, valueCents]) => ({ time, valueCents }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function firstOfThisMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Daily closes move once a day, but the *last* point is the live quote during
// market hours — 15 min keeps the headline value honest without hammering Yahoo.
const STALE_MS = 15 * 60 * 1000;
// Intraday bars grow throughout the session; refresh more eagerly.
const INTRADAY_STALE_MS = 5 * 60 * 1000;

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
      optionPrices: {},
      navHistory: {},
      marketDataToken: null,
      lastSyncAt: null,
      syncing: false,

      loadPrice: async (symbol, opts) => {
        // Option (OCC) symbols have no Yahoo daily history — they'd just 404.
        // Their value comes from the broker mark on the holding instead.
        if (parseOccSymbol(symbol)) return;
        const cur = get().prices[symbol];
        if (cur?.status === "loading") return;
        if (!opts?.force && isFresh(cur)) return;

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
        // Keyed by resolved request, not date window — windows that map to
        // the same Yahoo call share one entry (see intradayCacheKey).
        const key = intradayCacheKey(symbol, startKey);
        const cur = get().intraday[key];
        if (cur?.status === "loading") return;
        if (
          cur?.status === "ready" &&
          cur.fetchedAt &&
          Date.now() - cur.fetchedAt < INTRADAY_STALE_MS
        ) {
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

      loadOptionPrice: async (symbol) => {
        // Options only — equities go through loadPrice/Yahoo. This is the seam
        // that keeps the journal/closed-trade path from ever calling MarketData.
        if (!parseOccSymbol(symbol)) return;

        const cur = get().optionPrices[symbol];
        if (isFresh(cur) || cur?.status === "loading") return;

        // No token → calm "Add token →" state, no network call. The app stays
        // fully functional; only the live mark + chart are gated.
        const token = get().marketDataToken;
        if (!token) {
          set((s) => ({
            optionPrices: {
              ...s.optionPrices,
              [symbol]: { points: [], status: "error", errorKind: "no-token" },
            },
          }));
          return;
        }

        set((s) => ({
          optionPrices: {
            ...s.optionPrices,
            [symbol]: { points: cur?.points ?? [], status: "loading" },
          },
        }));

        // ~1y of EOD history; `to` is exclusive, so push it a day past today to
        // include the most recent close (the current mark).
        const now = new Date();
        const toDate = new Date(now);
        toDate.setDate(toDate.getDate() + 1);
        const fromDate = new Date(now);
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        const from = fromDate.toISOString().slice(0, 10);
        const to = toDate.toISOString().slice(0, 10);

        try {
          const points = await optionsPriceProvider.getHistory(symbol, token, from, to);
          set((s) => ({
            optionPrices: {
              ...s.optionPrices,
              [symbol]: { points, status: "ready", fetchedAt: Date.now() },
            },
          }));
        } catch (err) {
          // Renamed/adjusted contract after a corporate action → not-found.
          // We do not try to resolve symbol changes here.
          const errorKind: OptionPriceErrorKind =
            err instanceof OptionsNotFoundError ? "not-found" : "fetch";
          set((s) => ({
            optionPrices: {
              ...s.optionPrices,
              [symbol]: {
                points: cur?.points ?? [],
                status: "error",
                errorKind,
                error: err instanceof Error ? err.message : String(err),
              },
            },
          }));
        }
      },

      setMarketDataToken: (token) => {
        const next = token?.trim() || null;
        // Clearing or changing the token invalidates any cached no-token / error
        // states so the next view re-attempts cleanly.
        set((s) => ({
          marketDataToken: next,
          optionPrices: Object.fromEntries(
            Object.entries(s.optionPrices).filter(([, e]) => e.status === "ready"),
          ),
        }));
      },

      refreshAll: async (opts) => {
        if (get().syncing) return;
        set({ syncing: true });
        // Unique, Yahoo-priceable symbols only — skip OCC option contracts
        // (no daily history) and dedupe symbols held in multiple accounts.
        const symbols = [
          ...new Set(
            get()
              .holdings.map((h) => h.symbol)
              .filter((s) => parseOccSymbol(s) == null),
          ),
        ];
        // Eagerly prefetch live marks for open option positions too. The
        // freshness guard avoids redundant hits and the no-token case
        // short-circuits without a network call.
        const optionSymbols = [
          ...new Set(
            get()
              .holdings.map((h) => h.symbol)
              .filter((s) => parseOccSymbol(s) != null),
          ),
        ];
        await Promise.allSettled([
          ...symbols.map((s) => get().loadPrice(s, { force: opts?.force })),
          ...optionSymbols.map((s) => get().loadOptionPrice(s)),
        ]);
        // lastSyncAt also nudges the intraday reconstruction (its load effect
        // keys on it), so charts re-pull bars after an explicit sync.
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

      resetAccount: (id) =>
        set((s) => ({
          trades: s.trades.filter((t) => t.accountId !== id),
          holdings: s.holdings.filter((h) => h.accountId !== id),
          setups: s.setups.filter((sp) => sp.accountId !== id),
          navHistory: Object.fromEntries(
            Object.entries(s.navHistory).filter(([k]) => k !== id),
          ),
          accounts: s.accounts.map((a) =>
            a.id === id
              ? { ...a, cashCents: 0, updatedAt: new Date().toISOString() }
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
          navHistory: Object.fromEntries(
            Object.entries(s.navHistory).filter(([k]) => k !== id),
          ),
          // If it was the active scope, fall back to the roll-up.
          selectedAccountId:
            s.selectedAccountId === id ? ALL_ACCOUNTS : s.selectedAccountId,
        })),

      // ---------- holdings ----------

      addHolding: (input) =>
        set((s) => {
          const exists = s.holdings.some(
            (h) => h.accountId === input.accountId && h.symbol === input.symbol,
          );
          if (exists) {
            // Same ticker already held — treat as a correction (overwrite).
            return {
              holdings: s.holdings.map((h) =>
                h.accountId === input.accountId && h.symbol === input.symbol
                  ? {
                      ...h,
                      qty: input.qty,
                      avgCostCents: input.avgCostCents,
                      name: input.name?.trim() || h.name,
                    }
                  : h,
              ),
            };
          }
          return {
            holdings: [
              ...s.holdings,
              {
                symbol: input.symbol.trim(),
                name: input.name?.trim() || input.symbol.trim(),
                accountId: input.accountId,
                qty: input.qty,
                avgCostCents: input.avgCostCents,
                source: "manual",
              },
            ],
          };
        }),

      updateHolding: (accountId, symbol, patch) =>
        set((s) => ({
          holdings: s.holdings.map((h) =>
            h.accountId === accountId && h.symbol === symbol
              ? {
                  ...h,
                  ...(patch.symbol != null ? { symbol: patch.symbol.trim() } : {}),
                  ...(patch.name != null ? { name: patch.name.trim() || h.name } : {}),
                  ...(patch.qty != null ? { qty: patch.qty } : {}),
                  ...(patch.avgCostCents != null ? { avgCostCents: patch.avgCostCents } : {}),
                }
              : h,
          ),
        })),

      removeHolding: (accountId, symbol) =>
        set((s) => ({
          holdings: s.holdings.filter(
            (h) => !(h.accountId === accountId && h.symbol === symbol),
          ),
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
      clearDemoForAccount: (accountId) =>
        set((s) => ({
          trades: s.trades.filter(
            (t) => !(t.source === "demo" && t.accountId === accountId),
          ),
          holdings: s.holdings.filter(
            (h) => !(h.source === "demo" && h.accountId === accountId),
          ),
        })),
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
        const resolve = (rawId: string) =>
          targetAccountId ?? ensureImportAccountId(rawId);

        const stamped = result.trades.map((t) => ({
          ...t,
          accountId: resolve(t.accountId),
        }));
        const parsedById = new Map(stamped.map((t) => [t.id, t]));
        const existingIds = new Set(get().trades.map((t) => t.id));
        const fresh = stamped.filter((t) => !existingIds.has(t.id));
        if (stamped.length > 0) {
          set((s) => {
            const hadReal = s.trades.some((t) => t.source !== "demo");
            // Upsert: re-stamp already-imported trades onto their resolved
            // account (so re-importing into the right account *moves* them
            // rather than no-op'ing on the dedupe), then prepend new ones.
            let base = s.trades.map((t) => {
              const p = parsedById.get(t.id);
              return p ? { ...t, accountId: p.accountId } : t;
            });
            if (!hadReal) base = base.filter((t) => t.source !== "demo");
            return { trades: [...fresh, ...base] };
          });
        }

        // Open positions → holdings.
        if (result.positions.length > 0) {
          const byAccount = new Map<string, ParsedPosition[]>();
          for (const p of result.positions) {
            const accId = resolve(p.accountId);
            const arr = byAccount.get(accId) ?? [];
            arr.push(p);
            byAccount.set(accId, arr);
          }
          const importedSymbols = new Set(result.positions.map((p) => p.symbol));
          set((s) => {
            // When importing into one explicit account, consolidate: drop any
            // stale IBKR holding for these symbols from *every* account so a
            // mis-placed earlier import doesn't linger elsewhere.
            const stale = (h: Holding) =>
              h.source === "ibkr" &&
              (targetAccountId
                ? importedSymbols.has(h.symbol)
                : byAccount.has(h.accountId));
            let holdings = s.holdings.filter((h) => !stale(h));
            for (const [accId, ps] of byAccount) {
              holdings = [...holdings, ...buildIbkrHoldings(accId, ps)];
            }
            return { holdings };
          });
          if (result.cashCents !== 0) {
            for (const accId of byAccount.keys()) {
              get().updateAccount(accId, { cashCents: result.cashCents });
            }
          }
        }

        // Daily NAV rows → per-resolved-account history.
        if (result.nav.length > 0) {
          const navByAccount = new Map<string, ParsedNavPoint[]>();
          for (const n of result.nav) {
            const accId = resolve(n.accountId);
            const arr = navByAccount.get(accId) ?? [];
            arr.push(n);
            navByAccount.set(accId, arr);
          }
          set((s) => {
            const navHistory = { ...s.navHistory };
            for (const [accId, rows] of navByAccount) {
              navHistory[accId] = mergeNavHistory(navHistory[accId], rows);
            }
            return { navHistory };
          });
        }
        return {
          added: fresh.length,
          skipped: result.trades.length - fresh.length,
          warnings: result.warnings,
        };
      },

      syncIbkrConnection: async (id, opts) => {
        const replace = opts?.replace ?? false;
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
          if (stamped.length > 0) {
            set((s) => {
              const hadReal = s.trades.some((t) => t.source !== "demo");
              // `replace` (resync): the fresh pull is authoritative — drop this
              // account's existing IBKR trades, then add everything from the
              // pull. This only runs AFTER a successful fetch+parse, so a failed
              // resync never loses data. Plain sync just adds new trades.
              let base = replace
                ? s.trades.filter(
                    (t) => !(t.source === "ibkr" && t.accountId === accountId),
                  )
                : s.trades;
              if (!hadReal) base = base.filter((t) => t.source !== "demo");
              const baseIds = new Set(base.map((t) => t.id));
              const toAdd = stamped.filter((t) => !baseIds.has(t.id));
              return { trades: [...toAdd, ...base] };
            });
          }
          // Broker-reported daily NAV → authoritative account-value history.
          if (result.nav.length > 0) {
            set((s) => ({
              navHistory: {
                ...s.navHistory,
                [accountId]: mergeNavHistory(s.navHistory[accountId], result.nav),
              },
            }));
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
          const navDays = new Set(result.nav.map((n) => n.time)).size;
          let posNote =
            result.positions.length > 0
              ? `${stockPositions} position${stockPositions === 1 ? "" : "s"} updated.`
              : "No Open Positions in this query — add that section for Holdings & value.";
          if (navDays > 0) posNote += ` ${navDays} days of NAV history.`;
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
        // Atomic replace: fetch + parse first; only when that succeeds does the
        // account's old IBKR trades/positions get swapped for the fresh pull.
        // A failed pull (e.g. IBKR 1001) leaves existing data untouched.
        await get().syncIbkrConnection(id, { replace: true });
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
        // A "loading" entry persisted mid-flight would rehydrate as a permanent
        // block (loadPrice early-returns on loading) — freeze the symbol's
        // history forever. Demote to idle so the next view refetches.
        prices: Object.fromEntries(
          Object.entries(s.prices).map(([k, e]) => [
            k,
            e.status === "loading" ? { ...e, status: "idle" as const } : e,
          ]),
        ),
        // Cache EOD option history aggressively — it's immutable once the day
        // closes. Drop in-flight "loading" entries so a load interrupted by a
        // page close doesn't rehydrate as a permanent block (the action guards
        // on status). The MarketData token is sensitive — same PoC caveat as
        // the IBKR token (localStorage now, OS keychain on Tauri).
        optionPrices: Object.fromEntries(
          Object.entries(s.optionPrices).filter(([, e]) => e.status !== "loading"),
        ),
        marketDataToken: s.marketDataToken,
        navHistory: s.navHistory,
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
      version: 7,
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
        // Repair price entries an older build persisted as "loading" — they
        // would otherwise never refetch (see partialize note).
        for (const e of Object.values(state.prices)) {
          if (e.status === "loading") e.status = "idle";
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
