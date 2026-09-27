import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button, ConfirmButton } from "@/components/primitives";
import { useMarketDataToken, usePushToast, useSetMarketDataToken } from "@/store/selectors";

/** App-level BYOK token for live option marks (MarketData.app). */
export function MarketDataCard() {
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
          <h2 className="settingsCard__title">Options pricing · MarketData.app</h2>
          <div className="settingsCard__sub">
            Optional. A free{" "}
            <a
              href="https://www.marketdata.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="settingsLink"
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
        <label className="tradeForm__label" htmlFor="marketdata-token">API token</label>
        <div className="secretField">
          <input
            id="marketdata-token"
            ref={inputRef}
            className="tradeForm__input num"
            type={show ? "text" : "password"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="paste your token"
            // Keep API tokens out of browser password managers.
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn--icon"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide token" : "Show token"}
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
          <ConfirmButton
            confirmLabel="Remove token?"
            onConfirm={() => {
              setDraft("");
              setToken(null);
              pushToast({ kind: "info", title: "Token removed", duration: 3000 });
            }}
          >
            Remove
          </ConfirmButton>
        )}
        <span className={`syncStatus syncStatus--${token ? "ok" : "idle"}`}>
          <i aria-hidden />
          {token ? "Connected" : "Not set"}
        </span>
      </div>
    </section>
  );
}
