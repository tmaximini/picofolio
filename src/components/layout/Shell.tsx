import type { ReactNode } from "react";
import { Menu } from "lucide-react";

type ShellProps = {
  sidebar: ReactNode;
  /** Persistent header at the top of the main area (account switcher). */
  header?: ReactNode;
  children: ReactNode;
  /** Whether the sidebar is shown (in-flow on desktop, drawer on mobile). */
  navOpen: boolean;
  onToggleNav: () => void;
};

export function Shell({ sidebar, header, children, navOpen, onToggleNav }: ShellProps) {
  return (
    <div className={`app${navOpen ? "" : " app--nav-collapsed"}`}>
      {/* Dim overlay — only visible when the drawer is open on small screens. */}
      <div className="navScrim" onClick={onToggleNav} aria-hidden />
      {sidebar}
      <main className="main">
        <div className="mainHeaderRow">
          <button
            type="button"
            className="navToggle"
            onClick={onToggleNav}
            aria-label={navOpen ? "Hide navigation" : "Show navigation"}
            aria-expanded={navOpen}
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
          {header && <div className="mainHeader">{header}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
