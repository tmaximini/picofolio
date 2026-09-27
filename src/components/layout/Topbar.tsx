import type { ReactNode } from "react";
import { SyncButton } from "@/components/ui/SyncButton";

type TopbarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** The Sync button sits at the end of every page header so a sync is one
   *  click from anywhere. Pass an account id to scope it, or `false` where a
   *  page offers its own (Settings). Defaults to the switcher's scope. */
  sync?: boolean | string;
};

export function Topbar({ title, subtitle, actions, sync = true }: TopbarProps) {
  return (
    <div className="topbar">
      <div>
        <h1 className="pageTitle">{title}</h1>
        {subtitle && <div className="pageSub">{subtitle}</div>}
      </div>
      {(actions || sync !== false) && (
        <div className="topbar__actions">
          {actions}
          {sync !== false && <SyncButton accountId={typeof sync === "string" ? sync : undefined} />}
        </div>
      )}
    </div>
  );
}
