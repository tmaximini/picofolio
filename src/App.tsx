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
import { CommandPalette, Toaster } from "@/components/ui";
import { Overview } from "@/pages/Overview";
import { Trading } from "@/pages/Trading";
import { Account } from "@/pages/Account";
import { Calendar } from "@/pages/Calendar";
import { Settings } from "@/pages/Settings";
import { NewTradeModal } from "@/features/trades";
import { useHotkeys } from "@/lib/hotkeys";

const PRIMARY = [
  { id: "/", label: "Overview" },
  { id: "/trading", label: "Trading Journal" },
  { id: "/calendar", label: "Calendar" },
  { id: "/holdings", label: "Holdings" },
  { id: "/performance", label: "Performance" },
  { id: "/settings", label: "Settings" },
];

// Account identity colors are deliberately NOT gain-green / loss-red — those
// belong to the P&L language. Amber = active trading sleeve, violet = the
// steady long-term sleeve.
const ACCOUNTS = [
  { id: "/accounts/U-trade", label: "Trading", dotColor: "#D9A86C" },
  { id: "/accounts/U-long-term", label: "Long-Term", dotColor: "#7D77C3" },
];

/**
 * Pick which sidebar item is "active" based on the current pathname.
 * Longest-id-first match supports nested routes (e.g. /accounts/U-trade
 * wins over a hypothetical /accounts root). The "/" item only matches
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

  const allNavIds = useMemo(
    () => [...PRIMARY.map((p) => p.id), ...ACCOUNTS.map((a) => a.id)],
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
      { combo: "g j", handler: () => navigate("/trading") },
      { combo: "g c", handler: () => navigate("/calendar") },
      { combo: "g h", handler: () => navigate("/holdings") },
      { combo: "g s", handler: () => navigate("/settings") },
    ],
    [navigate],
  );
  useHotkeys(bindings);

  return (
    <Shell
      sidebar={
        <Sidebar
          active={normalizedActive}
          onSelect={(id) => {
            if (id.startsWith("/")) navigate(id);
          }}
          primary={PRIMARY}
          accounts={ACCOUNTS}
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
        <Route path="/trading" element={<Trading />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/holdings" element={<Placeholder name="Holdings" />} />
        <Route path="/performance" element={<Placeholder name="Performance" />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/accounts/:accountId" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {newTradeOpen && (
        <NewTradeModal onClose={closeNewTrade} initialSymbol={newTradeSymbol} />
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
