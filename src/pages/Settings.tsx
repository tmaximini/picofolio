import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Link2Off,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/layout";
import { Button } from "@/components/primitives";
import { AccountFormModal } from "@/components/ui";
import type { Account } from "@/lib/mock";
import type { IbkrConnection, IbkrStatus } from "@/store/index";
import {
  useAccounts,
  useAddIbkrConnection,
  useClearDemoPortfolio,
  useClearDemoTrades,
  useDemoCounts,
  useIbkrConnections,
  useImportIbkrXml,
  usePortfolioDemoCounts,
  usePushToast,
  useRemoveIbkrConnection,
  useResyncIbkrConnection,
  useRestoreDemoPortfolio,
  useRestoreDemoTrades,
  useSyncIbkrConnection,
  useUpdateAccount,
  useUpdateIbkrConnection,
} from "@/store/selectors";

export function Settings() {
  const accounts = useAccounts();
  const [showGuide, setShowGuide] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Topbar title="Settings" subtitle="Accounts · IBKR sync · Imports" />

      <div className="settingsStack">
        <section className="settingsCard">
          <div className="settingsCard__head">
            <div>
              <h2 className="settingsCard__title">Accounts &amp; IBKR sync</h2>
              <div className="settingsCard__sub">
                Each account has its own IBKR Flex Query connection — one
                connection feeds one account. Rename an account inline; synced
                trades are stamped to it. Tokens never leave this browser.
                <br />
                <button
                  type="button"
                  className="ibkrHelp__toggle"
                  onClick={() => setShowGuide((v) => !v)}
                >
                  {showGuide ? (
                    <ChevronDown size={12} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={12} strokeWidth={2} />
                  )}
                  {showGuide ? "Hide setup guide" : "How do I get a Flex token?"}
                </button>
              </div>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={13} strokeWidth={1.75} />
              <span>Add account</span>
            </Button>
          </div>

          {showGuide && <IbkrSetupGuide />}

          <div className="ibkrConnList">
            {accounts.map((a) => (
              <AccountSyncCard key={a.id} account={a} onEdit={setEditAccountId} />
            ))}
          </div>
        </section>

        <OrphanConnections />

        <PasteXmlCard />

        <DemoDataCard />
      </div>

      {createOpen && <AccountFormModal onClose={() => setCreateOpen(false)} />}
      {editAccountId && (
        <AccountFormModal
          accountId={editAccountId}
          onClose={() => setEditAccountId(null)}
        />
      )}
    </>
  );
}

// ---------- account card with its IBKR sync ----------

