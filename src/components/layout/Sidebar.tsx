import type { ReactNode } from "react";
import { Menu } from "lucide-react";

type NavItem = { id: string; label: ReactNode };

type SidebarProps = {
  active: string;
  onSelect: (id: string) => void;
  /** Account-scoped views (Overview, Activity, Holdings, Calendar). */
  primary: ReadonlyArray<NavItem>;
  /** Global, account-independent views (Performance, Settings). */
  secondary: ReadonlyArray<NavItem>;
  /** Persistent header below the brand — the account switcher. */
  header?: ReactNode;
  /** Collapse the sidebar (a floating button reopens it). */
  onToggleNav: () => void;
  footer?: ReactNode;
};

export function Sidebar({
  active,
  onSelect,
  primary,
  secondary,
  header,
  onToggleNav,
  footer,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="brand">
          <div className="brand__mark" aria-hidden />
          <div className="brand__name">Picofolio</div>
        </div>
        <button
          type="button"
          className="navToggle"
          onClick={onToggleNav}
          aria-label="Hide navigation"
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
      </div>

      {header && <div className="sidebar__header">{header}</div>}

      <nav className="nav">
        {primary.map((item) => (
          <NavButton key={item.id} item={item} active={active} onSelect={onSelect} />
        ))}

        <div className="nav__divider" />

        {secondary.map((item) => (
          <NavButton key={item.id} item={item} active={active} onSelect={onSelect} />
        ))}
      </nav>

      {footer}
    </aside>
  );
}

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={item.id === active ? "nav__item nav__item--active" : "nav__item"}
    >
      <span className="nav__dot" />
      {item.label}
    </button>
  );
}
