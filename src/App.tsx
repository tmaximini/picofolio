import { useState } from "react";
import { Shell, Sidebar } from "@/components/layout";
import { Overview } from "@/pages/Overview";

const PRIMARY = [
  { id: "overview", label: "Overview" },
  { id: "trading", label: "Trading Journal" },
  { id: "holdings", label: "Holdings" },
  { id: "performance", label: "Performance" },
];

const ACCOUNTS = [
  { id: "U-trade", label: "Trading", dotColor: "#C44536" },
  { id: "U-core", label: "Core Long-Term", dotColor: "#6BCB97" },
  { id: "U-roth", label: "Roth", dotColor: "#8B9DC3" },
];

export function App() {
  const [active, setActive] = useState("overview");

  return (
    <Shell
      sidebar={
        <Sidebar
          active={active}
          onSelect={setActive}
          primary={PRIMARY}
          accounts={ACCOUNTS}
        />
      }
    >
      {active === "overview" && <Overview />}
      {active !== "overview" && <Placeholder name={active} />}
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
