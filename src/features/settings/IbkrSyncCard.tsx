import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff, Link2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/primitives";
import { formatRelativeTime } from "@/lib/dateRange";
import type { Account } from "@/lib/mock";
import type { IbkrConnection } from "@/store/index";
import {
  useAccounts,
  useAddIbkrConnection,
  useIbkrConnections,
  usePushToast,
  useSyncIbkrConnection,
  useUpdateAccount,
  useUpdateIbkrConnection,
} from "@/store/selectors";
import { AccountXmlImport } from "./AccountXmlImport";
import { IbkrSetupGuide } from "./IbkrSetupGuide";

/**
 * The account's Interactive Brokers link: status up top with the one primary
 * action (Sync now), credentials below, the last pull summarised in a line.
 * Destructive actions (re-import, disconnect) live in the Danger zone.
 */
export function IbkrSyncCard({ account }: { account: Account }) {
  const connections = useIbkrConnections();
  const conn = connections.find((c) => c.id === account.flexConnectionId) ?? null;
  // A connection that has never pulled and has no token yet needs the guide.
  const fresh = conn != null && !conn.lastSyncAt && !conn.token;

  return (
    <section className="settingsCard">
      {conn ? <Connected account={account} connection={conn} /> : <NotConnected account={account} />}
      <div className="disclosures">
        <Disclosure label="Setup guide — getting a Flex token and Query ID" defaultOpen={fresh}>
          <IbkrSetupGuide />
        </Disclosure>
        <Disclosure label="Import a Flex XML file instead">
          <AccountXmlImport accountId={account.id} accountName={account.name} />
        </Disclosure>
      </div>
    </section>
  );
}

