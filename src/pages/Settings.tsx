import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/layout";
import { Button } from "@/components/primitives";
import {
  useClearDemoPortfolio,
  useClearDemoTrades,
  useClearIbkrCredentials,
  useDemoCounts,
  useIbkrError,
  useIbkrLastSummary,
  useIbkrLastSyncAt,
  useIbkrQueryId,
  useIbkrStatus,
  useIbkrToken,
  useImportIbkrXml,
  usePortfolioDemoCounts,
  usePushToast,
  useRestoreDemoPortfolio,
  useRestoreDemoTrades,
  useSetIbkrQueryId,
  useSetIbkrToken,
  useSyncIbkr,
} from "@/store/selectors";

export function Settings() {
  const token = useIbkrToken();
  const queryId = useIbkrQueryId();
  const status = useIbkrStatus();
  const error = useIbkrError();
  const lastSyncAt = useIbkrLastSyncAt();
  const lastSummary = useIbkrLastSummary();

  const setToken = useSetIbkrToken();
  const setQueryId = useSetIbkrQueryId();
  const clearCreds = useClearIbkrCredentials();
  const syncIbkr = useSyncIbkr();
  const importXml = useImportIbkrXml();
  const pushToast = usePushToast();

  const [showToken, setShowToken] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(token);
  const [queryIdDraft, setQueryIdDraft] = useState(queryId);
  const [xmlDraft, setXmlDraft] = useState("");
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlOk, setXmlOk] = useState<{ added: number; skipped: number } | null>(null);
  // First-time users see the guide expanded; collapse it once they've got
  // creds saved, on the assumption they don't need to re-read it.
  const [showGuide, setShowGuide] = useState(!token || !queryId);

  const isSyncing =
    status === "sending" || status === "polling" || status === "parsing";

  const credsChanged = tokenDraft !== token || queryIdDraft !== queryId;

  const saveCreds = () => {
    setToken(tokenDraft);
    setQueryId(queryIdDraft);
    pushToast({
      kind: "success",
      title: "Credentials saved",
      body: "Token and Query ID stored in this browser.",
      duration: 3500,
    });
  };

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) return "Never";
    const d = new Date(lastSyncAt);
    return d.toLocaleString();
  }, [lastSyncAt]);

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

  return (
    <>
      <Topbar title="Settings" subtitle="IBKR sync · Imports" />

      <div className="settingsStack">
        <section className="settingsCard">
          <div className="settingsCard__head">
            <div>
              <h2 className="settingsCard__title">IBKR Flex Query sync</h2>
              <div className="settingsCard__sub">
                Paste a Flex Query token + Query ID from Client Portal. Works
                for live <em>and</em> paper accounts. The token never leaves
                this browser.
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
            <StatusBadge status={status} />
          </div>

          {showGuide && <IbkrSetupGuide />}

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
            <Button onClick={saveCreds} disabled={!credsChanged}>
              Save credentials
            </Button>
            <Button
              onClick={() => syncIbkr()}
              disabled={isSyncing || !token || !queryId}
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
            <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)" }}>
              Last sync: <span className="num">{lastSyncLabel}</span>
            </span>
          </div>

          {error && (
            <div className="ibkrWarnings" style={{ marginTop: "var(--space-4)" }}>
              <div className="ibkrWarnings__title">Sync failed</div>
              <div>{error}</div>
            </div>
          )}

          {lastSummary && (
            <>
              <div className="ibkrSummary">
                <div className="ibkrSummary__cell">
                  <span className="ibkrSummary__label">Added</span>
                  <span className="ibkrSummary__value">{lastSummary.added}</span>
                </div>
                <div className="ibkrSummary__cell">
                  <span className="ibkrSummary__label">Skipped (dupes)</span>
                  <span className="ibkrSummary__value">{lastSummary.skipped}</span>
                </div>
                <div className="ibkrSummary__cell">
                  <span className="ibkrSummary__label">Accounts</span>
                  <span className="ibkrSummary__value">
                    {lastSummary.accountIds.length > 0
                      ? lastSummary.accountIds.join(", ")
                      : "—"}
                  </span>
                </div>
              </div>
              {lastSummary.warnings.length > 0 && (
                <div className="ibkrWarnings">
                  <div className="ibkrWarnings__title">
                    {lastSummary.warnings.length} warning(s)
                  </div>
                  <ul>
                    {lastSummary.warnings.slice(0, 10).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <section className="settingsCard">
          <div className="settingsCard__head">
            <div>
              <h2 className="settingsCard__title">Or paste Flex XML</h2>
              <div className="settingsCard__sub">
                Generate the Flex statement manually in Client Portal and paste the
                raw XML here. Useful when CORS/proxy isn't set up yet.
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

        <section className="settingsCard dangerZone">
          <div className="settingsCard__head">
            <div>
              <h2 className="settingsCard__title">Danger zone</h2>
              <div className="settingsCard__sub">
                Clears the saved Flex token, query ID, and last-sync timestamp. Imported
                trades stay where they are.
              </div>
            </div>
          </div>
          <Button
            onClick={() => {
              if (confirm("Clear stored IBKR credentials?")) {
                clearCreds();
                setTokenDraft("");
                setQueryIdDraft("");
                pushToast({
                  kind: "info",
                  title: "IBKR credentials cleared",
                  duration: 3500,
                });
              }
            }}
            className="btn--danger"
          >
            <Trash2 size={13} strokeWidth={1.75} />
            <span>Clear stored credentials</span>
          </Button>
        </section>
      </div>
    </>
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

function StatusBadge({ status }: { status: ReturnType<typeof useIbkrStatus> }) {
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
