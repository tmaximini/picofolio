import type { ReactNode } from "react";

type ShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function Shell({ sidebar, children }: ShellProps) {
  return (
    <div className="app">
      {sidebar}
      <main className="main">{children}</main>
    </div>
  );
}
