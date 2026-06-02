import { useMemo, useState } from "react";
import { Plus, Bookmark, Terminal } from "lucide-react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Shell, Sidebar } from "@/components/layout";
import { AccountFormModal, AccountSwitcher, CommandPalette, Toaster } from "@/components/ui";
import { Overview } from "@/pages/Overview";
import { Trading } from "@/pages/Trading";
import { Holdings } from "@/pages/Holdings";
import { Calendar } from "@/pages/Calendar";
import { Settings } from "@/pages/Settings";
import { NewTradeModal } from "@/features/trades";
import { useHotkeys } from "@/lib/hotkeys";

// Account-scoped views — the switcher narrows what these show.
const PRIMARY = [
  { id: "/", label: "Overview" },
  { id: "/activity", label: "Activity" },
  { id: "/holdings", label: "Holdings" },
  { id: "/calendar", label: "Calendar" },
];

// Global, account-independent views.
const SECONDARY = [
  { id: "/performance", label: "Performance" },
  { id: "/settings", label: "Settings" },
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newTradeSymbol, setNewTradeSymbol] = useState<string | undefined>(undefined);
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
    () => [...PRIMARY.map((p) => p.id), ...SECONDARY.map((p) => p.id)],
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

  const bindings = useMemo(
    () => [
      { combo: "n", handler: () => openNewTrade() },
      { combo: "cmd+k", handler: () => setPaletteOpen((v) => !v) },
      { combo: "ctrl+k", handler: () => setPaletteOpen((v) => !v) },
      { combo: "g o", handler: () => navigate("/") },
      { combo: "g a", handler: () => navigate("/activity") },
      { combo: "g c", handler: () => navigate("/calendar") },
      { combo: "g h", handler: () => navigate("/holdings") },
      { combo: "g s", handler: () => navigate("/settings") },
    ],
    [navigate],
  );
  useHotkeys(bindings);

  return (
    <Shell
      navOpen={navOpen}
      onToggleNav={() => setNavOpen((v) => !v)}
      header={
        <AccountSwitcher
          onNewAccount={() => setAccountModal({})}
          onEditAccount={(id) => setAccountModal({ editId: id })}
        />
      }
      sidebar={
        <Sidebar
          active={normalizedActive}
          onSelect={onNavSelect}
          primary={PRIMARY}
          secondary={SECONDARY}
          footer={
            <div className="sidebarCtas">
              <button
                type="button"
                className="sidebarCta sidebarCta--primary"
                onClick={() => openNewTrade()}
              >
                <Plus size={13} strokeWidth={2} />
                <span>New Trade</span>
              </button>
              <button type="button" className="sidebarCta" disabled title="Coming soon">
                <Terminal size={13} strokeWidth={1.75} />
                <span>New Setup</span>
              </button>
              <button type="button" className="sidebarCta" disabled title="Coming soon">
                <Bookmark size={13} strokeWidth={1.75} />
                <span>New Note</span>
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
        <Route path="/performance" element={<Placeholder name="Performance" />} />
        <Route path="/settings" element={<Settings />} />
        {/* Legacy paths → new IA */}
        <Route path="/trading" element={<Navigate to="/activity" replace />} />
        <Route path="/accounts/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {newTradeOpen && (
        <NewTradeModal onClose={closeNewTrade} initialSymbol={newTradeSymbol} />
      )}
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
        />
      )}
      <Toaster />
    </Shell>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div
      style={{
        height: "60vh",
        display: "grid",
        placeItems: "center",
        color: "var(--text-tertiary)",
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-2xl)",
        letterSpacing: "var(--tracking-tight)",
      }}
    >
      {name} — coming soon
    </div>
  );
}
