import { Fragment, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { BrandMark } from "@/components/primitives";

type NavItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  /** Quiet count (e.g. trades awaiting review); hidden at 0. */
  badge?: number;
};

/** A labeled group of nav items. A section with no `label` renders after a
 *  divider (used for the trailing Settings group). */
type NavSection = {
  label?: string;
  items: ReadonlyArray<NavItem>;
};

type SidebarProps = {
  active: string;
  onSelect: (id: string) => void;
  /** Nav grouped into labeled sections (Portfolio / Investing / Trading / …). */
  sections: ReadonlyArray<NavSection>;
  /** Persistent header below the brand — the account switcher. */
  header?: ReactNode;
  /** Collapse the sidebar (a floating button reopens it). */
  onToggleNav: () => void;
  footer?: ReactNode;
};

export function Sidebar({
  active,
  onSelect,
  sections,
  header,
  onToggleNav,
  footer,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="brand">
          <BrandMark size={26} className="brand__mark" />
          <div className="brand__name wordmark">picofolio</div>
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
        {sections.map((section, i) => (
          <Fragment key={section.label ?? `section-${i}`}>
            {section.label ? (
              <div className="nav__section">{section.label}</div>
            ) : (
              i > 0 && <div className="nav__divider" />
            )}
            {section.items.map((item) => (
              <NavButton key={item.id} item={item} active={active} onSelect={onSelect} />
            ))}
          </Fragment>
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
      {item.icon && <span className="nav__icon">{item.icon}</span>}
      <span className="nav__label">{item.label}</span>
      {item.badge ? (
        <span className="nav__badge num" aria-label={`${item.badge} to review`}>
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
      {item.shortcut && (
        <span className="nav__key">
          {item.shortcut.split(" ").map((k) => (
            <kbd className="kbd" key={k}>{k}</kbd>
          ))}
        </span>
      )}
    </button>
  );
}
