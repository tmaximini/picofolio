import { Pencil, RefreshCw, X } from "lucide-react";
import type { TradeSetup } from "@/lib/trades";
import { formatCents } from "@/lib/money";
import { riskReward } from "@/lib/tradeMath";
import { useDeleteSetup } from "@/store/selectors";

export function TradeSetupRow({
  setup,
  onConvert,
  onEdit,
}: {
  setup: TradeSetup;
  onConvert?: () => void;
  onEdit?: () => void;
}) {
  const deleteSetup = useDeleteSetup();
  const rr = riskReward(setup.entryCents, setup.targetCents, setup.stopCents, setup.side);
  const dateLabel = new Date(setup.createdAt).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

  const sideClass =
    setup.side === "LONG"
      ? "setupRow__chip--side setupRow__chip--side--long"
      : "setupRow__chip--side setupRow__chip--side--short";

  return (
    <div className="setupRow">
      <span className="setupRow__label">Trade Setup · {dateLabel}</span>
      <div className="setupRow__chain">
        <span className={sideClass}>{setup.side === "LONG" ? "LONG" : "SHORT"}</span>
        <span className="setupRow__sep" />
        <span className="setupRow__chip setupRow__chip--sym">${setup.symbol}</span>
        <span className="setupRow__sep" />
        <span className="setupRow__chip">@ {formatCents(setup.entryCents)}</span>
        <span className="setupRow__sep" />
        <span className="setupRow__chip setupRow__chip--target">
          T: {formatCents(setup.targetCents)}
        </span>
        <span className="setupRow__sep" />
        <span className="setupRow__chip setupRow__chip--stop">
          S: {formatCents(setup.stopCents)}
        </span>
        {rr != null && (
          <>
            <span className="setupRow__sep" />
            <span
              className={
                rr >= 2
                  ? "setupRow__chip setupRow__chip--target"
                  : "setupRow__chip"
              }
            >
              R:R {rr.toFixed(1)}
            </span>
          </>
        )}
        {setup.notes && <span className="setupRow__notes">{setup.notes}</span>}
      </div>
      <div className="setupRow__actions">
        {onEdit && (
          <button
            type="button"
            className="setupRow__iconBtn"
            title="Edit setup"
            onClick={onEdit}
          >
            <Pencil size={12} strokeWidth={1.75} />
          </button>
        )}
        {onConvert && (
          <button
            type="button"
            className="setupRow__iconBtn"
            title="Convert to trade"
            onClick={onConvert}
          >
            <RefreshCw size={12} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className="setupRow__iconBtn"
          title="Delete setup"
          onClick={() => deleteSetup(setup.id)}
        >
          <X size={12} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
