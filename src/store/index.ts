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
import type { PricePoint } from "@/lib/priceHistory";
import { fetchYahooDaily } from "@/lib/yahoo";

export type PriceStatus = "idle" | "loading" | "ready" | "error";

export type PriceEntry = {
  points: PricePoint[];
  status: PriceStatus;
  error?: string;
  /** epoch ms */
  fetchedAt?: number;
};

type StoreState = {
  // Raw, seeded from mock; real data via actions
  accounts: Account[];
  holdings: Holding[];
  weeklyPnl: WeekBar[];

  // Async price data, keyed by symbol
  prices: Record<string, PriceEntry>;

  lastSyncAt: number | null;
  syncing: boolean;

  // Actions
  loadPrice: (symbol: string) => Promise<void>;
  refreshAll: () => Promise<void>;
};

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
      prices: {},
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

      refreshAll: async () => {
        if (get().syncing) return;
        set({ syncing: true });
        const symbols = get().holdings.map((h) => h.symbol);
        await Promise.allSettled(symbols.map((s) => get().loadPrice(s)));
        set({ syncing: false, lastSyncAt: Date.now() });
      },
    }),
    {
      name: "picofolio:store:v1",
      storage: createJSONStorage(() => localStorage),
      // Only persist prices + last sync. Seeds reload from code.
      partialize: (s) => ({
        prices: s.prices,
        lastSyncAt: s.lastSyncAt,
      }),
      version: 1,
    },
  ),
);
