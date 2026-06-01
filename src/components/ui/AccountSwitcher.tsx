import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Layers, Pencil, Plus } from "lucide-react";
import { formatCents } from "@/lib/money";
import { ALL_ACCOUNTS } from "@/store";
import type { Account } from "@/lib/mock";
import {
  useAccountValueCents,
  useAccounts,
  usePortfolioValueCents,
  useSelectedAccountId,
  useSetSelectedAccount,
} from "@/store/selectors";

type AccountSwitcherProps = {
  /** Open the create-account flow. */
  onNewAccount: () => void;
  /** Open the edit flow for a specific account. */
  onEditAccount?: (id: string) => void;
};

export function AccountSwitcher({ onNewAccount, onEditAccount }: AccountSwitcherProps) {
  const accounts = useAccounts();
  const selectedId = useSelectedAccountId();
  const setSelected = useSetSelectedAccount();
  const portfolioCents = usePortfolioValueCents();
  const selectedValueCents = useAccountValueCents(selectedId);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isAll = selectedId === ALL_ACCOUNTS;
  const selected = isAll
    ? undefined
    : accounts.find((a) => a.id === selectedId);

  // If the selected account vanished (deleted), fall back to the roll-up.
  const triggerName = isAll ? "All Accounts" : selected?.name ?? "All Accounts";
  const triggerValue = isAll ? portfolioCents : selectedValueCents;

  const pick = (id: string) => {
    setSelected(id);
    setOpen(false);
  };

  return (
    <div className="acctSwitcher" ref={rootRef}>
      <button
        type="button"
        className="acctSwitcher__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="acctSwitcher__identity">
          {isAll ? (
            <Layers size={14} strokeWidth={1.75} className="acctSwitcher__allIcon" />
          ) : (
            <span
              className="acctSwitcher__dot"
              style={{ background: selected?.color }}
            />
          )}
          <span className="acctSwitcher__name">{triggerName}</span>
        </span>
        <span className="acctSwitcher__value num">
          {triggerValue != null ? formatCents(triggerValue, true) : "—"}
        </span>
        <ChevronsUpDown size={14} strokeWidth={1.75} className="acctSwitcher__caret" />
      </button>

      {open && (
        <div className="acctSwitcher__menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={isAll}
            className={`acctSwitcher__row${isAll ? " acctSwitcher__row--active" : ""}`}
            onClick={() => pick(ALL_ACCOUNTS)}
          >
            <span className="acctSwitcher__rowMain">
              <Layers size={14} strokeWidth={1.75} className="acctSwitcher__allIcon" />
              <span className="acctSwitcher__rowName">All Accounts</span>
            </span>
            <span className="acctSwitcher__rowValue num">
              {portfolioCents != null ? formatCents(portfolioCents, true) : "—"}
            </span>
            {isAll && <Check size={13} strokeWidth={2} className="acctSwitcher__check" />}
          </button>

          <div className="acctSwitcher__divider" />

          {accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              active={a.id === selectedId}
              onPick={() => pick(a.id)}
              onEdit={onEditAccount ? () => {
                setOpen(false);
                onEditAccount(a.id);
              } : undefined}
            />
          ))}

          <div className="acctSwitcher__divider" />

          <button
            type="button"
            className="acctSwitcher__row acctSwitcher__row--new"
            onClick={() => {
              setOpen(false);
              onNewAccount();
            }}
          >
            <span className="acctSwitcher__rowMain">
              <Plus size={14} strokeWidth={2} />
              <span className="acctSwitcher__rowName">New account</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function AccountRow({
  account,
  active,
  onPick,
  onEdit,
}: {
  account: Account;
  active: boolean;
  onPick: () => void;
  onEdit?: () => void;
}) {
  const valueCents = useAccountValueCents(account.id);
  return (
    <div className={`acctSwitcher__row${active ? " acctSwitcher__row--active" : ""}`}>
      <button
        type="button"
        role="option"
        aria-selected={active}
        className="acctSwitcher__rowMain acctSwitcher__rowMain--btn"
        onClick={onPick}
      >
        <span className="acctSwitcher__dot" style={{ background: account.color }} />
        <span className="acctSwitcher__rowName">{account.name}</span>
      </button>
      <span className="acctSwitcher__rowValue num">
        {valueCents != null ? formatCents(valueCents, true) : "—"}
      </span>
      {active && <Check size={13} strokeWidth={2} className="acctSwitcher__check" />}
      {onEdit && (
        <button
          type="button"
          className="acctSwitcher__edit"
          title={`Edit ${account.name}`}
          aria-label={`Edit ${account.name}`}
          onClick={onEdit}
        >
          <Pencil size={12} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
