import { useState } from "react";
import { Check, Plus, Settings2, Trash2 } from "lucide-react";
import { Button, ConfirmButton } from "@/components/primitives";
import { ACCOUNT_COLORS } from "@/lib/mock";
import type { ReviewLabel, ReviewLabelKind } from "@/lib/review";
import {
  useAddReviewLabel,
  useRemoveReviewLabel,
  useReviewLabels,
  useUpdateReviewLabel,
} from "@/store/selectors";

const KINDS: { kind: ReviewLabelKind; title: string }[] = [
  { kind: "mistake", title: "Mistakes" },
  { kind: "good", title: "Did well" },
];

/** Labels in display order — the order the 1–9 shortcuts follow. */
export function orderedLabels(labels: ReviewLabel[]): ReviewLabel[] {
  return KINDS.flatMap(({ kind }) => labels.filter((l) => l.kind === kind));
}

type LabelPickerProps = {
  selected: string[];
  onToggle: (id: string) => void;
};

/**
 * Toggle chips grouped into mistakes and good habits, each with its colour
 * dot and (for the first nine) a number shortcut. "Manage" edits the set:
 * rename, recolour, change kind, delete, add.
 */
export function LabelPicker({ selected, onToggle }: LabelPickerProps) {
  const labels = useReviewLabels();
  const [managing, setManaging] = useState(false);
  const ordered = orderedLabels(labels);

  return (
    <div className="labelPicker">
      {KINDS.map(({ kind, title }) => (
        <div className="labelPicker__group" key={kind}>
          <div className="labelPicker__title">{title}</div>
          <div className="labelPicker__chips">
            {labels
              .filter((l) => l.kind === kind)
              .map((l) => {
                const on = selected.includes(l.id);
                const n = ordered.indexOf(l) + 1;
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={on ? `labelChip labelChip--on labelChip--${kind}` : "labelChip"}
                    aria-pressed={on}
                    onClick={(e) => {
                      onToggle(l.id);
                      // Mouse clicks drop focus so ↵ goes back to "mark reviewed".
                      if (e.detail > 0) e.currentTarget.blur();
                    }}
                  >
                    <i style={{ background: l.color }} aria-hidden />
                    <span>{l.name}</span>
                    {n <= 9 && <span className="labelChip__key num">{n}</span>}
                    {on && <Check size={11} strokeWidth={2} />}
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      <div className="labelPicker__foot">
        <button type="button" className="linkBtn labelPicker__manage" onClick={() => setManaging((v) => !v)}>
          <Settings2 size={12} strokeWidth={1.75} />
          {managing ? "Done editing labels" : "Edit labels"}
        </button>
      </div>

      {managing && <LabelManager labels={labels} />}
    </div>
  );
}

function LabelManager({ labels }: { labels: ReviewLabel[] }) {
  const add = useAddReviewLabel();
  const update = useUpdateReviewLabel();
  const remove = useRemoveReviewLabel();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ReviewLabelKind>("mistake");
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[4]);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    add({ name: n, kind, color });
    setName("");
  };

  return (
    <div className="labelManager">
      {labels.map((l) => (
        <div className="labelManager__row" key={l.id}>
          <Swatches value={l.color} onChange={(c) => update(l.id, { color: c })} />
          <input
            className="tradeForm__input labelManager__name"
            value={l.name}
            onChange={(e) => update(l.id, { name: e.target.value })}
            aria-label="Label name"
          />
          <KindToggle value={l.kind} onChange={(k) => update(l.id, { kind: k })} />
          <ConfirmButton confirmLabel="Delete?" onConfirm={() => remove(l.id)} title="Delete label — removed from every review">
            <Trash2 size={12} strokeWidth={1.75} />
          </ConfirmButton>
        </div>
      ))}

      <div className="labelManager__row labelManager__row--new">
        <Swatches value={color} onChange={setColor} />
        <input
          className="tradeForm__input labelManager__name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
          placeholder="New label, e.g. “Traded the news”"
          aria-label="New label name"
        />
        <KindToggle value={kind} onChange={setKind} />
        <Button onClick={create} disabled={!name.trim()}>
          <Plus size={12} strokeWidth={2} />
          <span>Add</span>
        </Button>
      </div>
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Colour">
      {ACCOUNT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={`Colour ${c}`}
          className={c === value ? "swatches__dot swatches__dot--on" : "swatches__dot"}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function KindToggle({ value, onChange }: { value: ReviewLabelKind; onChange: (k: ReviewLabelKind) => void }) {
  return (
    <div className="chartSource" role="radiogroup" aria-label="Kind">
      {KINDS.map(({ kind, title }) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value === kind}
          className={value === kind ? "chartSource__seg chartSource__seg--active" : "chartSource__seg"}
          onClick={() => onChange(kind)}
        >
          {title === "Did well" ? "Good" : "Mistake"}
        </button>
      ))}
    </div>
  );
}
