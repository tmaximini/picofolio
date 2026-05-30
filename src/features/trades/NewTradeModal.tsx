import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAddTrade } from "@/store/selectors";
import type { Trade } from "@/lib/trades";
import { TradeForm } from "./TradeForm";

type NewTradeModalProps = {
  onClose: () => void;
  initialSymbol?: string;
};

export function NewTradeModal({ onClose, initialSymbol }: NewTradeModalProps) {
  const [tab, setTab] = useState<"general" | "journal">("general");
  const addTrade = useAddTrade();

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="modal"
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
          tab={tab}
          onTabChange={setTab}
          initialSymbol={initialSymbol}
          submitLabel="Save"
          onSubmit={(data) => {
            const trade: Trade = {
              id: `t-${Math.random().toString(36).slice(2, 10)}`,
              account: "Trading",
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
            onClose();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
