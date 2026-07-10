import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Modal } from "@/components/primitives";
import { ACCOUNT_COLORS, defaultColorForUse, type AccountUse } from "@/lib/mock";
import {
  useAccountById,
  useAccounts,
  useAddAccount,
  useIbkrConnections,
  usePushToast,
  useRemoveAccount,
  useSetSelectedAccount,
  useUpdateAccount,
} from "@/store/selectors";

type AccountFormModalProps = {
  /** Omit to create; provide an id to edit. */
  accountId?: string;
  onClose: () => void;
};

/** Reporting currencies offered in the form — the common IBKR bases. */
const BASE_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "KRW",
  "HKD",
  "CAD",
  "AUD",
  "SGD",
  "TWD",
  "SEK",
  "NOK",
  "DKK",
] as const;

function dollarsToCents(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToDollars(cents: number): string {
  return cents === 0 ? "" : (cents / 100).toString();
}

export function AccountFormModal({ accountId, onClose }: AccountFormModalProps) {
  const editing = useAccountById(accountId);
  const accounts = useAccounts();
  const connections = useIbkrConnections();
  const addAccount = useAddAccount();
  const updateAccount = useUpdateAccount();
  const removeAccount = useRemoveAccount();
  const setSelected = useSetSelectedAccount();
  const pushToast = usePushToast();

  const isEdit = Boolean(editing);

  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState(
    editing?.color ??
      ACCOUNT_COLORS.find((c) => !accounts.some((a) => a.color === c)) ??
      ACCOUNT_COLORS[0],
  );
  const [cashStr, setCashStr] = useState(centsToDollars(editing?.cashCents ?? 0));
  const [contribStr, setContribStr] = useState(
    centsToDollars(editing?.netContributionsCents ?? 0),
  );
  const [connId, setConnId] = useState(editing?.flexConnectionId ?? "");
  const [baseCurrency, setBaseCurrency] = useState(editing?.baseCurrency ?? "USD");
  // On create, an untouched USD default stays UNSET so the first Flex sync
  // can auto-detect the real base; an explicit choice (or any edit-save)
  // pins it — sync fills base currency only when unset.
  const [baseTouched, setBaseTouched] = useState(isEdit);
  const [primaryUse, setPrimaryUse] = useState<AccountUse>(
    editing?.primaryUse ?? "mixed",
  );
  // An existing account already has a deliberate color; a fresh one doesn't.
  // While untouched, picking a primary use seeds the matching identity color.
  const [colorTouched, setColorTouched] = useState(isEdit);

  const pickUse = (use: AccountUse) => {
    setPrimaryUse(use);
    if (!colorTouched) {
      const c = defaultColorForUse(use);
      if (c) setColor(c);
    }
  };

  // A connection is selectable if it isn't already feeding another account.
  const available = connections.filter(
    (c) =>
      !accounts.some((a) => a.id !== accountId && a.flexConnectionId === c.id),
  );

  const canSave = name.trim().length > 0;

  const onSubmit = () => {
    const cashCents = dollarsToCents(cashStr);
    const netContributionsCents = dollarsToCents(contribStr);
    const flexConnectionId = connId || undefined;

    if (isEdit && accountId) {
      updateAccount(accountId, {
        name,
        color,
        cashCents,
        netContributionsCents,
        flexConnectionId,
        primaryUse,
        baseCurrency,
      });
      pushToast({ kind: "success", title: `${name.trim()} updated`, duration: 2500 });
    } else {
      const id = addAccount({
        name,
        color,
        cashCents,
        netContributionsCents,
        flexConnectionId,
        primaryUse,
        ...(baseTouched ? { baseCurrency } : {}),
      });
      setSelected(id);
      pushToast({ kind: "success", title: `${name.trim()} created`, duration: 2500 });
    }
    onClose();
  };

  const onDelete = () => {
    if (!editing || !accountId) return;
    if (
      !confirm(
        `Delete "${editing.name}"? Its holdings, trades, and setups are permanently removed.`,
      )
    ) {
      return;
    }
    removeAccount(accountId);
    pushToast({ kind: "info", title: `${editing.name} deleted`, duration: 3000 });
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Edit account" : "New account"}
      onClose={onClose}
      width={440}
      footer={
        <div className="accountForm__foot">
          {isEdit && (
            <Button className="btn--danger" onClick={onDelete}>
              <Trash2 size={13} strokeWidth={1.75} />
              <span>Delete</span>
            </Button>
          )}
          <div className="accountForm__footRight">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              onClick={onSubmit}
              disabled={!canSave}
              style={{
                background: "var(--accent)",
                borderColor: "var(--accent)",
                color: "#fff",
              }}
            >
              {isEdit ? "Save" : "Create account"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="tradeForm__field">
        <label className="tradeForm__label">Name</label>
        <input
          className="tradeForm__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Trading, Roth IRA"
          autoFocus
          spellCheck={false}
        />
      </div>

      <div className="tradeForm__field">
        <label className="tradeForm__label">Color</label>
        <div className="accountForm__swatches">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`accountForm__swatch${c === color ? " accountForm__swatch--active" : ""}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={c === color}
              onClick={() => {
                setColor(c);
                setColorTouched(true);
              }}
            />
          ))}
        </div>
      </div>

      <div className="tradeForm__field">
        <label className="tradeForm__label">Primary use</label>
        <div className="accountForm__useSeg" role="group" aria-label="Primary use">
          {(["trading", "investing", "mixed"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={primaryUse === u}
              className={`accountForm__useSegBtn${primaryUse === u ? " accountForm__useSegBtn--active" : ""}`}
              onClick={() => pickUse(u)}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="accountForm__hint">
          A soft hint — sets the default color and which lens leads on the
          Overview. Both lenses stay available regardless.
        </div>
      </div>

      <div className="tradeForm__grid">
        <div className="tradeForm__field">
          <label className="tradeForm__label">Cash balance</label>
          <input
            className="tradeForm__input num"
            value={cashStr}
            onChange={(e) => setCashStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            spellCheck={false}
          />
        </div>
        <div className="tradeForm__field">
          <label className="tradeForm__label" title="Net deposits − withdrawals">
            Net contributions
          </label>
          <input
            className="tradeForm__input num"
            value={contribStr}
            onChange={(e) => setContribStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="accountForm__hint">
        Return is measured as account value vs. net contributions. Leave
        contributions at 0 if you only want to track holdings value.
      </div>

      <div className="tradeForm__field">
        <label className="tradeForm__label">Base currency</label>
        <select
          className="tradeForm__select"
          value={baseCurrency}
          onChange={(e) => {
            setBaseCurrency(e.target.value);
            setBaseTouched(true);
          }}
        >
          {BASE_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="accountForm__hint">
          Values and P&L report in this currency; foreign positions convert
          at daily FX rates. Auto-detected from IBKR on first sync.
        </div>
      </div>

      <div className="tradeForm__field">
        <label className="tradeForm__label">IBKR Flex connection</label>
        <select
          className="tradeForm__select"
          value={connId}
          onChange={(e) => setConnId(e.target.value)}
        >
          <option value="">Manual only — no connection</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="accountForm__hint">
          Link a connection from Settings to auto-import this account's trades.
        </div>
      </div>
    </Modal>
  );
}
