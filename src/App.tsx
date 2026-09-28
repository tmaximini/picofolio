import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, CircleHelp, Info, Plus, Terminal } from "lucide-react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Shell, Sidebar } from "@/components/layout";
import {
  GlyphActivity,
  GlyphCalendar,
  GlyphHoldings,
  GlyphOverview,
  GlyphPerformance,
  GlyphReview,
  GlyphSettings,
  GlyphWatchlist,
} from "@/components/layout/nav-glyphs";
import { Kbd } from "@/components/primitives";
import {
  AccountFormModal,
  AccountSwitcher,
  CommandPalette,
  ShortcutsHelp,
  Toaster,
} from "@/components/ui";
import { Landing } from "@/pages/Landing";
import { Overview } from "@/pages/Overview";
import { Trading } from "@/pages/Trading";
import { Holdings } from "@/pages/Holdings";
import { Calendar } from "@/pages/Calendar";
import { Performance } from "@/pages/Performance";
import { Settings } from "@/pages/Settings";
import { Watchlist } from "@/pages/Watchlist";
import { Review } from "@/pages/Review";
import { NewTradeModal } from "@/features/trades";
import { NewSetupModal } from "@/features/setups";
import { NewNoteModal } from "@/features/notes";
import { useHotkeys } from "@/lib/hotkeys";
import type { Note } from "@/lib/notes";
import { ALL_ACCOUNTS } from "@/store";
import {
  useIsFirstRun,
  useSelectedAccountId,
  useSyncAll,
  useUnreviewedCount,
} from "@/store/selectors";

// Nav grouped into lenses, not a flat list. Trading and Investing are two
// viewpoints over the same account's data (the switcher narrows the scope);
// the grouping makes that separation legible without partitioning accounts.
// Glyphs are hand-drawn (components/layout/nav-glyphs), each with a hover
// animation; every row also reveals its g-chord on hover.
const NAV_SECTIONS = [
  {
    label: "Portfolio",
    items: [{ id: "/overview", label: "Overview", icon: <GlyphOverview />, shortcut: "g o" }],
  },
  {
    label: "Investing",
    items: [
      { id: "/holdings", label: "Holdings", icon: <GlyphHoldings />, shortcut: "g h" },
      { id: "/watchlist", label: "Watchlist", icon: <GlyphWatchlist />, shortcut: "g w" },
    ],
  },
  {
    label: "Trading",
    items: [
      { id: "/activity", label: "Journal", icon: <GlyphActivity />, shortcut: "g a" },
      { id: "/calendar", label: "Calendar", icon: <GlyphCalendar />, shortcut: "g c" },
      { id: "/review", label: "Review", icon: <GlyphReview />, shortcut: "g r" },
      { id: "/performance", label: "Performance", icon: <GlyphPerformance />, shortcut: "g p" },
    ],
  },
  // Trailing, unlabeled group — rendered after a divider.
  {
    items: [{ id: "/settings", label: "Settings", icon: <GlyphSettings />, shortcut: "g s" }],
  },
];

/**
 * Pick which sidebar item is "active" based on the current pathname.
 * Longest-id-first match supports nested routes.
 */
function activeIdFor(pathname: string, ids: string[]): string | null {
  const sorted = [...ids].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    if (pathname === id || pathname.startsWith(id + "/")) return id;
  }
  return null;
}

/** Router state the sidebar's About link sets, so "/" shows the landing page
 *  instead of forwarding a set-up user into the app. */
export type LandingState = { about?: boolean };

export function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

/**
 * "/" is the landing page; the app lives at top-level routes (/overview,
 * /holdings, …). New visitors always get the landing page — deep links
 * included. Set-up users hitting "/" go straight to /overview, unless they
 * came via About.
 */
export function AppInner() {
  const firstRun = useIsFirstRun();
  const location = useLocation();
  const atRoot = location.pathname === "/";
  if (firstRun) {
    return atRoot ? <Landing mode="first-run" /> : <Navigate to="/" replace />;
  }
  if (atRoot) {
    const about = (location.state as LandingState | null)?.about === true;
    return about ? <Landing mode="about" /> : <Navigate to="/overview" replace />;
  }
  return <Workspace />;
}

function Workspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const [newTradeOpen, setNewTradeOpen] = useState(false);
  const [newSetupOpen, setNewSetupOpen] = useState(false);
  // null = closed; { note? } = open (create when note absent, edit otherwise).
  const [noteModal, setNoteModal] = useState<{ note?: Note } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newTradeSymbol, setNewTradeSymbol] = useState<string | undefined>(undefined);
  const syncAll = useSyncAll();
  const scope = useSelectedAccountId();
  const scopedAccountId = scope === ALL_ACCOUNTS ? undefined : scope;
  // undefined = closed; { editId?: string } = open (create when editId absent).
  const [accountModal, setAccountModal] = useState<{ editId?: string } | null>(null);
  // Sidebar visibility — open on desktop, collapsed (drawer) on small screens.
  const [navOpen, setNavOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 900,
  );

  const onNavSelect = (id: string) => {
    if (id.startsWith("/")) navigate(id);
    // On small screens the sidebar is a drawer — close it after navigating.
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      setNavOpen(false);
    }
  };

  // Review carries a quiet count of recent trades still waiting for review.
  const unreviewed = useUnreviewedCount(scope);
  const navSections = useMemo(
    () =>
      NAV_SECTIONS.map((sec) => ({
        ...sec,
        items: sec.items.map((i) => (i.id === "/review" ? { ...i, badge: unreviewed } : i)),
      })),
    [unreviewed],
  );

  const allNavIds = useMemo(
    () => NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id)),
    [],
  );
  const normalizedActive = activeIdFor(location.pathname, allNavIds) ?? "/overview";

  const openNewTrade = useCallback((symbol?: string) => {
    setNewTradeSymbol(symbol);
    setNewTradeOpen(true);
  }, []);
  const closeNewTrade = () => {
    setNewTradeOpen(false);
    setNewTradeSymbol(undefined);
  };

  // Automatic, quiet syncs keep data fresh without anyone pressing Sync.
  // Each is throttled per connection (15 min, see syncAll's quiet mode), so
  // switching accounts back and forth never hammers IBKR's rate limit.
  //  - on load: every linked account + prices
  //  - on switching accounts: that account, if its data is stale
  //  - on returning to the tab: everything stale
  useEffect(() => {
    void syncAll({ quiet: true });
  }, [syncAll]);
  const firstScope = useRef(true);
  useEffect(() => {
    if (firstScope.current) {
      firstScope.current = false; // the on-load sync already covered it
      return;
    }
    void syncAll({ accountId: scopedAccountId, quiet: true });
  }, [scopedAccountId, syncAll]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncAll({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncAll]);

  const bindings = useMemo(
    () => [
      { combo: "n", handler: () => openNewTrade() },
      { combo: "s", handler: () => setNewSetupOpen(true) },
      { combo: "b", handler: () => setNoteModal({}) },
      // "r" (not ⌘R — the browser owns that) syncs every account: IBKR
      // pulls + prices, same as the Sync button.
      { combo: "r", handler: () => void syncAll() },
      { combo: "?", handler: () => setHelpOpen((v) => !v) },
      { combo: "cmd+k", handler: () => setPaletteOpen((v) => !v) },
      { combo: "ctrl+k", handler: () => setPaletteOpen((v) => !v) },
      { combo: "g o", handler: () => navigate("/overview") },
      { combo: "g a", handler: () => navigate("/activity") },
      { combo: "g c", handler: () => navigate("/calendar") },
      { combo: "g h", handler: () => navigate("/holdings") },
      { combo: "g w", handler: () => navigate("/watchlist") },
      { combo: "g p", handler: () => navigate("/performance") },
      { combo: "g r", handler: () => navigate("/review") },
      { combo: "g s", handler: () => navigate("/settings") },
    ],
    [navigate, syncAll, scopedAccountId, openNewTrade],
  );
  useHotkeys(bindings);

  return (
    <Shell
      navOpen={navOpen}
      onToggleNav={() => setNavOpen((v) => !v)}
      sidebar={
        <Sidebar
          active={normalizedActive}
          onSelect={onNavSelect}
          sections={navSections}
          onToggleNav={() => setNavOpen((v) => !v)}
          header={
            <AccountSwitcher
              onNewAccount={() => setAccountModal({})}
              onEditAccount={(id) => setAccountModal({ editId: id })}
            />
          }
          footer={
            <div className="sidebarCtas">
              <button
                type="button"
                className="sidebarCta sidebarCta--primary"
                onClick={() => openNewTrade()}
              >
                <Plus size={13} strokeWidth={2} />
                <span>New Trade</span>
                <Kbd>N</Kbd>
              </button>
              <button
                type="button"
                className="sidebarCta"
                onClick={() => setNewSetupOpen(true)}
              >
                <Terminal size={13} strokeWidth={1.75} />
                <span>New Setup</span>
                <Kbd>S</Kbd>
              </button>
              <button
                type="button"
                className="sidebarCta"
                onClick={() => setNoteModal({})}
              >
                <Bookmark size={13} strokeWidth={1.75} />
                <span>New Note</span>
                <Kbd>B</Kbd>
              </button>
              <button
                type="button"
                className="sidebarCta sidebarCta--ghost"
                onClick={() => setHelpOpen(true)}
              >
                <CircleHelp size={13} strokeWidth={1.75} />
                <span>Shortcuts</span>
                <Kbd>?</Kbd>
              </button>
              <button
                type="button"
                className="sidebarCta sidebarCta--ghost"
                onClick={() => navigate("/", { state: { about: true } satisfies LandingState })}
              >
                <Info size={13} strokeWidth={1.75} />
                <span>About</span>
              </button>
            </div>
          }
        />
      }
    >
      <Routes>
        <Route path="/overview" element={<Overview />} />
        <Route path="/activity" element={<Trading />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/holdings" element={<Holdings />} />
        <Route path="/watchlist" element={<Watchlist onNewTrade={openNewTrade} />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/review" element={<Review />} />
        <Route path="/settings" element={<Settings />} />
        {/* Legacy paths → new IA */}
        <Route path="/trading" element={<Navigate to="/activity" replace />} />
        <Route path="/accounts/*" element={<Navigate to="/overview" replace />} />
        <Route path="/about" element={<Navigate to="/" replace state={{ about: true }} />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>

      {newTradeOpen && (
        <NewTradeModal onClose={closeNewTrade} initialSymbol={newTradeSymbol} />
      )}
      {newSetupOpen && <NewSetupModal onClose={() => setNewSetupOpen(false)} />}
      {noteModal && (
        <NewNoteModal note={noteModal.note} onClose={() => setNoteModal(null)} />
      )}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
      {accountModal && (
        <AccountFormModal
          accountId={accountModal.editId}
          onClose={() => setAccountModal(null)}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onPickSymbol={(sym) => openNewTrade(sym)}
          onPickNav={(path) => navigate(path)}
          onAction={(id) => {
            if (id === "new-trade") openNewTrade();
            else if (id === "new-setup") setNewSetupOpen(true);
            else if (id === "new-note") setNoteModal({});
            else void syncAll();
          }}
          onEditNote={(note) => setNoteModal({ note })}
        />
      )}
      <Toaster />
    </Shell>
  );
}
