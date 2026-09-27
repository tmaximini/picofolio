import type { ReactNode } from "react";
import { Link2Off, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/primitives";
import type { Account } from "@/lib/mock";
import {
  useIbkrConnections,
  usePushToast,
  useRemoveAccount,
  useRemoveIbkrConnection,
  useResetAccount,
  useResyncIbkrConnection,
} from "@/store/selectors";

/** Every destructive action for one account, each behind a two-click confirm. */
export function DangerZone({ account }: { account: Account }) {
  const connections = useIbkrConnections();
  const conn = connections.find((c) => c.id === account.flexConnectionId) ?? null;
  const reset = useResetAccount();
  const removeAccount = useRemoveAccount();
  const removeConnection = useRemoveIbkrConnection();
  const resync = useResyncIbkrConnection();
  const pushToast = usePushToast();
  const syncing = conn ? ["sending", "polling", "parsing"].includes(conn.status) : false;

  return (
    <section className="settingsCard dangerZone">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Danger zone</h2>
          <div className="settingsCard__sub">Each action asks for a second click.</div>
        </div>
      </div>

      <div className="dangerZone__rows">
        {conn && (
          <Row
            title="Re-import from IBKR"
            desc="Delete this account's imported trades and pull everything fresh. The token and Query ID stay. Use it if trades look duplicated or wrong."
          >
            <ConfirmButton
              confirmLabel="Re-import?"
              disabled={syncing || !conn.token || !conn.queryId}
              onConfirm={() => void resync(conn.id)}
            >
              <RotateCcw size={13} strokeWidth={1.75} />
              <span>Re-import</span>
            </ConfirmButton>
          </Row>
        )}
        {conn && (
          <Row
            title="Disconnect IBKR"
            desc="Forget the token and Query ID. Imported trades, positions and cash stay; the account becomes manual."
          >
            <ConfirmButton
              confirmLabel="Disconnect?"
              onConfirm={() => {
                removeConnection(conn.id);
                pushToast({ kind: "info", title: `${account.name} disconnected from IBKR`, duration: 3000 });
              }}
            >
              <Link2Off size={13} strokeWidth={1.75} />
              <span>Disconnect</span>
            </ConfirmButton>
          </Row>
        )}
        <Row
          title="Reset account"
          desc="Remove all trades, positions and cash. The account, its settings and IBKR link stay."
        >
          <ConfirmButton
            confirmLabel="Reset account?"
            onConfirm={() => {
              reset(account.id);
              pushToast({ kind: "info", title: `${account.name} reset`, duration: 3000 });
            }}
          >
            <RotateCcw size={13} strokeWidth={1.75} />
            <span>Reset</span>
          </ConfirmButton>
        </Row>
        <Row title="Delete account" desc="Permanently remove this account and everything in it.">
          <ConfirmButton
            danger
            confirmLabel="Delete for good?"
            onConfirm={() => {
              removeAccount(account.id);
              pushToast({ kind: "info", title: `${account.name} deleted`, duration: 3000 });
            }}
          >
            <Trash2 size={13} strokeWidth={1.75} />
            <span>Delete</span>
          </ConfirmButton>
        </Row>
      </div>
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="dangerRow">
      <div className="dangerRow__text">
        <div className="dangerRow__title">{title}</div>
        <div className="dangerRow__desc">{desc}</div>
      </div>
      <div className="dangerRow__action">{children}</div>
    </div>
  );
}
