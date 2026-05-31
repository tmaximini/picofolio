import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/layout";
import { Button } from "@/components/primitives";
import type { IbkrConnection, IbkrStatus } from "@/store/index";
import {
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
  useUpdateIbkrConnection,
} from "@/store/selectors";

export function Settings() {
  const connections = useIbkrConnections();
  const addConnection = useAddIbkrConnection();
  const importXml = useImportIbkrXml();
  const pushToast = usePushToast();

  const [xmlDraft, setXmlDraft] = useState("");
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlOk, setXmlOk] = useState<{ added: number; skipped: number } | null>(null);
  const [showGuide, setShowGuide] = useState(connections.length === 0);

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
        body:
          summary.skipped > 0
            ? `Skipped ${summary.skipped} already-imported.`
            : undefined,
        duration: 5000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setXmlError(msg);
      pushToast({ kind: "error", title: "XML parse failed", body: msg });
    }
  };

  const onAddConnection = () => {
    // Use a sensible default label based on how many already exist.
    const defaultLabel =
      connections.length === 0
        ? "Paper"
        : connections.length === 1
          ? "Live"
          : `Account ${connections.length + 1}`;
    addConnection(defaultLabel);
    pushToast({
      kind: "info",
      title: `${defaultLabel} connection added`,
      body: "Paste the token + Query ID below.",
      duration: 3500,
    });
  };

  return (
    <>
      <Topbar title="Settings" subtitle="IBKR sync · Imports" />

      <div className="settingsStack">
        <section className="settingsCard">
          <div className="settingsCard__head">
            <div>
              <h2 className="settingsCard__title">IBKR Flex Query connections</h2>
              <div className="settingsCard__sub">
                One connection per IBKR account — paper, live cash, multiple
                live accounts. Each has its own Flex token + Query ID. Imported
                trades segregate by connection label so you can see paper vs
                live separately. Tokens never leave this browser.
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
                  {showGuide ? "Hide setup guide" : "How do I get these?"}
                </button>
              </div>
            </div>
            <Button onClick={onAddConnection}>
              <Plus size={13} strokeWidth={1.75} />
              <span>Add connection</span>
            </Button>
          </div>

          {showGuide && <IbkrSetupGuide />}

          {connections.length === 0 ? (
            <div className="ibkrEmpty">
              No connections yet — click <strong>Add connection</strong> to
              wire up your first IBKR account.
            </div>
          ) : (
            <div className="ibkrConnList">
              {connections.map((c) => (
                <IbkrConnectionCard key={c.id} connection={c} />
              ))}
            </div>
          )}
        </section>

        <section className="settingsCard">
          <div className="settingsCard__head">
            <div>
              <h2 className="settingsCard__title">Or paste Flex XML</h2>
              <div className="settingsCard__sub">
                Generate the Flex statement manually in Client Portal and paste
                the raw XML here. Bypasses the network entirely — handy for a
                first test or when the dev proxy isn't reachable.
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
              <span className="ibkrStatusBadge ibkrStatusBadge--error">
                {xmlError}
              </span>
            )}
          </div>
        </section>

        <DemoDataCard />
      </div>
    </>
  );
}

function IbkrConnectionCard({ connection }: { connection: IbkrConnection }) {
  const update = useUpdateIbkrConnection();
  const remove = useRemoveIbkrConnection();
  const sync = useSyncIbkrConnection();
  const resync = useResyncIbkrConnection();
  const pushToast = usePushToast();

  const [showToken, setShowToken] = useState(false);
  const [labelDraft, setLabelDraft] = useState(connection.label);
  const [tokenDraft, setTokenDraft] = useState(connection.token);
  const [queryIdDraft, setQueryIdDraft] = useState(connection.queryId);

  const isSyncing =
    connection.status === "sending" ||
    connection.status === "polling" ||
    connection.status === "parsing";

  // Label auto-saves on blur so it doesn't need the explicit Save button —
  // Save only commits the credentials (token + queryId).
  const credsDirty =
    tokenDraft !== connection.token || queryIdDraft !== connection.queryId;

  const lastSyncLabel = useMemo(() => {
    if (!connection.lastSyncAt) return "Never";
    return new Date(connection.lastSyncAt).toLocaleString();
  }, [connection.lastSyncAt]);

  const onSaveCreds = () => {
    update(connection.id, { token: tokenDraft, queryId: queryIdDraft });
    pushToast({
      kind: "success",
      title: `${connection.label} credentials saved`,
      duration: 3000,
    });
  };

  const onLabelBlur = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      // Don't allow empty labels — revert to current.
      setLabelDraft(connection.label);
      return;
    }
    if (trimmed !== connection.label) {
      update(connection.id, { label: trimmed });
      pushToast({
        kind: "info",
        title: `Renamed to "${trimmed}"`,
        duration: 2500,
      });
    }
  };

  const onResync = () => {
    if (
      !confirm(
        `Delete all imported trades for "${connection.label}" and re-sync from IBKR? The token and Query ID stay.`,
      )
    ) {
      return;
    }
    resync(connection.id);
  };

  const onRemove = () => {
    if (
      !confirm(
        `Remove the "${connection.label}" connection? Imported trades stay where they are.`,
      )
    ) {
      return;
    }
    remove(connection.id);
    pushToast({
      kind: "info",
      title: `${connection.label} connection removed`,
      duration: 3000,
    });
  };

  return (
    <div className="ibkrConn">
      <div className="ibkrConn__head">
        <label className="ibkrConn__labelWrap" title="Click to rename">
          <Pencil size={11} strokeWidth={1.75} className="ibkrConn__labelIcon" />
          <input
            className="ibkrConn__label"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={onLabelBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setLabelDraft(connection.label);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Connection label"
            spellCheck={false}
          />
        </label>
        <StatusBadge status={connection.status} />
      </div>

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
          style={{
            background: "var(--accent)",
            borderColor: "var(--accent)",
            color: "#fff",
          }}
        >
          <RefreshCw
            size={13}
            strokeWidth={1.75}
            className={isSyncing ? "spin" : undefined}
          />
          <span>{isSyncing ? "Syncing…" : "Sync now"}</span>
        </Button>
        <Button
          onClick={onResync}
          disabled={isSyncing || !connection.token || !connection.queryId}
          title="Delete this connection's imported trades and pull fresh"
        >
          <RotateCcw size={13} strokeWidth={1.75} />
          <span>Delete &amp; resync</span>
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
    </div>
  );
}

