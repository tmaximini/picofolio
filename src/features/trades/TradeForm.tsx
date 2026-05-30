import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ExecutionAction,
  Market,
  Side,
  Trade,
  TradeExecution,
} from "@/lib/trades";
import { SymbolPreview } from "./SymbolPreview";

const MARKETS: Market[] = ["STOCK", "OPTION", "CRYPTO", "FOREX", "FUTURE"];

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

function initialFromTrade(trade?: Trade): FormState {
  if (!trade) {
    return {
      market: "STOCK",
      symbol: "",
      side: "LONG",
      target: "",
      stop: "",
      notes: "",
      tags: "",
      confidence: "",
      execs: [
        {
          id: uid(),
          action: "BUY",
          at: nowLocal(),
          qty: "",
          price: "",
          fee: "0",
        },
      ],
    };
  }
  return {
    market: trade.market,
    symbol: trade.symbol,
    side: trade.side,
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
  tab: "general" | "journal";
  onTabChange: (next: "general" | "journal") => void;
};

export function TradeForm({
  trade,
  initialSymbol,
  onSubmit,
  submitLabel,
  onDelete,
  tab,
  onTabChange,
}: TradeFormProps) {
  const [form, setForm] = useState<FormState>(() => {
    const initial = initialFromTrade(trade);
    if (initialSymbol && !trade) {
      initial.symbol = initialSymbol.toUpperCase();
    }
    return initial;
  });
  // Symbol is "locked" — preview chart shown — only after blur or Enter.
  // Avoids hammering Yahoo while the user is mid-type.
  const [lockedSymbol, setLockedSymbol] = useState<string>(() => {
    if (trade) return trade.symbol;
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

  const updateExec = (id: string, patch: Partial<FormExec>) =>
    setForm((f) => ({
      ...f,
      execs: f.execs.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));

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

  const sideToggleClass =
    form.side === "LONG"
      ? "tradeForm__sideToggle tradeForm__sideToggle--long"
      : "tradeForm__sideToggle tradeForm__sideToggle--short";

  // Prevent accidental form submission on Enter from any text input.
  // The Save button is the only path that commits a trade. textarea
  // newlines and explicit submit are exempt.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    if (
      target.tagName === "BUTTON" &&
      (target as HTMLButtonElement).type === "submit"
    ) {
      return;
    }
    e.preventDefault();
    // If the focused element is the symbol input, lock it in instead.
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
      <div className="modal__tabs">
        <button
          type="button"
          className={tab === "general" ? "modal__tab modal__tab--active" : "modal__tab"}
          onClick={() => onTabChange("general")}
        >
          General
        </button>
        <button
          type="button"
          className={tab === "journal" ? "modal__tab modal__tab--active" : "modal__tab"}
          onClick={() => onTabChange("journal")}
        >
          Journal
        </button>
      </div>

      <div className="modal__body">
        {tab === "general" ? (
          <>
            <div className="tradeForm__grid">
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 64px", gap: "var(--space-2)" }}>
                  <input
                    className="tradeForm__input num"
                    value={form.stop}
                    onChange={(e) => setForm({ ...form, stop: e.target.value })}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    className={sideToggleClass}
                    onClick={() =>
                      setForm({ ...form, side: form.side === "LONG" ? "SHORT" : "LONG" })
                    }
                    title="Toggle side"
                  >
                    {form.side}
                  </button>
                </div>
              </div>
            </div>

            {lockedSymbol && <SymbolPreview symbol={lockedSymbol} />}

            <div className="tradeForm__execRowHead">
              <span />
              <span className="tradeForm__execHeadLabel">Action</span>
              <span className="tradeForm__execHeadLabel">Date / Time</span>
              <span className="tradeForm__execHeadLabel" style={{ textAlign: "right" }}>Quantity</span>
              <span className="tradeForm__execHeadLabel" style={{ textAlign: "right" }}>Price</span>
              <span className="tradeForm__execHeadLabel" style={{ textAlign: "right" }}>Fee</span>
            </div>

            {form.execs.map((ex) => (
              <div className="tradeForm__execRow" key={ex.id}>
                <button
                  type="button"
                  className="tradeForm__execRemove"
                  onClick={() => removeExec(ex.id)}
                  title="Remove execution"
                  disabled={form.execs.length === 1}
                >
                  <X size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={`tradeForm__execAction tradeForm__execAction--${ex.action.toLowerCase()}`}
                  onClick={() => updateExec(ex.id, { action: ex.action === "BUY" ? "SELL" : "BUY" })}
                >
                  {ex.action}
                </button>
                <input
                  type="datetime-local"
                  className="tradeForm__input num"
                  value={ex.at}
                  onChange={(e) => updateExec(ex.id, { at: e.target.value })}
                />
                <input
                  className="tradeForm__input num"
                  inputMode="numeric"
                  value={ex.qty}
                  onChange={(e) => updateExec(ex.id, { qty: e.target.value })}
                  style={{ textAlign: "right" }}
                />
                <input
                  className="tradeForm__input num"
                  inputMode="decimal"
                  value={ex.price}
                  onChange={(e) => updateExec(ex.id, { price: e.target.value })}
                  style={{ textAlign: "right" }}
                />
                <input
                  className="tradeForm__input num"
                  inputMode="decimal"
                  value={ex.fee}
                  onChange={(e) => updateExec(ex.id, { fee: e.target.value })}
                  style={{ textAlign: "right" }}
                />
              </div>
            ))}

            <button
              type="button"
              className="tradeForm__execAdd"
              onClick={addExec}
              title="Add execution"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <div className="tradeForm__field">
              <label className="tradeForm__label">Notes</label>
              <textarea
                className="tradeForm__input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={5}
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
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