function Connected({ account, connection }: { account: Account; connection: IbkrConnection }) {
  const update = useUpdateIbkrConnection();
  const sync = useSyncIbkrConnection();
  const pushToast = usePushToast();
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState(connection.token);
  const [queryId, setQueryId] = useState(connection.queryId);

  // Follow the store if the connection changes underneath (another tab, a
  // rename) while there are no local edits.
  useEffect(() => {
    setToken(connection.token);
    setQueryId(connection.queryId);
  }, [connection.token, connection.queryId]);

  const dirty = token.trim() !== connection.token || queryId.trim() !== connection.queryId;
  const syncing = ["sending", "polling", "parsing"].includes(connection.status);
  const canSync = Boolean(token.trim() && queryId.trim()) && !syncing;

  const save = () => update(connection.id, { token: token.trim(), queryId: queryId.trim() });

  const onSync = () => {
    // Syncing with unsaved edits would silently use the old credentials.
    if (dirty) save();
    void sync(connection.id);
  };

  const summary = connection.lastSummary;
  const warnings = summary?.warnings ?? [];
  const allSkips = warnings.length > 0 && warnings.every((w) => /skipped/i.test(w));

  return (
    <>
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Interactive Brokers sync</h2>
          <SyncStatus connection={connection} />
        </div>
        <Button variant="primary" onClick={onSync} disabled={!canSync}>
          <RefreshCw size={13} strokeWidth={1.75} className={syncing ? "spin" : undefined} />
          <span>{syncing ? "Syncing…" : dirty ? "Save & sync" : "Sync now"}</span>
        </Button>
      </div>

      {connection.status === "error" && connection.error && (
        <div className="syncError" role="alert">
          {connection.error}
        </div>
      )}

      <div className="ibkrGrid">
        <div className="tradeForm__field">
          <label className="tradeForm__label" htmlFor={`tok-${account.id}`}>
            Flex token
          </label>
          <div className="secretField">
            <input
              id={`tok-${account.id}`}
              className="tradeForm__input num"
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789012345678901"
              // Keep API tokens out of browser password managers.
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? "Hide token" : "Show token"}
              title={showToken ? "Hide" : "Show"}
            >
              {showToken ? <EyeOff size={13} strokeWidth={1.75} /> : <Eye size={13} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
        <div className="tradeForm__field">
          <label className="tradeForm__label" htmlFor={`qid-${account.id}`}>
            Query ID
          </label>
          <input
            id={`qid-${account.id}`}
            className="tradeForm__input num"
            value={queryId}
            onChange={(e) => setQueryId(e.target.value)}
            placeholder="123456"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {dirty && (
        <div className="unsavedBar">
          <span>Unsaved changes</span>
          <Button variant="ghost" size="sm" onClick={() => {
            setToken(connection.token);
            setQueryId(connection.queryId);
          }}>
            Discard
          </Button>
          <Button size="sm" onClick={() => {
            save();
            pushToast({ kind: "success", title: "IBKR credentials saved", duration: 2500 });
          }}>
            Save
          </Button>
        </div>
      )}

      {summary && (
        <p className="syncResult">
          <span className="syncResult__label">Last pull</span>
          <span>
            <strong className="num">{summary.added}</strong> new trade{summary.added === 1 ? "" : "s"}
          </span>
          <span>
            <strong className="num">{summary.skipped}</strong> already imported
          </span>
          {summary.accountIds.length > 0 && (
            <span>
              IBKR account <strong className="mono">{summary.accountIds.join(", ")}</strong>
            </span>
          )}
        </p>
      )}

      {warnings.length > 0 && (
        <details className="syncWarnings">
          <summary>
            {allSkips
              ? `${warnings.length} row${warnings.length === 1 ? "" : "s"} skipped during the last pull`
              : `${warnings.length} import warning${warnings.length === 1 ? "" : "s"}`}
            <span className="syncWarnings__more">Details</span>
          </summary>
          <p className="syncWarnings__why">
            IBKR sent these rows in a shape Picofolio can't use — usually cancelled
            fills or corporate actions without a trade price. They're left out of the
            journal; positions and cash come from their own statement sections and
            aren't affected.
          </p>
          <ul>
            {warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {warnings.length > 20 && <li>…and {warnings.length - 20} more</li>}
          </ul>
        </details>
      )}
    </>
  );
}

function NotConnected({ account }: { account: Account }) {
  const connections = useIbkrConnections();
  const accounts = useAccounts();
  const addConnection = useAddIbkrConnection();
  const updateAccount = useUpdateAccount();
  const updateConnection = useUpdateIbkrConnection();
  // Connections not feeding any account can be re-linked here.
  const orphans = connections.filter((c) => !accounts.some((a) => a.flexConnectionId === c.id));

  return (
    <div className="settingsCard__head">
      <div>
        <h2 className="settingsCard__title">Interactive Brokers sync</h2>
        <div className="settingsCard__sub">
          Not connected — {account.name} is kept by hand. Connect a Flex Query to pull
          trades, positions, cash and daily account value automatically. Read-only:
          Picofolio can't trade or move money.
        </div>
      </div>
      <div className="ibkrActions">
        {orphans.length > 0 && (
          <select
            className="tradeForm__select"
            value=""
            aria-label="Link an existing connection"
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              updateAccount(account.id, { flexConnectionId: id });
              updateConnection(id, { label: account.name });
            }}
          >
            <option value="">Link existing…</option>
            {orphans.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="primary"
          onClick={() => updateAccount(account.id, { flexConnectionId: addConnection(account.name) })}
        >
          {orphans.length > 0 ? <Plus size={13} strokeWidth={1.75} /> : <Link2 size={13} strokeWidth={1.75} />}
          <span>Connect IBKR</span>
        </Button>
      </div>
    </div>
  );
}

function SyncStatus({ connection }: { connection: IbkrConnection }) {
  const { status, lastSyncAt } = connection;
  let tone: "ok" | "busy" | "error" | "idle" = "idle";
  let text = "Not synced yet";
  if (status === "sending") [tone, text] = ["busy", "Requesting the statement from IBKR…"];
  else if (status === "polling") [tone, text] = ["busy", "Waiting for IBKR to build the statement — can take a minute…"];
  else if (status === "parsing") [tone, text] = ["busy", "Reading the statement…"];
  else if (status === "error") [tone, text] = ["error", lastSyncAt ? `Last sync failed · previous success ${formatRelativeTime(lastSyncAt)}` : "Last sync failed"];
  else if (lastSyncAt) [tone, text] = ["ok", `Synced ${formatRelativeTime(lastSyncAt)}`];
  return (
    <div
      className={`syncStatus syncStatus--${tone}`}
      title={lastSyncAt ? `Last successful sync: ${new Date(lastSyncAt).toLocaleString()}` : undefined}
    >
      <i aria-hidden />
      {text}
    </div>
  );
}

function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="disclosure" open={defaultOpen || undefined}>
      <summary>{label}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}