function DemoDataCard() {
  const { demo: demoTrades, real: realTrades } = useDemoCounts();
  const {
    demoAccounts,
    realAccounts,
    demoHoldings,
    realHoldings,
  } = usePortfolioDemoCounts();
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
            Picofolio ships with seeded trades and a sample portfolio so the
            UI has something to render before you connect anything. Each
            section is cleared automatically the first time real data lands
            — you can also clear or restore them by hand here.
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
        credentials (the toggle near the login button switches between live
        and paper). Paper accounts work identically with Flex; their IDs
        start with <code>DU</code> instead of <code>U</code>.
      </Step>
      <Step n={2} title="Open the Flex Queries page">
        Menu → <strong>Performance &amp; Reports</strong> →{" "}
        <strong>Flex Queries</strong>. Everything below lives on this one
        page — the token configuration in the right column, the query
        templates on the left.
      </Step>
      <Step n={3} title="Enable the Flex Web Service + generate a token">
        <p>
          On the right side of the Flex Queries page, find the{" "}
          <strong>Flex Web Service Configuration</strong> panel. Click the
          gear icon to open it.
        </p>
        <ul>
          <li>Status: <strong>Enabled</strong></li>
          <li>IP Restrictions: leave blank for now (whitelist later for security)</li>
          <li>Token expiration: max 1 year — set the longest you're comfortable with</li>
          <li>Save, then click <strong>Generate token</strong></li>
        </ul>
        Copy the long alphanumeric string that appears — that's your{" "}
        <strong>Flex Token</strong>. It's only shown once.
      </Step>
      <Step n={4} title="Create an Activity Flex Query">
        <p>
          Back on the main Flex Queries page, find the{" "}
          <strong>Activity Flex Query</strong> panel (left column) and
          click the <strong>+</strong> button to create one.
        </p>
        <ul>
          <li>Query name: anything — <code>Picofolio Sync</code> is fine</li>
          <li>
            Sections: tick at minimum <strong>Trades</strong>. Optional:{" "}
            <strong>Open Positions</strong>, <strong>Net Asset Value</strong>,{" "}
            <strong>Cash Report</strong>. Skip <strong>Transaction Fees</strong>{" "}
            — per-trade commission is already in Trades.
          </li>
          <li>Format: <strong>XML</strong></li>
          <li>Delivery: <strong>None</strong> (we pull on demand)</li>
        </ul>
        <p>
          <strong>Important — change the Period.</strong> Under{" "}
          <strong>Delivery Configuration</strong>, Period defaults to{" "}
          <code>Last Business Day</code> which only returns today's trades.
          Set it to <strong>Last 365 Calendar Days</strong> for a useful
          first pull.
        </p>
        <p>
          Everything else (Date Format <code>yyyyMMdd</code>, Time Format{" "}
          <code>HHmmss</code>, Date/Time Separator <code>;</code>, the
          General Configuration toggles) can stay on defaults — that's
          exactly what our parser expects. Save when done.
        </p>
      </Step>
      <Step n={5} title="Find the Query ID">
        Back on the Flex Queries list, your query has a numeric{" "}
        <strong>Query ID</strong> (usually 6–8 digits) shown next to its
        name. That's the second field below.
      </Step>
      <Step n={6} title="Paste, save, sync">
        <p>
          Paste the token + Query ID into the form below. Click{" "}
          <strong>Save credentials</strong>, then <strong>Sync now</strong>.
        </p>
        <p>
          First sync may take 5–60 seconds — IBKR generates the report
          on-demand. The status badge will cycle through{" "}
          <code>Requesting → Polling → Parsing</code>.
        </p>
      </Step>

      <div className="ibkrHelp__note">
        <strong>Troubleshooting:</strong> If you see <em>“Statement is not
        ready yet”</em>, the report is still generating — we retry every 4s
        for up to a minute. Token errors usually mean the token expired or
        Flex Web Service got disabled. The{" "}
        <strong>Paste Flex XML</strong> card below skips the network
        entirely — useful for a first test.
      </div>
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
  return (
    <span className={`ibkrStatusBadge ibkrStatusBadge--${status}`}>
      {label}
    </span>
  );
}
