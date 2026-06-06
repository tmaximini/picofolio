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
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/layout";
import { Button } from "@/components/primitives";
import { AccountFormModal } from "@/components/ui";
import type { Account } from "@/lib/mock";
import type { IbkrConnection, IbkrStatus } from "@/store/index";
import {
  useAccounts,
  useAddIbkrConnection,
  useClearDemoForAccount,
  useHoldings,
  useIbkrConnections,
  useImportIbkrXml,
  useMarketDataToken,
  usePushToast,
  useRemoveAccount,
  useRemoveIbkrConnection,
  useResetAccount,
  useResyncIbkrConnection,
  useSetMarketDataToken,
  useRestoreDemoPortfolio,
  useRestoreDemoTrades,
  useSelectedAccountId,
  useSetSelectedAccount,
  useSyncIbkrConnection,
  useTrades,
  useUpdateAccount,
  useUpdateIbkrConnection,
} from "@/store/selectors";

export function Settings() {
  const accounts = useAccounts();
  const selectedId = useSelectedAccountId();
  const setSelected = useSetSelectedAccount();
  const [showGuide, setShowGuide] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // The pills drive the GLOBAL account selection so they stay in lock-step
  // with the top switcher. "All Accounts" has no per-account settings, so we
  // fall back to the first account for display until a pill is clicked.
  const selected =
    accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null;

  return (
    <>
      <Topbar title="Settings" subtitle="Per-account · IBKR sync · Imports" />

      <div className="settingsTabs">
        <div className="settingsTabs__list">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`settingsTab${a.id === selected?.id ? " settingsTab--active" : ""}`}
              onClick={() => setSelected(a.id)}
            >
              <span className="settingsTab__dot" style={{ background: a.color }} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="settingsTab settingsTab--add"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={13} strokeWidth={1.75} />
          <span>Add account</span>
        </button>
      </div>

      <div className="settingsStack">
        {selected ? (
          <>
            <section className="settingsCard">
              <div className="settingsCard__head">
                <div>
                  <h2 className="settingsCard__title">IBKR sync</h2>
                  <div className="settingsCard__sub">
                    One IBKR Flex Query connection feeds this account; synced
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
              </div>

              {showGuide && <IbkrSetupGuide />}

              <AccountSyncCard
                key={selected.id}
                account={selected}
                onEdit={setEditAccountId}
              />
            </section>

            <AccountDemoCard account={selected} />

            <DangerZone account={selected} />
          </>
        ) : (
          <section className="settingsCard">
            <div className="ibkrEmpty">
              No accounts yet — click <strong>Add account</strong> to create one.
            </div>
          </section>
        )}

        <MarketDataCard />

        <OrphanConnections />

        <GlobalDemoFooter />
      </div>

      {createOpen && (
        <AccountFormModal onClose={() => setCreateOpen(false)} />
      )}
      {editAccountId && (
        <AccountFormModal
          accountId={editAccountId}
          onClose={() => setEditAccountId(null)}
        />
      )}
    </>
  );
}

// ---------- options pricing (MarketData.app, app-level BYOK token) ----------

