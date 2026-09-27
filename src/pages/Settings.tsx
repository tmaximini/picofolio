import { useEffect, useState } from "react";
import { Database, Plug, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/layout";
import { AccountFormModal } from "@/components/ui";
import { AccountSettings, DataSettings, MarketDataCard } from "@/features/settings";
import { useAccounts, useIbkrConnections, useSelectedAccountId, useSetSelectedAccount } from "@/store/selectors";

type Section = "account" | "integrations" | "data";

/**
 * Settings, Linear-style: a section nav on the left separates what belongs to
 * one account (identity, IBKR sync, danger zone) from what applies app-wide
 * (integrations, data). The account items stay in lock-step with the global
 * account switcher. `?s=integrations|data` deep-links a section.
 */
export function Settings() {
  const accounts = useAccounts();
  const connections = useIbkrConnections();
  const selectedId = useSelectedAccountId();
  const setSelected = useSetSelectedAccount();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // The "Add token →" hint on option charts links ?focus=marketdata.
  const focus = params.get("focus");
  const s = params.get("s");
  const section: Section = focus === "marketdata" || s === "integrations" ? "integrations" : s === "data" ? "data" : "account";

  // "All accounts" has no per-account settings — show the first account.
  const account = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null;

  // Newly created account: jump to it.
  const [prevCount, setPrevCount] = useState(accounts.length);
  useEffect(() => {
    if (accounts.length > prevCount) {
      const newest = accounts[accounts.length - 1];
      if (newest) setSelected(newest.id);
      setParams({}, { replace: true });
    }
    setPrevCount(accounts.length);
  }, [accounts, prevCount, setSelected, setParams]);

  const goAccount = (id: string) => {
    setSelected(id);
    setParams({});
  };
  const goSection = (sec: Exclude<Section, "account">) => setParams({ s: sec });

  const connectedStatus = (id?: string) => {
    const c = connections.find((x) => x.id === id);
    if (!c) return null;
    return c.status === "error" ? "error" : "ok";
  };

  return (
    <>
      <Topbar title="Settings" subtitle="Accounts, broker sync and app data" />

      <div className="settingsLayout">
        <nav className="settingsNav" aria-label="Settings sections">
          <div className="settingsNav__group">Accounts</div>
          {accounts.map((a) => {
            const st = connectedStatus(a.flexConnectionId);
            const active = section === "account" && a.id === account?.id;
            return (
              <button
                key={a.id}
                type="button"
                className={active ? "settingsNav__item settingsNav__item--active" : "settingsNav__item"}
                aria-current={active ? "page" : undefined}
                onClick={() => goAccount(a.id)}
              >
                <span className="settingsNav__dot" style={{ background: a.color }} aria-hidden />
                <span className="settingsNav__label">{a.name}</span>
                {st && (
                  <span
                    className={`settingsNav__sync settingsNav__sync--${st}`}
                    title={st === "error" ? "Last IBKR sync failed" : "Syncs from IBKR"}
                  >
                    IBKR
                  </span>
                )}
              </button>
            );
          })}
          <button type="button" className="settingsNav__item settingsNav__item--add" onClick={() => setCreating(true)}>
            <Plus size={13} strokeWidth={1.75} />
            <span className="settingsNav__label">Add account</span>
          </button>

          <div className="settingsNav__group">App</div>
          <button
            type="button"
            className={section === "integrations" ? "settingsNav__item settingsNav__item--active" : "settingsNav__item"}
            aria-current={section === "integrations" ? "page" : undefined}
            onClick={() => goSection("integrations")}
          >
            <Plug size={13} strokeWidth={1.5} />
            <span className="settingsNav__label">Integrations</span>
          </button>
          <button
            type="button"
            className={section === "data" ? "settingsNav__item settingsNav__item--active" : "settingsNav__item"}
            aria-current={section === "data" ? "page" : undefined}
            onClick={() => goSection("data")}
          >
            <Database size={13} strokeWidth={1.5} />
            <span className="settingsNav__label">Data</span>
          </button>
        </nav>

        <div className="settingsStack" key={section === "account" ? account?.id : section}>
          {section === "account" &&
            (account ? (
              <AccountSettings account={account} onEdit={() => setEditing(account.id)} />
            ) : (
              <section className="settingsCard">
                <div className="emptyState">
                  <div className="emptyState__title">No accounts yet</div>
                  <div className="emptyState__body">
                    Add an account to track positions by hand or sync them from
                    Interactive Brokers.
                  </div>
                </div>
              </section>
            ))}
          {section === "integrations" && (
            <>
              <MarketDataCard />
              <p className="settingsNote">
                Interactive Brokers is set up per account — pick an account on the left.
              </p>
            </>
          )}
          {section === "data" && <DataSettings />}
        </div>
      </div>

      {creating && <AccountFormModal onClose={() => setCreating(false)} />}
      {editing && <AccountFormModal accountId={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
