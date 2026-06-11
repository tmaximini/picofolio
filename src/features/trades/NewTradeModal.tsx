import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAccounts, useAddTrade, useSelectedAccountId } from "@/store/selectors";
import { ALL_ACCOUNTS } from "@/store";
import type { Trade } from "@/lib/trades";
import { TradeForm, type TradePrefill } from "./TradeForm";

type NewTradeModalProps = {
  onClose: () => void;
  initialSymbol?: string;
  /** Seed the form from a trade setup (convert-to-trade flow). */
  prefill?: TradePrefill;
  /** Called after the trade was added (before closing). */
  onSaved?: () => void;
};

export function NewTradeModal({ onClose, initialSymbol, prefill, onSaved }: NewTradeModalProps) {
  const addTrade = useAddTrade();
  const accounts = useAccounts();
  const selectedAccountId = useSelectedAccountId();
  // New trades land in the active account; in the "All Accounts" roll-up
  // fall back to the first account so the trade always has a home.
  const targetAccountId =
    selectedAccountId !== ALL_ACCOUNTS
      ? selectedAccountId
      : accounts[0]?.id ?? "";

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

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="modal modal--trade"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__head">
          <div className="modal__title">New Trade</div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <TradeForm
          initialSymbol={initialSymbol}
          prefill={prefill}
          submitLabel="Save"
          onSubmit={(data) => {
            const trade: Trade = {
              id: `t-${Math.random().toString(36).slice(2, 10)}`,
              accountId: targetAccountId,
              symbol: data.symbol,
              market: data.market,
              side: data.side,
              targetCents: data.targetCents,
              stopCents: data.stopCents,
              executions: data.executions,
              notes: data.notes,
              tags: data.tags,
              confidence: data.confidence,
              source: "manual",
            };
            addTrade(trade);
            onSaved?.();
            onClose();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
