import type { ReactNode } from "react";

type TopbarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <div className="topbar">
      <div>
        <h1 className="pageTitle">{title}</h1>
        {subtitle && <div className="pageSub">{subtitle}</div>}
      </div>
      {actions && <div className="topbar__actions">{actions}</div>}
    </div>
  );
}
