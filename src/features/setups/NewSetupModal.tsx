import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatCents } from "@/lib/money";
import { parseSetupCommand, setupToCommand } from "@/lib/setupParser";
import { riskReward } from "@/lib/tradeMath";
import type { TradeSetup } from "@/lib/trades";
import { ALL_ACCOUNTS } from "@/store";
import {
  useAccounts,
  useAddSetup,
  useSelectedAccountId,
  useUpdateSetup,
} from "@/store/selectors";

type NewSetupModalProps = {
  onClose: () => void;
  /** Edit an existing setup — the terminal opens prefilled with its
   *  command-line form and saving updates in place. */
  setup?: TradeSetup;
};

const PLACEHOLDER = "long nvda @142 t160 s135 watch for breakout";

export function NewSetupModal({ onClose, setup }: NewSetupModalProps) {
  const [input, setInput] = useState(() => (setup ? setupToCommand(setup) : ""));
  const addSetup = useAddSetup();
  const updateSetup = useUpdateSetup();
  const accounts = useAccounts();
  const selectedAccountId = useSelectedAccountId();
  const targetAccountId =
    selectedAccountId !== ALL_ACCOUNTS
      ? selectedAccountId
      : accounts[0]?.id ?? "";

  const parsed = useMemo(() => parseSetupCommand(input), [input]);
  const rr = riskReward(parsed.entryCents, parsed.targetCents, parsed.stopCents, parsed.side);
  const hasInput = input.trim().length > 0;
  const canSave = hasInput && parsed.missing.length === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const save = () => {
    if (!canSave) return;
    const fields = {
      symbol: parsed.symbol as string,
      side: parsed.side,
      entryCents: parsed.entryCents as number,
      targetCents: parsed.targetCents as number,
      stopCents: parsed.stopCents as number,
      notes: parsed.notes || undefined,
    };
    if (setup) {
      // Keep id, account, createdAt and status — only the plan changes.
      updateSetup(setup.id, fields);
    } else {
      addSetup({
        id: `sp-${Math.random().toString(36).slice(2, 10)}`,
        accountId: targetAccountId,
        market: "STOCK",
        createdAt: new Date().toISOString(),
        status: "PLANNED",
        ...fields,
      });
    }
    onClose();
  };

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="setupTerminal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={setup ? "Edit setup" : "New setup"}
      >
        <div className="setupTerminal__head">
          <span className="setupTerminal__title">{setup ? "Edit Setup" : "New Setup"}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="setupTerminal__inputRow">
          <span className="setupTerminal__prompt" aria-hidden="true">›</span>
          <input
            className="setupTerminal__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            placeholder={PLACEHOLDER}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="setupTerminal__hint">
          long / short · symbol · @entry · t target · s stop — the rest becomes
          notes · use $T for tickers named like keywords
        </div>

        <div className="setupTerminal__preview">
          {hasInput ? (
            <>
              <div className="setupRow__chain">
                <span
                  className={
                    parsed.side === "LONG"
                      ? "setupRow__chip--side setupRow__chip--side--long"
                      : "setupRow__chip--side setupRow__chip--side--short"
                  }
                >
                  {parsed.side}
                </span>
                {parsed.symbol && (
                  <>
                    <span className="setupRow__sep" />
                    <span className="setupRow__chip setupRow__chip--sym">${parsed.symbol}</span>
                  </>
                )}
                {parsed.entryCents != null && (
                  <>
                    <span className="setupRow__sep" />
                    <span className="setupRow__chip">@ {formatCents(parsed.entryCents)}</span>
                  </>
                )}
                {parsed.targetCents != null && (
                  <>
                    <span className="setupRow__sep" />
                    <span className="setupRow__chip setupRow__chip--target">
                      T: {formatCents(parsed.targetCents)}
                    </span>
                  </>
                )}
                {parsed.stopCents != null && (
                  <>
                    <span className="setupRow__sep" />
                    <span className="setupRow__chip setupRow__chip--stop">
                      S: {formatCents(parsed.stopCents)}
                    </span>
                  </>
                )}
                {rr != null && (
                  <>
                    <span className="setupRow__sep" />
                    <span
                      className={
                        rr >= 2
                          ? "setupTerminal__rr setupTerminal__rr--good"
                          : "setupTerminal__rr"
                      }
                    >
                      R:R {rr.toFixed(1)}
                    </span>
                  </>
                )}
                {parsed.notes && <span className="setupRow__notes">{parsed.notes}</span>}
              </div>
              {parsed.missing.length > 0 && (
                <div className="setupTerminal__missing">
                  missing: {parsed.missing.join(", ")}
                </div>
              )}
            </>
          ) : (
            <div className="setupTerminal__empty">
              Type a setup — it parses into a plan as you write.
            </div>
          )}
        </div>

        <div className="setupTerminal__foot">
          <span>
            <kbd className="kbd">↵</kbd>
            <span className="setupTerminal__footHint">save</span>
          </span>
          <span>
            <kbd className="kbd">ESC</kbd>
            <span className="setupTerminal__footHint">close</span>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
