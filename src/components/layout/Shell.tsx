import type { ReactNode } from "react";
import { Menu } from "lucide-react";

type ShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
  /** Whether the sidebar is shown (in-flow on desktop, drawer on mobile). */
  navOpen: boolean;
  onToggleNav: () => void;
};

export function Shell({ sidebar, children, navOpen, onToggleNav }: ShellProps) {
  return (
    <div className={`app${navOpen ? "" : " app--nav-collapsed"}`}>
      {/* Dim overlay — only visible when the drawer is open on small screens. */}
      <div className="navScrim" onClick={onToggleNav} aria-hidden />
      {/* Floating reopen button — only shown while the sidebar is collapsed
          (the collapse toggle itself lives inside the sidebar). */}
      <button
        type="button"
        className="navReopen navToggle"
        onClick={onToggleNav}
        aria-label="Show navigation"
        aria-expanded={navOpen}
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>
      {sidebar}
      <main className="main">{children}</main>
    </div>
  );
}
