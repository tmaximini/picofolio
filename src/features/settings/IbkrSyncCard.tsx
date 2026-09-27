import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Link2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/primitives";
import { formatRelativeTime } from "@/lib/dateRange";
import type { Account } from "@/lib/mock";
import type { IbkrConnection } from "@/store/index";
import { formatMoneyDelta } from "@/lib/money";
import {
  useAccountCashFlows,
  useAccounts,
  useAddIbkrConnection,
  useClearNonIbkrForAccount,
  useHoldings,
  useTrades,
  useIbkrConnections,
  usePushToast,
  useSyncIbkrConnection,
  useUpdateAccount,
  useUpdateIbkrConnection,
} from "@/store/selectors";
import { AccountXmlImport } from "./AccountXmlImport";
import { IbkrSetupGuide, SECTION_PURPOSE } from "./IbkrSetupGuide";
import type { FlexSectionLabel } from "@/lib/ibkr/flexParser";

/**
 * The account's Interactive Brokers link: status up top with the one primary
 * action (Sync now), credentials below, the last pull summarised in a line.
 * Destructive actions (re-import, disconnect) live in the Danger zone.
 */
export function IbkrSyncCard({ account }: { account: Account }) {
  const connections = useIbkrConnections();
  const conn = connections.find((c) => c.id === account.flexConnectionId) ?? null;
  // A connection that has never pulled and has no token yet needs the guide;
  // so does anyone arriving from a "How to fix" link (?guide=open).
  const [params] = useSearchParams();
  const fresh = conn != null && !conn.lastSyncAt && !conn.token;
  const [guideOpen, setGuideOpen] = useState(fresh || params.get("guide") === "open");
  const guideRef = useRef<HTMLDetailsElement | null>(null);

  const showGuide = () => {
    setGuideOpen(true);
    requestAnimationFrame(() => guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  useEffect(() => {
    if (params.get("guide") === "open") showGuide();
    // Only on arrival — the link is a one-shot.
  }, []);

  return (
    <section className="settingsCard">
      {conn ? (
        <Connected account={account} connection={conn} onShowGuide={showGuide} />
      ) : (
        <NotConnected account={account} />
      )}
      <div className="disclosures">
        <Disclosure
          label="Setup guide — token, query and the six sections"
          open={guideOpen}
          onToggle={setGuideOpen}
          detailsRef={guideRef}
        >
          <IbkrSetupGuide />
        </Disclosure>
        <Disclosure label="Import a Flex XML file instead">
          <AccountXmlImport accountId={account.id} accountName={account.name} />
        </Disclosure>
      </div>
    </section>
  );
}

function Connected({
  account,
  connection,
  onShowGuide,
}: {
  account: Account;
  connection: IbkrConnection;
  onShowGuide: () => void;
}) {
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

      {summary?.missingSections && summary.missingSections.length > 0 && (
        <div className="syncMissing">
          <div className="syncMissing__title">
            Your Flex query is missing {summary.missingSections.length === 1 ? "a section" : `${summary.missingSections.length} sections`}
          </div>
          <ul>
            {summary.missingSections.map((label) => (
              <li key={label}>
                <strong>{label}</strong> — {SECTION_PURPOSE[label as FlexSectionLabel] ?? ""}
              </li>
            ))}
          </ul>
          <p>
            In IBKR Client Portal: <strong>Performance &amp; Reports → Flex Queries</strong>, click the
            pencil next to your query, tick {summary.missingSections.length === 1 ? "it" : "them"}, save,
            then sync again.{" "}
            <button type="button" className="linkBtn" onClick={onShowGuide}>
              Full setup guide
            </button>
          </p>
        </div>
      )}

      <CashFlowList account={account} />

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

/**
 * Every deposit, withdrawal and transfer Picofolio takes out of the returns —
 * so a number that disagrees with IBKR can be checked line by line.
 */
function CashFlowList({ account }: { account: Account }) {
  const flows = useAccountCashFlows(account.id);
  if (!flows) return null;
  const base = account.baseCurrency ?? "USD";
  const net = flows.reduce((a, f) => a + f.valueCents, 0);
  return (
    <details className="syncWarnings">
      <summary>
        {flows.length === 0
          ? "No deposits, withdrawals or transfers in the statement"
          : `${flows.length} deposit${flows.length === 1 ? "" : "s"}, withdrawal${flows.length === 1 ? "" : "s"} & transfers taken out of returns · net ${formatMoneyDelta(net, base)}`}
        {flows.length > 0 && <span className="syncWarnings__more">Details</span>}
      </summary>
      {flows.length > 0 && (
        <>
          <p className="syncWarnings__why">
            Returns are time-weighted: these amounts don't count as gains or losses. If one
            is missing or appears twice compared with IBKR's statement, the returns will be off.
          </p>
          <table className="flowTable">
            <tbody>
              {[...flows].reverse().map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.time}</td>
                  <td>{f.kind === "transfer" ? "Transfer" : f.valueCents >= 0 ? "Deposit" : "Withdrawal"}</td>
                  <td className="flowTable__note">{f.note ?? ""}</td>
                  <td className={f.valueCents >= 0 ? "num flowTable__in" : "num flowTable__out"}>
                    {formatMoneyDelta(f.valueCents, base)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </details>
  );
}

function NotConnected({ account }: { account: Account }) {
  const connections = useIbkrConnections();
  const accounts = useAccounts();
  const trades = useTrades();
  const holdings = useHoldings();
  const addConnection = useAddIbkrConnection();
  const updateAccount = useUpdateAccount();
  const updateConnection = useUpdateIbkrConnection();
  const clearNonIbkr = useClearNonIbkrForAccount();
  const pushToast = usePushToast();
  // Connections not feeding any account can be re-linked here.
  const orphans = connections.filter((c) => !accounts.some((a) => a.flexConnectionId === c.id));
  // What's already in the account that didn't come from IBKR. Left in place,
  // it mixes with the synced trades (sample trades turning up in review…).
  const count = (src: "demo" | "manual") => ({
    trades: trades.filter((t) => t.accountId === account.id && (t.source ?? "manual") === src).length,
    positions: holdings.filter((h) => h.accountId === account.id && (h.source ?? "manual") === src).length,
  });
  const demo = count("demo");
  const manual = count("manual");
  const existing = demo.trades + demo.positions + manual.trades + manual.positions;
  // "new" = create a connection; otherwise the id of one to link.
  const [pending, setPending] = useState<string | null>(null);

  const connect = (target: string, clear: boolean) => {
    if (clear) clearNonIbkr(account.id);
    if (target === "new") {
      updateAccount(account.id, { flexConnectionId: addConnection(account.name) });
    } else {
      updateAccount(account.id, { flexConnectionId: target });
      updateConnection(target, { label: account.name });
    }
    setPending(null);
    if (clear) pushToast({ kind: "info", title: `Cleared existing data from ${account.name}`, duration: 3000 });
  };
  const start = (target: string) => (existing > 0 ? setPending(target) : connect(target, false));

  const describe = (c: { trades: number; positions: number }, kind: string) =>
    [
      c.trades ? `${c.trades} ${kind} trade${c.trades === 1 ? "" : "s"}` : "",
      c.positions ? `${c.positions} ${kind} position${c.positions === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
  const parts = [...describe(demo, "sample"), ...describe(manual, "hand-entered")];

  return (
    <>
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Interactive Brokers sync</h2>
          <div className="settingsCard__sub">
            Not connected — {account.name} is kept by hand. Connect a Flex Query to pull
            trades, positions, cash and daily account value automatically. Read-only:
            Picofolio can't trade or move money.
          </div>
        </div>
        {!pending && (
          <div className="ibkrActions">
            {orphans.length > 0 && (
              <select
                className="tradeForm__select"
                value=""
                aria-label="Link an existing connection"
                onChange={(e) => e.target.value && start(e.target.value)}
              >
                <option value="">Link existing…</option>
                {orphans.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <Button variant="primary" onClick={() => start("new")}>
              {orphans.length > 0 ? <Plus size={13} strokeWidth={1.75} /> : <Link2 size={13} strokeWidth={1.75} />}
              <span>Connect IBKR</span>
            </Button>
          </div>
        )}
      </div>

      {pending && (
        <div className="connectClean" role="dialog" aria-label="Existing data">
          <div className="connectClean__title">Start {account.name} clean?</div>
          <p>
            It already holds {parts.join(", ")}. Once connected, IBKR adds its own trades and
            positions — anything left from before would mix in with them. Sample data is
            removed on the first sync either way.
          </p>
          <div className="ibkrActions">
            <Button variant="primary" onClick={() => connect(pending, true)}>
              Clear and connect
            </Button>
            <Button onClick={() => connect(pending, false)}>Keep and connect</Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
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
  open,
  onToggle,
  detailsRef,
  children,
}: {
  label: string;
  /** Controlled open state; omit for a plain uncontrolled disclosure. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  detailsRef?: React.Ref<HTMLDetailsElement>;
  children: ReactNode;
}) {
  return (
    <details
      className="disclosure"
      ref={detailsRef}
      open={open}
      onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{label}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}