function MarketDataCard() {
  const token = useMarketDataToken();
  const setToken = useSetMarketDataToken();
  const pushToast = usePushToast();
  const [searchParams] = useSearchParams();

  const cardRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(token ?? "");

  const trimmed = draft.trim();
  const dirty = trimmed !== (token ?? "");

  // Reflect the stored token if it changes after mount (persist hydration, or a
  // save/clear from elsewhere). The seed in useState only runs once, so without
  // this the field can show empty even when a token is persisted.
  useEffect(() => {
    setDraft(token ?? "");
  }, [token]);

  // Deep-link target from the "Add token →" hint on an option chart.
  useEffect(() => {
    if (searchParams.get("focus") !== "marketdata") return;
    cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    inputRef.current?.focus();
  }, [searchParams]);

  const onSave = () => {
    setToken(trimmed || null);
    pushToast({
      kind: trimmed ? "success" : "info",
      title: trimmed ? "MarketData.app token saved" : "Token cleared",
      duration: 3000,
    });
  };

  return (
    <section className="settingsCard" ref={cardRef}>
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Options pricing</h2>
          <div className="settingsCard__sub">
            Optional. A free{" "}
            <a
              href="https://www.marketdata.app/"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)" }}
            >
              MarketData.app
            </a>{" "}
            token marks your open option positions to market — live mark and a
            price-history chart. Equities, closed option trades, and everything
            else work without it. The token never leaves this browser.
          </div>
        </div>
      </div>

      <div className="tradeForm__field" style={{ marginBottom: "var(--space-4)" }}>
        <label className="tradeForm__label">MarketData.app Token</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: "var(--space-2)" }}>
          <input
            ref={inputRef}
            className="tradeForm__input num"
            type={show ? "text" : "password"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="paste your token"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn--icon"
            onClick={() => setShow((v) => !v)}
            title={show ? "Hide" : "Show"}
          >
            {show ? (
              <EyeOff size={13} strokeWidth={1.75} />
            ) : (
              <Eye size={13} strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      <div className="ibkrActions">
        <Button onClick={onSave} disabled={!dirty}>
          Save
        </Button>
        {token && (
          <Button
            className="btn--danger"
            onClick={() => {
              setDraft("");
              setToken(null);
              pushToast({ kind: "info", title: "Token cleared", duration: 3000 });
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </section>
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
        <ConnectionControls connection={conn} />
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

      <AccountXmlImport accountId={account.id} accountName={account.name} />
    </div>
  );
}

/**
 * Per-account Flex XML import (drag-drop / file-picker / paste). Imports
 * straight into this account so there's no ambiguity about where it lands —
 * the fallback path when the Flex Web Service keeps failing to generate.
 */
function AccountXmlImport({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const importXml = useImportIbkrXml();
  const pushToast = usePushToast();
  const [open, setOpen] = useState(false);
  const [xmlDraft, setXmlDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runImport = (xml: string, sourceLabel?: string) => {
    setMsg(null);
    if (!xml.trim()) {
      setMsg({ ok: false, text: "Nothing to import." });
      return;
    }
    if (
      !confirm(
        `Import into "${accountName}"?\n\n` +
          `• This account's IBKR positions and cash will be REPLACED by the statement's snapshot.\n` +
          `• Trades are merged — new ones added, already-imported ones skipped.\n\n` +
          `Manual entries you added by hand aren't touched. This can't be undone.`,
      )
    ) {
      return;
    }
    try {
      const summary = importXml(xml, accountId);
      setMsg({ ok: true, text: `Imported ${summary.added} · skipped ${summary.skipped}` });
      setXmlDraft("");
      pushToast({
        kind: summary.added > 0 ? "success" : "info",
        title:
          summary.added > 0
            ? `${accountName}: imported ${summary.added} trade${summary.added === 1 ? "" : "s"}`
            : `${accountName}: nothing new`,
        body:
          (sourceLabel ? `From ${sourceLabel}. ` : "") +
          (summary.skipped > 0 ? `Skipped ${summary.skipped} already-imported.` : ""),
        duration: 5000,
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setMsg({ ok: false, text: m });
      pushToast({ kind: "error", title: "XML parse failed", body: m });
    }
  };

  const handleFile = async (file: File) => {
    if (!/\.(xml|txt)$/i.test(file.name) && !file.type.includes("xml")) {
      setMsg({ ok: false, text: `"${file.name}" isn't an XML file.` });
      return;
    }
    try {
      runImport(await file.text(), file.name);
    } catch {
      setMsg({ ok: false, text: "Couldn't read that file." });
    }
  };

  return (
    <div className="acctImport">
      <button
        type="button"
        className="ibkrHelp__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={12} strokeWidth={2} />
        ) : (
          <ChevronRight size={12} strokeWidth={2} />
        )}
        Import a Flex XML file into {accountName}
      </button>

      {open && (
        <div className="acctImport__body">
          <div className="acctImport__warn">
            Replaces <strong>{accountName}</strong>'s IBKR positions &amp; cash with
            the file's snapshot; trades are merged (duplicates skipped). Manual
            entries are untouched.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <div
            className={`xmlDrop${dragging ? " xmlDrop--active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
          >
            <Upload size={18} strokeWidth={1.75} className="xmlDrop__icon" />
            <div className="xmlDrop__label">
              {dragging ? "Drop to import" : "Drag your Flex .xml here, or click to browse"}
            </div>
          </div>

          <div className="xmlDrop__or">or paste</div>

          <textarea
            className="ibkrFallback__textarea"
            value={xmlDraft}
            onChange={(e) => setXmlDraft(e.target.value)}
            placeholder="<FlexQueryResponse ...>"
            spellCheck={false}
          />
          <div className="ibkrActions" style={{ marginTop: "var(--space-3)" }}>
            <Button onClick={() => runImport(xmlDraft)} disabled={!xmlDraft.trim()}>
              Import into {accountName}
            </Button>
            {msg && (
              <span
                className={`ibkrStatusBadge ibkrStatusBadge--${msg.ok ? "ok" : "error"}`}
              >
                {msg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- the token/queryId/sync controls for a linked connection ----------

function ConnectionControls({ connection }: { connection: IbkrConnection }) {
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
        <Button onClick={onRemove} className="btn--danger">
          <Trash2 size={13} strokeWidth={1.75} />
          <span>Remove connection</span>
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

// ---------- per-account demo data ----------

function AccountDemoCard({ account }: { account: Account }) {
  const trades = useTrades();
  const holdings = useHoldings();
  const clearDemoForAccount = useClearDemoForAccount();
  const pushToast = usePushToast();

  const demoTrades = trades.filter(
    (t) => t.source === "demo" && t.accountId === account.id,
  ).length;
  const demoHoldings = holdings.filter(
    (h) => h.source === "demo" && h.accountId === account.id,
  ).length;

  // Nothing seeded for this account — don't clutter the panel.
  if (demoTrades === 0 && demoHoldings === 0) return null;

  const onClear = () => {
    clearDemoForAccount(account.id);
    pushToast({
      kind: "info",
      title: `Cleared demo data from ${account.name}`,
      duration: 3000,
    });
  };

  return (
    <section className="settingsCard">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Demo data</h2>
          <div className="settingsCard__sub">
            <strong>{account.name}</strong> still holds sample data —{" "}
            <em>{demoTrades}</em> demo trade{demoTrades === 1 ? "" : "s"} ·{" "}
            <em>{demoHoldings}</em> demo holding{demoHoldings === 1 ? "" : "s"}.
            Clear it once your real data is in.
          </div>
        </div>
        <Button onClick={onClear} className="btn--danger">
          <Trash2 size={13} strokeWidth={1.75} />
          <span>Clear demo data</span>
        </Button>
      </div>
    </section>
  );
}

// ---------- global demo restore (recreates the sample accounts) ----------

function GlobalDemoFooter() {
  const restorePortfolio = useRestoreDemoPortfolio();
  const restoreTrades = useRestoreDemoTrades();
  const pushToast = usePushToast();

  return (
    <section className="settingsCard">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Demo seed</h2>
          <div className="settingsCard__sub">
            Restore the bundled sample accounts (Trading + Long-Term) and journal
            — handy for exploring the UI. Won't touch your real or imported data.
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
            <span>Restore portfolio</span>
          </Button>
          <Button
            onClick={() => {
              restoreTrades();
              pushToast({ kind: "success", title: "Demo trades restored", duration: 3000 });
            }}
          >
            <RotateCcw size={13} strokeWidth={1.75} />
            <span>Restore trades</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---------- per-account danger zone ----------

function DangerZone({ account }: { account: Account }) {
  const reset = useResetAccount();
  const updateAccount = useUpdateAccount();
  const removeAccount = useRemoveAccount();
  const pushToast = usePushToast();
  const isLinked = Boolean(account.flexConnectionId);

  const onReset = () => {
    if (
      !confirm(
        `Reset "${account.name}"? This removes all its trades, positions, and cash — the account, its name, and IBKR link stay.`,
      )
    ) {
      return;
    }
    reset(account.id);
    pushToast({ kind: "info", title: `${account.name} reset`, duration: 3000 });
  };

  const onUnlink = () => {
    updateAccount(account.id, { flexConnectionId: undefined });
    pushToast({
      kind: "info",
      title: `${account.name} unlinked from IBKR`,
      duration: 3000,
    });
  };

  const onDelete = () => {
    if (
      !confirm(
        `Delete "${account.name}" entirely? Its trades, positions, and setups are permanently removed.`,
      )
    ) {
      return;
    }
    removeAccount(account.id);
    pushToast({ kind: "info", title: `${account.name} deleted`, duration: 3000 });
  };

  return (
    <section className="settingsCard dangerZone">
      <div className="settingsCard__head">
        <div>
          <h2 className="settingsCard__title">Danger zone</h2>
          <div className="settingsCard__sub">Destructive actions for this account.</div>
        </div>
      </div>

      <div className="dangerZone__rows">
        <DangerRow
          title="Reset account"
          desc="Wipe all trades, positions, and cash. Keeps the account, its name, and IBKR link."
        >
          <Button onClick={onReset}>
            <RotateCcw size={13} strokeWidth={1.75} />
            <span>Reset</span>
          </Button>
        </DangerRow>

        <DangerRow
          title="Unlink from IBKR"
          desc={
            isLinked
              ? "Detach the Flex connection. The connection stays available to relink elsewhere."
              : "This account isn't linked to an IBKR connection."
          }
        >
          <Button onClick={onUnlink} disabled={!isLinked}>
            <Link2Off size={13} strokeWidth={1.75} />
            <span>Unlink</span>
          </Button>
        </DangerRow>

        <DangerRow
          title="Delete account"
          desc="Permanently remove this account and everything in it."
        >
          <Button onClick={onDelete} className="btn--danger">
            <Trash2 size={13} strokeWidth={1.75} />
            <span>Delete</span>
          </Button>
        </DangerRow>
      </div>
    </section>
  );
}

function DangerRow({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
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
