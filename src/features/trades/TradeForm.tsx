import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/primitives";
import { riskReward } from "@/lib/tradeMath";
import type {
  ExecutionAction,
  Market,
  Side,
  Trade,
  TradeExecution,
} from "@/lib/trades";
import { useLatestPrice } from "@/store/selectors";
import { SymbolPreview } from "./SymbolPreview";

const MARKETS: Market[] = ["STOCK", "OPTION", "CRYPTO", "FOREX", "FUTURE"];

/** Seed values for a fresh form — used when converting a setup to a trade. */
export type TradePrefill = {
  symbol: string;
  side: Side;
  market: Market;
  targetCents?: number;
  stopCents?: number;
  entryCents?: number;
  notes?: string;
};

type FormExec = {
  id: string;
  action: ExecutionAction;
  at: string;     // datetime-local string
  qty: string;
  price: string;  // dollars
  fee: string;    // dollars
};

type FormState = {
  market: Market;
  symbol: string;
  side: Side;
  entry: string;
  target: string;
  stop: string;
  notes: string;
  tags: string;
  confidence: string;
  execs: FormExec[];
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocal(): string {
  return toDatetimeLocal(new Date().toISOString());
}

function dollarsToCents(s: string): number {
  const f = parseFloat(s);
  if (Number.isNaN(f)) return 0;
  return Math.round(f * 100);
}

function centsToDollars(cents: number | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function initialFromTrade(trade?: Trade, prefill?: TradePrefill): FormState {
  if (!trade) {
    return {
      market: prefill?.market ?? "STOCK",
      symbol: prefill?.symbol ?? "",
      side: prefill?.side ?? "LONG",
      entry: centsToDollars(prefill?.entryCents),
      target: centsToDollars(prefill?.targetCents),
      stop: centsToDollars(prefill?.stopCents),
      notes: prefill?.notes ?? "",
      tags: "",
      confidence: "",
      execs: [
        {
          id: uid(),
          action: (prefill?.side ?? "LONG") === "LONG" ? "BUY" : "SELL",
          at: nowLocal(),
          qty: "",
          price: centsToDollars(prefill?.entryCents),
          fee: "0",
        },
      ],
    };
  }
  // Entry mirrors the opening-side fill — the price you actually got in at.
  const openingAction: ExecutionAction = trade.side === "LONG" ? "BUY" : "SELL";
  const entryExec =
    trade.executions.find((e) => e.action === openingAction) ?? trade.executions[0];
  return {
    market: trade.market,
    symbol: trade.symbol,
    side: trade.side,
    entry: entryExec ? centsToDollars(entryExec.priceCents) : "",
    target: centsToDollars(trade.targetCents),
    stop: centsToDollars(trade.stopCents),
    notes: trade.notes ?? "",
    tags: trade.tags.join(", "),
    confidence: trade.confidence != null ? String(trade.confidence) : "",
    execs: trade.executions.map((e) => ({
      id: e.id,
      action: e.action,
      at: toDatetimeLocal(e.at),
      qty: String(e.qty),
      price: centsToDollars(e.priceCents),
      fee: centsToDollars(e.feeCents),
    })),
  };
}

type TradeFormProps = {
  trade?: Trade;
  /** Pre-fill the symbol field (e.g. when opened from cmd+k). */
  initialSymbol?: string;
  /** Seed a fresh form from a trade setup (convert-to-trade flow). */
  prefill?: TradePrefill;
  /** Returns the assembled patch ready to merge into a Trade. */
  onSubmit: (data: {
    market: Market;
    symbol: string;
    side: Side;
    targetCents?: number;
    stopCents?: number;
    executions: TradeExecution[];
    notes?: string;
    tags: string[];
    confidence?: 1 | 2 | 3 | 4 | 5;
  }) => void;
  submitLabel: string;
  onDelete?: () => void;
};

export function TradeForm({
  trade,
  initialSymbol,
  prefill,
  onSubmit,
  submitLabel,
  onDelete,
}: TradeFormProps) {
  const [form, setForm] = useState<FormState>(() => {
    const initial = initialFromTrade(trade, prefill);
    if (initialSymbol && !trade && !prefill) {
      initial.symbol = initialSymbol.toUpperCase();
    }
    return initial;
  });
  // Symbol is "locked" — preview chart shown — only after blur or Enter.
  // Avoids hammering Yahoo while the user is mid-type.
  const [lockedSymbol, setLockedSymbol] = useState<string>(() => {
    if (trade) return trade.symbol;
    if (prefill) return prefill.symbol.toUpperCase();
    if (initialSymbol) return initialSymbol.toUpperCase();
    return "";
  });

  // Debounced auto-lock: 600ms after typing stops we commit even without blur.
  useEffect(() => {
    const candidate = form.symbol.trim().toUpperCase();
    if (!candidate || candidate === lockedSymbol) return;
    const t = window.setTimeout(() => setLockedSymbol(candidate), 600);
    return () => window.clearTimeout(t);
  }, [form.symbol, lockedSymbol]);

  const lockSymbol = () => {
    const candidate = form.symbol.trim().toUpperCase();
    if (candidate && candidate !== lockedSymbol) {
      setLockedSymbol(candidate);
      if (candidate !== form.symbol) {
        setForm((f) => ({ ...f, symbol: candidate }));
      }
    }
  };

  // Default the entry to the live market price once it loads (new trades only),
  // and seed the opening execution's fill from it. Seeded at most once per
  // symbol so the user stays free to clear or override it afterward.
  const latest = useLatestPrice(lockedSymbol);
  const marketSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (trade) return; // editing an existing trade: leave levels untouched
    if (!lockedSymbol || latest == null) return;
    if (marketSeededRef.current === lockedSymbol) return;
    marketSeededRef.current = lockedSymbol;
    setForm((f) => {
      if (f.entry.trim()) return f; // user already set an entry
      const priceStr = latest.toFixed(2);
      const opening: ExecutionAction = f.side === "LONG" ? "BUY" : "SELL";
      const rowId = (f.execs.find((e) => e.action === opening) ?? f.execs[0])?.id;
      return {
        ...f,
        entry: priceStr,
        execs: f.execs.map((e) =>
          e.id === rowId && !e.price ? { ...e, price: priceStr } : e,
        ),
      };
    });
  }, [trade, lockedSymbol, latest]);

  // Entry is the R:R anchor; the opening fill defaults to it until the user
  // types a fill of their own — then the two are independent.
  const setEntry = (value: string) =>
    setForm((f) => {
      const opening: ExecutionAction = f.side === "LONG" ? "BUY" : "SELL";
      const rowId = (f.execs.find((e) => e.action === opening) ?? f.execs[0])?.id;
      return {
        ...f,
        entry: value,
        execs: f.execs.map((e) =>
          e.id === rowId && !e.price ? { ...e, price: value } : e,
        ),
      };
    });

  const updateExec = (id: string, patch: Partial<FormExec>) =>
    setForm((f) => ({
      ...f,
      execs: f.execs.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));

  // FormExec.at stays a single "YYYY-MM-DDTHH:MM" string; the table renders
  // it as separate date + time inputs and reassembles on change.
  const setExecDate = (ex: FormExec, date: string) =>
    updateExec(ex.id, { at: `${date || ex.at.slice(0, 10)}T${ex.at.slice(11, 16) || "00:00"}` });
  const setExecTime = (ex: FormExec, time: string) =>
    updateExec(ex.id, { at: `${ex.at.slice(0, 10)}T${time || "00:00"}` });

  const addExec = () => {
    const lastAction = form.execs[form.execs.length - 1]?.action ?? "BUY";
    const newAction: ExecutionAction = lastAction === "BUY" ? "SELL" : "BUY";
    setForm((f) => ({
      ...f,
      execs: [
        ...f.execs,
        {
          id: uid(),
          action: newAction,
          at: nowLocal(),
          qty: "",
          price: "",
          fee: "0",
        },
      ],
    }));
  };

  const removeExec = (id: string) =>
    setForm((f) => ({
      ...f,
      execs: f.execs.filter((e) => e.id !== id),
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const executions: TradeExecution[] = form.execs
      .filter((ex) => ex.qty && ex.price)
      .map((ex) => ({
        id: ex.id,
        action: ex.action,
        at: new Date(ex.at).toISOString(),
        qty: parseInt(ex.qty, 10),
        priceCents: dollarsToCents(ex.price),
        feeCents: dollarsToCents(ex.fee || "0"),
      }));

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const confidence =
      form.confidence && /^[1-5]$/.test(form.confidence)
        ? (parseInt(form.confidence, 10) as 1 | 2 | 3 | 4 | 5)
        : undefined;

    onSubmit({
      market: form.market,
      symbol: form.symbol.toUpperCase().trim(),
      side: form.side,
      targetCents: form.target ? dollarsToCents(form.target) : undefined,
      stopCents: form.stop ? dollarsToCents(form.stop) : undefined,
      executions,
      notes: form.notes.trim() || undefined,
      tags,
      confidence,
    });
  };

  // Live R:R from the planned levels. Anchor on the top-level entry, falling
  // back to the first priced fill if the entry field is left blank.
  const openingAction: ExecutionAction = form.side === "LONG" ? "BUY" : "SELL";
  const entryExec =
    form.execs.find((e) => e.action === openingAction && e.price) ??
    form.execs.find((e) => e.price);
  const entryCents = form.entry.trim()
    ? dollarsToCents(form.entry)
    : entryExec
      ? dollarsToCents(entryExec.price)
      : null;
  const rr = riskReward(
    entryCents,
    form.target ? dollarsToCents(form.target) : null,
    form.stop ? dollarsToCents(form.stop) : null,
    form.side,
  );

  // Prevent accidental form submission on Enter from any text input.
  // ⌘↵ / ctrl+↵ submits from anywhere (textarea included); plain Enter on
  // the symbol field locks the symbol in.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
      return;
    }
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    if (
      target.tagName === "BUTTON" &&
      (target as HTMLButtonElement).type === "submit"
    ) {
      return;
    }
    e.preventDefault();
    if (target.tagName === "INPUT" && (target as HTMLInputElement).dataset.field === "symbol") {
      lockSymbol();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={onFormKeyDown}
      style={{ display: "contents" }}
    >
      <div className="modal__body">
        <div className="tradeForm__row tradeForm__row--head">
          <div className="tradeForm__field">
            <label className="tradeForm__label">Market</label>
            <select
              className="tradeForm__select"
              value={form.market}
              onChange={(e) => setForm({ ...form, market: e.target.value as Market })}
            >
              {MARKETS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="tradeForm__field">
            <label className="tradeForm__label">Symbol</label>
            <input
              className="tradeForm__input"
              data-field="symbol"
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              onBlur={lockSymbol}
              placeholder="NVDA"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="tradeForm__field">
            <label className="tradeForm__label">Side</label>
            <div className="tradeForm__sideSeg" role="radiogroup" aria-label="Side">
              {(["LONG", "SHORT"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={form.side === s}
                  className={
                    form.side === s
                      ? `tradeForm__sideSegBtn tradeForm__sideSegBtn--${s.toLowerCase()}`
                      : "tradeForm__sideSegBtn"
                  }
                  onClick={() => setForm({ ...form, side: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tradeForm__row tradeForm__row--levels">
          <div className="tradeForm__field">
            <label className="tradeForm__label">Entry</label>
            <input
              className="tradeForm__input num"
              value={form.entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
          <div className="tradeForm__field">
            <label className="tradeForm__label">Target</label>
            <input
              className="tradeForm__input num"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
          <div className="tradeForm__field">
            <label className="tradeForm__label">Stop-Loss</label>
            <input
              className="tradeForm__input num"
              value={form.stop}
              onChange={(e) => setForm({ ...form, stop: e.target.value })}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
          <div className="tradeForm__field">
            <label className="tradeForm__label">R : R</label>
            <div
              className={rr != null && rr >= 2 ? "tradeForm__rr tradeForm__rr--good" : "tradeForm__rr"}
              title="Reward-to-risk from entry, target and stop"
            >
              {rr == null ? "—" : `${rr.toFixed(1)} : 1`}
            </div>
          </div>
        </div>

        {lockedSymbol && (
          <>
            <SymbolPreview symbol={lockedSymbol} />

        <div className="tradeForm__execTable">
          <div className="tradeForm__execCols tradeForm__execHead">
            <span className="tradeForm__execHeadLabel">Action</span>
            <span className="tradeForm__execHeadLabel">Date</span>
            <span className="tradeForm__execHeadLabel">Time</span>
            <span className="tradeForm__execHeadLabel tradeForm__execHeadLabel--num">Quantity</span>
            <span className="tradeForm__execHeadLabel tradeForm__execHeadLabel--num">Price</span>
            <span className="tradeForm__execHeadLabel tradeForm__execHeadLabel--num">Fee</span>
            <span />
          </div>

          {form.execs.map((ex) => (
            <div className="tradeForm__execCols tradeForm__execRow" key={ex.id}>
              <button
                type="button"
                className={`tradeForm__execAction tradeForm__execAction--${ex.action.toLowerCase()}`}
                onClick={() => updateExec(ex.id, { action: ex.action === "BUY" ? "SELL" : "BUY" })}
                title="Toggle buy / sell"
              >
                {ex.action}
              </button>
              <input
                type="date"
                className="tradeForm__execInput"
                value={ex.at.slice(0, 10)}
                onChange={(e) => setExecDate(ex, e.target.value)}
                aria-label="Execution date"
              />
              <input
                type="time"
                className="tradeForm__execInput"
                value={ex.at.slice(11, 16)}
                onChange={(e) => setExecTime(ex, e.target.value)}
                aria-label="Execution time"
              />
              <input
                className="tradeForm__execInput tradeForm__execInput--num"
                inputMode="numeric"
                value={ex.qty}
                onChange={(e) => updateExec(ex.id, { qty: e.target.value })}
                placeholder="0"
                aria-label="Quantity"
              />
              <input
                className="tradeForm__execInput tradeForm__execInput--num"
                inputMode="decimal"
                value={ex.price}
                onChange={(e) => updateExec(ex.id, { price: e.target.value })}
                placeholder="0.00"
                aria-label="Price"
              />
              <input
                className="tradeForm__execInput tradeForm__execInput--num"
                inputMode="decimal"
                value={ex.fee}
                onChange={(e) => updateExec(ex.id, { fee: e.target.value })}
                placeholder="0.00"
                aria-label="Fee"
              />
              {form.execs.length > 1 ? (
                <button
                  type="button"
                  className="tradeForm__execX"
                  onClick={() => removeExec(ex.id)}
                  title="Remove execution"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}

          <button
            type="button"
            className="tradeForm__execAddRow"
            onClick={addExec}
          >
            <Plus size={13} strokeWidth={1.75} />
            <span>Add execution</span>
          </button>
        </div>

        <div className="tradeForm__sectionLabel">Journal</div>

        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <div className="tradeForm__field">
            <label className="tradeForm__label">Notes</label>
            <textarea
              className="tradeForm__input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              style={{ height: "auto", padding: "var(--space-3)", resize: "vertical", fontFamily: "var(--font-ui)" }}
              placeholder="Why this trade? What did you see?"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-3)" }}>
            <div className="tradeForm__field">
              <label className="tradeForm__label">Tags</label>
              <input
                className="tradeForm__input"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="breakout, momentum"
              />
            </div>
            <div className="tradeForm__field">
              <label className="tradeForm__label">Confidence (1-5)</label>
              <input
                className="tradeForm__input num"
                inputMode="numeric"
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: e.target.value })}
                placeholder="3"
                maxLength={1}
              />
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      <div className="modal__foot">
        {onDelete ? (
          <button
            type="button"
            className="btn"
            onClick={onDelete}
            style={{
              background: "var(--loss-muted)",
              borderColor: "transparent",
              color: "var(--loss)",
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn--primary">
          <span>{submitLabel}</span>
          <Kbd>⌘↵</Kbd>
        </button>
      </div>
    </form>
  );
}