function AccountSyncCard({
  account,
  onEdit,
}: {
  account: Account;
  onEdit: (id: string) => void;
}) {
  const connections = useIbkrConnections();
  const accounts = useAccounts();
  const updateAccount = useUpdateAccount();
  const addConnection = useAddIbkrConnection();
  const updateConnection = useUpdateIbkrConnection();
  const pushToast = usePushToast();

  const conn = connections.find((c) => c.id === account.flexConnectionId) ?? null;
  // Connections not feeding any account — offered for linking here.
  const orphans = connections.filter(
    (c) => !accounts.some((a) => a.flexConnectionId === c.id),
  );

  const [nameDraft, setNameDraft] = useState(account.name);

  const onNameBlur = () => {
    const t = nameDraft.trim();
    if (!t) {
      setNameDraft(account.name);
      return;
    }
    if (t !== account.name) {
      updateAccount(account.id, { name: t });
      // Keep the linked connection's label in step with the account name.
      if (conn) updateConnection(conn.id, { label: t });
      pushToast({ kind: "info", title: `Renamed to "${t}"`, duration: 2000 });
    }
  };

  const onConnect = (val: string) => {
    if (val === "__new__") {
      const id = addConnection(account.name);
      updateAccount(account.id, { flexConnectionId: id });
      pushToast({ kind: "info", title: `Connection added to ${account.name}`, duration: 2500 });
    } else if (val) {
      updateAccount(account.id, { flexConnectionId: val });
      updateConnection(val, { label: account.name });
    }
  };

  const onUnlink = () => {
    updateAccount(account.id, { flexConnectionId: undefined });
    pushToast({ kind: "info", title: `${account.name} unlinked from IBKR`, duration: 2500 });
  };

  return (
    <div className="ibkrConn">
      <div className="ibkrConn__head">
        <label className="ibkrConn__labelWrap" title="Click to rename">
          <span
            className="acctSwitcher__dot"
            style={{ background: account.color }}
            aria-hidden
          />
          <input
            className="ibkrConn__label"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={onNameBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              else if (e.key === "Escape") {
                setNameDraft(account.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
            spellCheck={false}
          />
          <Pencil size={11} strokeWidth={1.75} className="ibkrConn__labelIcon" />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            className="btn"
            onClick={() => onEdit(account.id)}
            title="Color, contributions, delete"
          >
            <Pencil size={12} strokeWidth={1.75} />
            <span>Edit</span>
          </button>
          {conn && <StatusBadge status={conn.status} />}
        </div>
      </div>

      {conn ? (
        <ConnectionControls connection={conn} onUnlink={onUnlink} />
      ) : (
        <div className="ibkrConnectRow">
          <div className="tradeForm__field" style={{ flex: 1 }}>
            <label className="tradeForm__label">IBKR connection</label>
            <select
              className="tradeForm__select"
              value=""
              onChange={(e) => onConnect(e.target.value)}
            >
              <option value="">Not connected — manual only</option>
              {orphans.map((c) => (
                <option key={c.id} value={c.id}>
                  Link existing: {c.label}
                </option>
              ))}
              <option value="__new__">+ New connection…</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- the token/queryId/sync controls for a linked connection ----------

function ConnectionControls({
  connection,
  onUnlink,
}: {
  connection: IbkrConnection;
  onUnlink: () => void;
}) {
  const update = useUpdateIbkrConnection();
  const remove = useRemoveIbkrConnection();
  const sync = useSyncIbkrConnection();
  const resync = useResyncIbkrConnection();
  const pushToast = usePushToast();

  const [showToken, setShowToken] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(connection.token);
  const [queryIdDraft, setQueryIdDraft] = useState(connection.queryId);

  const isSyncing =
    connection.status === "sending" ||
    connection.status === "polling" ||
    connection.status === "parsing";

  const credsDirty =
    tokenDraft !== connection.token || queryIdDraft !== connection.queryId;

  const lastSyncLabel = useMemo(() => {
    if (!connection.lastSyncAt) return "Never";
    return new Date(connection.lastSyncAt).toLocaleString();
  }, [connection.lastSyncAt]);

  const onSaveCreds = () => {
    update(connection.id, { token: tokenDraft, queryId: queryIdDraft });
    pushToast({ kind: "success", title: "Credentials saved", duration: 3000 });
  };

  const onResync = () => {
    if (
      !confirm(
        `Delete all imported trades for this account and re-sync from IBKR? The token and Query ID stay.`,
      )
    ) {
      return;
    }
    resync(connection.id);
  };

  const onRemove = () => {
    if (!confirm(`Remove this IBKR connection? Imported trades stay where they are.`)) {
      return;
    }
    remove(connection.id);
    pushToast({ kind: "info", title: "Connection removed", duration: 3000 });
  };

  return (
    <>
      <div className="ibkrGrid">
        <div className="tradeForm__field">
          <label className="tradeForm__label">Flex Token</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: "var(--space-2)" }}>
            <input
              className="tradeForm__input num"
              type={showToken ? "text" : "password"}
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder="123456789012345678901"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => setShowToken((v) => !v)}
              title={showToken ? "Hide" : "Show"}
            >
              {showToken ? (
                <EyeOff size={13} strokeWidth={1.75} />
              ) : (
                <Eye size={13} strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
        <div className="tradeForm__field">
          <label className="tradeForm__label">Query ID</label>
          <input
            className="tradeForm__input num"
            value={queryIdDraft}
            onChange={(e) => setQueryIdDraft(e.target.value)}
            placeholder="123456"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="ibkrActions">
        <Button onClick={onSaveCreds} disabled={!credsDirty}>
          Save
        </Button>
        <Button
          onClick={() => sync(connection.id)}
          disabled={isSyncing || !connection.token || !connection.queryId}
          style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}
        >
          <RefreshCw size={13} strokeWidth={1.75} className={isSyncing ? "spin" : undefined} />
          <span>{isSyncing ? "Syncing…" : "Sync now"}</span>
        </Button>
        <Button
          onClick={onResync}
          disabled={isSyncing || !connection.token || !connection.queryId}
          title="Delete this account's imported trades and pull fresh"
        >
          <RotateCcw size={13} strokeWidth={1.75} />
          <span>Delete &amp; resync</span>
        </Button>
        <Button onClick={onUnlink} title="Detach this connection from the account">
          <Link2Off size={13} strokeWidth={1.75} />
          <span>Unlink</span>
        </Button>
        <Button onClick={onRemove} className="btn--danger">
          <Trash2 size={13} strokeWidth={1.75} />
          <span>Remove</span>
        </Button>
        <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)", marginLeft: "auto" }}>
          Last sync: <span className="num">{lastSyncLabel}</span>
        </span>
      </div>

      {connection.error && (
        <div className="ibkrWarnings" style={{ marginTop: "var(--space-4)" }}>
          <div className="ibkrWarnings__title">Sync failed</div>
          <div>{connection.error}</div>
        </div>
      )}

      {connection.lastSummary && (
        <>
          <div className="ibkrSummary">
            <div className="ibkrSummary__cell">
              <span className="ibkrSummary__label">Added</span>
              <span className="ibkrSummary__value">{connection.lastSummary.added}</span>
            </div>
            <div className="ibkrSummary__cell">
              <span className="ibkrSummary__label">Skipped (dupes)</span>
              <span className="ibkrSummary__value">{connection.lastSummary.skipped}</span>
            </div>
            <div className="ibkrSummary__cell">
              <span className="ibkrSummary__label">IBKR account</span>
              <span className="ibkrSummary__value">
                {connection.lastSummary.accountIds.length > 0
                  ? connection.lastSummary.accountIds.join(", ")
                  : "—"}
              </span>
            </div>
          </div>
          {connection.lastSummary.warnings.length > 0 && (
            <div className="ibkrWarnings">
              <div className="ibkrWarnings__title">
                {connection.lastSummary.warnings.length} warning(s)
              </div>
              <ul>
                {connection.lastSummary.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------- orphan connections (linked to no account) ----------

function OrphanConnections() {
  const connections = useIbkrConnections();
  const accounts = useAccounts();
  const remove = useRemoveIbkrConnection();
  const pushToast = usePushToast();

  const orphans = connections.filter(
    (c) => !accounts.some((a) => a.flexConnectionId === c.id),
  );
  if (orphans.length === 0) return null;

  return (
    <section className="settingsCard">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Unlinked connections</h2>
          <div className="settingsCard__sub">
            These IBKR connections aren't feeding any account yet. Link one from
            an account above, or remove it.
          </div>
        </div>
      </div>
      <div className="ibkrConnList">
        {orphans.map((c) => (
          <div key={c.id} className="ibkrConn" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="ibkrConn__label" style={{ fontWeight: 500 }}>{c.label}</span>
            <Button
              className="btn--danger"
              onClick={() => {
                remove(c.id);
                pushToast({ kind: "info", title: `${c.label} removed`, duration: 2500 });
              }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
              <span>Remove</span>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- paste raw Flex XML ----------

function PasteXmlCard() {
  const importXml = useImportIbkrXml();
  const pushToast = usePushToast();
  const [xmlDraft, setXmlDraft] = useState("");
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlOk, setXmlOk] = useState<{ added: number; skipped: number } | null>(null);

  const onImportXml = () => {
    setXmlError(null);
    setXmlOk(null);
    try {
      const summary = importXml(xmlDraft);
      setXmlOk({ added: summary.added, skipped: summary.skipped });
      setXmlDraft("");
      pushToast({
        kind: summary.added > 0 ? "success" : "info",
        title:
          summary.added > 0
            ? `Imported ${summary.added} trade${summary.added === 1 ? "" : "s"}`
            : "Nothing new to import",
        body: summary.skipped > 0 ? `Skipped ${summary.skipped} already-imported.` : undefined,
        duration: 5000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setXmlError(msg);
      pushToast({ kind: "error", title: "XML parse failed", body: msg });
    }
  };

  return (
    <section className="settingsCard">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Or paste Flex XML</h2>
          <div className="settingsCard__sub">
            Generate the Flex statement manually in Client Portal and paste the
            raw XML here. Bypasses the network entirely. Trades bucket into an
            account named after their IBKR account id.
          </div>
        </div>
      </div>
      <textarea
        className="ibkrFallback__textarea"
        value={xmlDraft}
        onChange={(e) => setXmlDraft(e.target.value)}
        placeholder="<FlexQueryResponse ...>"
        spellCheck={false}
      />
      <div className="ibkrActions" style={{ marginTop: "var(--space-3)" }}>
        <Button onClick={onImportXml} disabled={!xmlDraft.trim()}>
          Import XML
        </Button>
        {xmlOk && (
          <span className="ibkrStatusBadge ibkrStatusBadge--ok">
            Imported {xmlOk.added} · skipped {xmlOk.skipped}
          </span>
        )}
        {xmlError && (
          <span className="ibkrStatusBadge ibkrStatusBadge--error">{xmlError}</span>
        )}
      </div>
    </section>
  );
}

function DemoDataCard() {
  const { demo: demoTrades, real: realTrades } = useDemoCounts();
  const { demoAccounts, realAccounts, demoHoldings, realHoldings } =
    usePortfolioDemoCounts();
  const clearDemoTrades = useClearDemoTrades();
  const restoreDemoTrades = useRestoreDemoTrades();
  const clearDemoPortfolio = useClearDemoPortfolio();
  const restoreDemoPortfolio = useRestoreDemoPortfolio();
  const pushToast = usePushToast();

  const handleClearTrades = () => {
    const n = demoTrades;
    clearDemoTrades();
    pushToast({ kind: "info", title: `Cleared ${n} demo trade${n === 1 ? "" : "s"}`, duration: 3000 });
  };
  const handleRestoreTrades = () => {
    restoreDemoTrades();
    pushToast({ kind: "success", title: "Demo trades restored", duration: 3000 });
  };
  const handleClearPortfolio = () => {
    clearDemoPortfolio();
    pushToast({ kind: "info", title: "Demo portfolio cleared", duration: 3000 });
  };
  const handleRestorePortfolio = () => {
    restoreDemoPortfolio();
    pushToast({ kind: "success", title: "Demo portfolio restored", duration: 3000 });
  };

  return (
    <section className="settingsCard">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Demo data</h2>
          <div className="settingsCard__sub">
            Picofolio ships with seeded trades and a sample portfolio so the UI
            has something to render before you connect anything. Each section is
            cleared automatically the first time real data lands — you can also
            clear or restore them by hand here.
          </div>
        </div>
      </div>

      <div className="demoDataGroup">
        <div className="demoDataGroup__head">
          <span className="demoDataGroup__title">Trades</span>
          <span className="demoDataGroup__counts">
            <span className="demoDataGroup__count">
              <em>{demoTrades}</em> demo
            </span>
            <span className="demoDataGroup__sep">·</span>
            <span className="demoDataGroup__count">
              <em>{realTrades}</em> real
            </span>
          </span>
        </div>
        <div className="ibkrActions">
          <Button onClick={handleClearTrades} disabled={demoTrades === 0}>
            <Trash2 size={13} strokeWidth={1.75} />
            <span>Clear demo trades</span>
          </Button>
          <Button onClick={handleRestoreTrades}>
            <RotateCcw size={13} strokeWidth={1.75} />
            <span>Restore demo trades</span>
          </Button>
        </div>
      </div>

      <div className="demoDataGroup">
        <div className="demoDataGroup__head">
          <span className="demoDataGroup__title">Portfolio</span>
          <span className="demoDataGroup__counts">
            <span className="demoDataGroup__count">
              <em>{demoAccounts}</em>/<em>{demoHoldings}</em> demo
              <span className="demoDataGroup__hint"> (accounts / holdings)</span>
            </span>
            <span className="demoDataGroup__sep">·</span>
            <span className="demoDataGroup__count">
              <em>{realAccounts}</em>/<em>{realHoldings}</em> real
            </span>
          </span>
        </div>
        <div className="ibkrActions">
          <Button
            onClick={handleClearPortfolio}
            disabled={demoAccounts === 0 && demoHoldings === 0}
          >
            <Trash2 size={13} strokeWidth={1.75} />
            <span>Clear demo portfolio</span>
          </Button>
          <Button onClick={handleRestorePortfolio}>
            <RotateCcw size={13} strokeWidth={1.75} />
            <span>Restore demo portfolio</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

function IbkrSetupGuide() {
  return (
    <ol className="ibkrHelp">
      <Step n={1} title="Sign in to Client Portal">
        Open{" "}
        <a
          href="https://www.interactivebrokers.com/sso/Login"
          target="_blank"
          rel="noopener noreferrer"
        >
          interactivebrokers.com/sso/Login
        </a>
        . For a <strong>paper account</strong>, log in with your paper
        credentials. Paper accounts work identically with Flex; their IDs start
        with <code>DU</code> instead of <code>U</code>.
      </Step>
      <Step n={2} title="Open the Flex Queries page">
        Menu → <strong>Performance &amp; Reports</strong> →{" "}
        <strong>Flex Queries</strong>.
      </Step>
      <Step n={3} title="Enable the Flex Web Service + generate a token">
        In the <strong>Flex Web Service Configuration</strong> panel, set Status
        to <strong>Enabled</strong>, save, then <strong>Generate token</strong>.
        Copy the long alphanumeric string — that's your <strong>Flex Token</strong>.
      </Step>
      <Step n={4} title="Create an Activity Flex Query">
        Create an <strong>Activity Flex Query</strong>, Format{" "}
        <strong>XML</strong>, Period <strong>Last 365 Calendar Days</strong>.
        Tick these sections:
        <ul>
          <li>
            <strong>Trades</strong> — drives the Activity journal.
          </li>
          <li>
            <strong>Open Positions</strong> — required for Holdings &amp;
            account value. Without it the account shows $0.
          </li>
          <li>
            <strong>Cash Report</strong> — adds your cash balance to account
            value.
          </li>
        </ul>
        Defaults for date/time format are what the parser expects.
      </Step>
      <Step n={5} title="Find the Query ID, paste, sync">
        Your query has a numeric <strong>Query ID</strong>. Paste the token +
        Query ID into the account's connection below, Save, then{" "}
        <strong>Sync now</strong>.
      </Step>
    </ol>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="ibkrHelp__step">
      <span className="ibkrHelp__num">{n}</span>
      <div>
        <div className="ibkrHelp__title">{title}</div>
        <div className="ibkrHelp__body">{children}</div>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: IbkrStatus }) {
  const label =
    status === "sending"
      ? "Requesting"
      : status === "polling"
        ? "Polling"
        : status === "parsing"
          ? "Parsing"
          : status === "error"
            ? "Error"
            : "Idle";
  return <span className={`ibkrStatusBadge ibkrStatusBadge--${status}`}>{label}</span>;
}
