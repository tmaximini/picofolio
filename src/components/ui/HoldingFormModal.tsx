import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Modal } from "@/components/primitives";
import type { Holding } from "@/lib/mock";
import { searchYahoo, type YahooSearchHit } from "@/lib/yahoo";
import {
  useAddHolding,
  useLoadPrice,
  usePriceCurrency,
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

const SEARCH_DEBOUNCE_MS = 250;

export function HoldingFormModal({ accountId, holding, onClose }: HoldingFormModalProps) {
  const addHolding = useAddHolding();
  const updateHolding = useUpdateHolding();
  const removeHolding = useRemoveHolding();
  const loadPrice = useLoadPrice();
  const pushToast = usePushToast();

  const isEdit = Boolean(holding);

  const [symbol, setSymbol] = useState(holding?.symbol ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [qtyStr, setQtyStr] = useState(holding ? String(holding.qty) : "");
  const [costStr, setCostStr] = useState(
    holding ? (holding.avgCostCents / 100).toString() : "",
  );

  // ---- Symbol autocomplete (Yahoo search) ----
  const [hits, setHits] = useState<YahooSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [picked, setPicked] = useState<YahooSearchHit | null>(null);
  // True while the Name field holds an autofilled (not user-typed) value —
  // a later pick may overwrite it; a hand-edited name is never clobbered.
  const nameAutofilled = useRef(false);
  // Skip the next search when the input change came from picking a hit.
  const skipSearchFor = useRef<string | null>(holding?.symbol ?? null);
  const debounceRef = useRef<number | null>(null);
  // Stale-response guard — only the latest in-flight query may set state.
  const queryTicket = useRef(0);

  // Quote currency confirms once the picked symbol's series lands.
  const pickedCurrency = usePriceCurrency(picked?.symbol ?? "");

  useEffect(() => {
    const q = symbol.trim();
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    if (q.length < 2 || q === skipSearchFor.current) {
      setHits([]);
      setOpen(false);
      return;
    }
    const ticket = ++queryTicket.current;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const found = await searchYahoo(q);
        if (queryTicket.current !== ticket) return;
        setHits(found);
        setActiveIdx(0);
        setOpen(found.length > 0);
      } catch {
        // Search is a convenience — a failed lookup must never block typing
        // a symbol by hand (the original flow).
        if (queryTicket.current === ticket) {
          setHits([]);
          setOpen(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [symbol]);

  const pick = (hit: YahooSearchHit) => {
    skipSearchFor.current = hit.symbol;
    setSymbol(hit.symbol);
    if (!name.trim() || nameAutofilled.current) {
      setName(hit.name);
      nameAutofilled.current = true;
    }
    setPicked(hit);
    setOpen(false);
    // Warm the series now: confirms the quote currency inline and has the
    // chart ready the moment the position is saved.
    void loadPrice(hit.symbol);
  };

  const onSymbolKeyDown = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(hits[activeIdx]!);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };

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
        <div className="symbolSearch__anchor">
        <input
          className="tradeForm__input num"
          style={{ width: "100%" }}
          value={symbol}
          onChange={(e) => {
            skipSearchFor.current = null;
            setPicked(null);
            setSymbol(e.target.value);
          }}
          onKeyDown={onSymbolKeyDown}
          onBlur={() => setOpen(false)}
          placeholder="Search name or ticker — AAPL, SK hynix, 0700.HK…"
          autoFocus
          spellCheck={false}
          autoCapitalize="characters"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {open && (
          <ul className="symbolSearch" role="listbox">
            {hits.map((h, i) => (
              <li
                key={h.symbol}
                role="option"
                aria-selected={i === activeIdx}
                className={
                  i === activeIdx
                    ? "symbolSearch__item symbolSearch__item--active"
                    : "symbolSearch__item"
                }
                // mousedown, not click — fires before the input's blur
                // closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(h);
                }}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className="symbolSearch__sym num">{h.symbol}</span>
                <span className="symbolSearch__name">{h.name}</span>
                <span className="symbolSearch__exch">{h.exchange}</span>
              </li>
            ))}
          </ul>
        )}
        </div>
        {picked ? (
          <div className="accountForm__hint symbolSearch__confirm">
            {picked.name} · {picked.exchange} · {picked.type}
            {pickedCurrency ? ` · quoted in ${pickedCurrency}` : ""}
          </div>
        ) : (
          <div className="accountForm__hint">
            Search by company name or ticker. Non-US listings carry an exchange
            suffix — e.g. <code>2GB.DE</code> (XETRA), <code>0700.HK</code>{" "}
            (Hong Kong), <code>NESN.SW</code> (SIX).
          </div>
        )}
      </div>

      <div className="tradeForm__field">
        <label className="tradeForm__label">Name (optional)</label>
        <input
          className="tradeForm__input"
          value={name}
          onChange={(e) => {
            nameAutofilled.current = false;
            setName(e.target.value);
          }}
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
          <label className="tradeForm__label">
            Avg cost / share
            {(holding?.currency ?? pickedCurrency)
              ? ` (${holding?.currency ?? pickedCurrency})`
              : ""}
          </label>
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
