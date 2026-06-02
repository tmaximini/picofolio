import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Modal } from "@/components/primitives";
import type { Holding } from "@/lib/mock";
import {
  useAddHolding,
  usePushToast,
  useRemoveHolding,
  useUpdateHolding,
} from "@/store/selectors";

type HoldingFormModalProps = {
  accountId: string;
  /** Provide to edit an existing position; omit to add a new one. */
  holding?: Holding;
  onClose: () => void;
};

function dollarsToCents(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function HoldingFormModal({ accountId, holding, onClose }: HoldingFormModalProps) {
  const addHolding = useAddHolding();
  const updateHolding = useUpdateHolding();
  const removeHolding = useRemoveHolding();
  const pushToast = usePushToast();

  const isEdit = Boolean(holding);

  const [symbol, setSymbol] = useState(holding?.symbol ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [qtyStr, setQtyStr] = useState(holding ? String(holding.qty) : "");
  const [costStr, setCostStr] = useState(
    holding ? (holding.avgCostCents / 100).toString() : "",
  );

  const qty = parseFloat(qtyStr);
  const canSave = symbol.trim().length > 0 && Number.isFinite(qty) && qty !== 0;

  const onSubmit = () => {
    const sym = symbol.trim().toUpperCase();
    const avgCostCents = dollarsToCents(costStr);
    if (isEdit && holding) {
      updateHolding(accountId, holding.symbol, {
        symbol: sym,
        name,
        qty,
        avgCostCents,
      });
      pushToast({ kind: "success", title: `${sym} updated`, duration: 2500 });
    } else {
      addHolding({ accountId, symbol: sym, name, qty, avgCostCents });
      pushToast({ kind: "success", title: `${sym} added`, duration: 2500 });
    }
    onClose();
  };

  const onDelete = () => {
    if (!holding) return;
    if (!confirm(`Remove ${holding.symbol} from this account?`)) return;
    removeHolding(accountId, holding.symbol);
    pushToast({ kind: "info", title: `${holding.symbol} removed`, duration: 2500 });
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Edit position" : "Add position"}
      onClose={onClose}
      width={440}
      footer={
        <div className="accountForm__foot">
          {isEdit && (
            <Button className="btn--danger" onClick={onDelete}>
              <Trash2 size={13} strokeWidth={1.75} />
              <span>Remove</span>
            </Button>
          )}
          <div className="accountForm__footRight">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              onClick={onSubmit}
              disabled={!canSave}
              style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}
            >
              {isEdit ? "Save" : "Add position"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="tradeForm__field">
        <label className="tradeForm__label">Ticker</label>
        <input
          className="tradeForm__input num"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="AAPL"
          autoFocus
          spellCheck={false}
          autoCapitalize="characters"
        />
        <div className="accountForm__hint">
          Use the Yahoo Finance symbol. Non-US listings need an exchange suffix —
          e.g. <code>2GB.DE</code> (XETRA), <code>0700.HK</code> (Hong Kong),{" "}
          <code>NESN.SW</code> (SIX). US tickers need no suffix.
        </div>
      </div>

      <div className="tradeForm__field">
        <label className="tradeForm__label">Name (optional)</label>
        <input
          className="tradeForm__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          spellCheck={false}
        />
      </div>

      <div className="tradeForm__grid">
        <div className="tradeForm__field">
          <label className="tradeForm__label">Quantity</label>
          <input
            className="tradeForm__input num"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            placeholder="100"
            inputMode="decimal"
            spellCheck={false}
          />
        </div>
        <div className="tradeForm__field">
          <label className="tradeForm__label">Avg cost / share</label>
          <input
            className="tradeForm__input num"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="accountForm__hint">
        Quantity and average cost drive cost basis and unrealized P/L. Adjust
        them after buying or selling part of a position.
      </div>
    </Modal>
  );
}
