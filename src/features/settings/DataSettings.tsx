import { RotateCcw, Trash2 } from "lucide-react";
import { Button, ConfirmButton } from "@/components/primitives";
import {
  useAccounts,
  useClearAllData,
  useIbkrConnections,
  usePushToast,
  useRemoveIbkrConnection,
  useRestoreDemoPortfolio,
  useRestoreDemoTrades,
} from "@/store/selectors";

/** App-wide data: demo seed, stray connections, and the full local wipe. */
export function DataSettings() {
  const restorePortfolio = useRestoreDemoPortfolio();
  const restoreTrades = useRestoreDemoTrades();
  const clearAll = useClearAllData();
  const pushToast = usePushToast();

  return (
    <>
      <section className="settingsCard">
        <div className="settingsCard__head">
          <div>
            <h2 className="settingsCard__title">Demo data</h2>
            <div className="settingsCard__sub">
              Bring back the bundled sample accounts and journal to explore the app.
              Never touches your real or imported data. Clear a single account's
              sample data from that account's page.
            </div>
          </div>
        </div>
        <div className="ibkrActions">
          <Button
            onClick={() => {
              restorePortfolio();
              pushToast({ kind: "success", title: "Demo portfolio restored", duration: 3000 });
            }}
          >
            <RotateCcw size={13} strokeWidth={1.75} />
            <span>Restore sample accounts</span>
          </Button>
          <Button
            onClick={() => {
              restoreTrades();
              pushToast({ kind: "success", title: "Demo trades restored", duration: 3000 });
            }}
          >
            <RotateCcw size={13} strokeWidth={1.75} />
            <span>Restore sample trades</span>
          </Button>
        </div>
      </section>

      <UnlinkedConnections />

      <section className="settingsCard dangerZone">
        <div className="dangerRow" style={{ borderTop: 0, padding: 0 }}>
          <div className="dangerRow__text">
            <div className="dangerRow__title">Clear all local data</div>
            <div className="dangerRow__desc">
              Erase every account, trade, note, IBKR connection, token and setting on
              this device and start over from the welcome page. This can't be undone.
            </div>
          </div>
          <div className="dangerRow__action">
            <ConfirmButton danger confirmLabel="Erase everything?" onConfirm={clearAll}>
              <Trash2 size={13} strokeWidth={1.75} />
              <span>Clear all data</span>
            </ConfirmButton>
          </div>
        </div>
      </section>
    </>
  );
}

/** Connections that feed no account (left over from older builds or unlinks). */
function UnlinkedConnections() {
  const connections = useIbkrConnections();
  const accounts = useAccounts();
  const remove = useRemoveIbkrConnection();
  const pushToast = usePushToast();
  const orphans = connections.filter((c) => !accounts.some((a) => a.flexConnectionId === c.id));
  if (orphans.length === 0) return null;

  return (
    <section className="settingsCard">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Unlinked IBKR connections</h2>
          <div className="settingsCard__sub">
            Saved credentials that don't feed any account. Link one from an account's
            page, or remove it.
          </div>
        </div>
      </div>
      <div className="dangerZone__rows">
        {orphans.map((c) => (
          <div className="dangerRow" key={c.id}>
            <div className="dangerRow__text">
              <div className="dangerRow__title">{c.label}</div>
            </div>
            <div className="dangerRow__action">
              <ConfirmButton
                confirmLabel="Remove?"
                onConfirm={() => {
                  remove(c.id);
                  pushToast({ kind: "info", title: `${c.label} removed`, duration: 2500 });
                }}
              >
                <Trash2 size={13} strokeWidth={1.75} />
                <span>Remove</span>
              </ConfirmButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
