import type { ReactNode } from "react";

type NavItem = { id: string; label: ReactNode; dotColor?: string };

type SidebarProps = {
  active: string;
  onSelect: (id: string) => void;
  primary: ReadonlyArray<NavItem>;
  accounts: ReadonlyArray<NavItem>;
};

export function Sidebar({ active, onSelect, primary, accounts }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark" aria-hidden />
        <div className="brand__name">Picofolio</div>
      </div>

      <nav className="nav">
        {primary.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={item.id === active ? "nav__item nav__item--active" : "nav__item"}
          >
            <span className="nav__dot" />
            {item.label}
          </button>
        ))}

        <div className="nav__section">Accounts</div>
        {accounts.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={item.id === active ? "nav__item nav__item--active" : "nav__item"}
          >
            <span
              className="nav__dot"
              style={item.dotColor ? { background: item.dotColor } : undefined}
            />
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
