import { useEffect, useMemo, useState } from "react";
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
  GlyphSettings,
} from "@/components/layout/nav-glyphs";
import { Kbd } from "@/components/primitives";
import {
  AccountFormModal,
  AccountSwitcher,
  CommandPalette,
  ShortcutsHelp,
  Toaster,
  Welcome,
} from "@/components/ui";
import { Overview } from "@/pages/Overview";
import { Trading } from "@/pages/Trading";
import { Holdings } from "@/pages/Holdings";
import { Calendar } from "@/pages/Calendar";
import { Performance } from "@/pages/Performance";
import { Settings } from "@/pages/Settings";
import { NewTradeModal } from "@/features/trades";
import { NewSetupModal } from "@/features/setups";
import { NewNoteModal } from "@/features/notes";
import { useHotkeys } from "@/lib/hotkeys";
import type { Note } from "@/lib/notes";
import { ALL_ACCOUNTS } from "@/store";
import {
  useIsFirstRun,
  useOpenWelcome,
  useSelectedAccountId,
  useSyncAll,
  useWelcomeVisible,
} from "@/store/selectors";

// Nav grouped into lenses, not a flat list. Trading and Investing are two
// viewpoints over the same account's data (the switcher narrows the scope);
// the grouping makes that separation legible without partitioning accounts.
// Glyphs are hand-drawn (components/layout/nav-glyphs), each with a hover
// animation; every row also reveals its g-chord on hover.
const NAV_SECTIONS = [
  {
    label: "Portfolio",
    items: [{ id: "/", label: "Overview", icon: <GlyphOverview />, shortcut: "g o" }],
  },
  {
    label: "Investing",
    items: [{ id: "/holdings", label: "Holdings", icon: <GlyphHoldings />, shortcut: "g h" }],
  },
  {
    label: "Trading",
    items: [
      { id: "/activity", label: "Journal", icon: <GlyphActivity />, shortcut: "g a" },
      { id: "/calendar", label: "Calendar", icon: <GlyphCalendar />, shortcut: "g c" },
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
 * Longest-id-first match supports nested routes. The "/" item only matches
 * the literal root path.
 */
function activeIdFor(pathname: string, ids: string[]): string | null {
  const sorted = [...ids].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    if (id === "/") {
      if (pathname === "/") return id;
      continue;
    }
    if (pathname === id || pathname.startsWith(id + "/")) return id;
  }
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

function AppInner() {
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
  const firstRun = useIsFirstRun();
  const welcomeVisible = useWelcomeVisible();
  const openWelcome = useOpenWelcome();
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

  const allNavIds = useMemo(
    () => NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id)),
    [],
  );
  const normalizedActive = activeIdFor(location.pathname, allNavIds) ?? "/";

  const openNewTrade = (symbol?: string) => {
    setNewTradeSymbol(symbol);
    setNewTradeOpen(true);
  };
  const closeNewTrade = () => {
    setNewTradeOpen(false);
    setNewTradeSymbol(undefined);
  };

  // Auto-sync on load: every linked account + prices, once the user is past
  // the first-run screen. Quiet — only real outcomes (new trades, errors) toast.
  useEffect(() => {
    if (!firstRun) void syncAll({ quiet: true });
  }, [firstRun, syncAll]);

  const bindings = useMemo(
    () => [
      { combo: "n", handler: () => openNewTrade() },
      { combo: "s", handler: () => setNewSetupOpen(true) },
      { combo: "b", handler: () => setNoteModal({}) },
      // "r" (not ⌘R — the browser owns that) runs the full sync for the
      // current scope: IBKR pulls + prices, same as the Sync button.
      { combo: "r", handler: () => void syncAll({ accountId: scopedAccountId }) },
      { combo: "?", handler: () => setHelpOpen((v) => !v) },
      { combo: "cmd+k", handler: () => setPaletteOpen((v) => !v) },
      { combo: "ctrl+k", handler: () => setPaletteOpen((v) => !v) },
      { combo: "g o", handler: () => navigate("/") },
      { combo: "g a", handler: () => navigate("/activity") },
      { combo: "g c", handler: () => navigate("/calendar") },
      { combo: "g h", handler: () => navigate("/holdings") },
      { combo: "g p", handler: () => navigate("/performance") },
      { combo: "g s", handler: () => navigate("/settings") },
    ],
    [navigate, syncAll, scopedAccountId],
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
          sections={NAV_SECTIONS}
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
                onClick={openWelcome}
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
        <Route path="/" element={<Overview />} />
        <Route path="/activity" element={<Trading />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/holdings" element={<Holdings />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/settings" element={<Settings />} />
        {/* Legacy paths → new IA */}
        <Route path="/trading" element={<Navigate to="/activity" replace />} />
        <Route path="/accounts/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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
            else void syncAll({ accountId: scopedAccountId });
          }}
          onEditNote={(note) => setNoteModal({ note })}
        />
      )}
      <Toaster />
      {welcomeVisible && <Welcome />}
    </Shell>
  );
}
