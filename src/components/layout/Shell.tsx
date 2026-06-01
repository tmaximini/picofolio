import type { ReactNode } from "react";

type ShellProps = {
  sidebar: ReactNode;
  /** Persistent header at the top of the main area (account switcher). */
  header?: ReactNode;
  children: ReactNode;
};

export function Shell({ sidebar, header, children }: ShellProps) {
  return (
    <div className="app">
      {sidebar}
      <main className="main">
        {header && <div className="mainHeader">{header}</div>}
        {children}
      </main>
    </div>
  );
}
