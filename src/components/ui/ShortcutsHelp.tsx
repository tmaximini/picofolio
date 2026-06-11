import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ShortcutsHelpProps = {
  onClose: () => void;
};

type ShortcutGroup = {
  title: string;
  rows: { keys: string[]; label: string }[];
};

const GROUPS: ShortcutGroup[] = [
  {
    title: "Navigate",
    rows: [
      { keys: ["g", "o"], label: "Overview" },
      { keys: ["g", "a"], label: "Activity" },
      { keys: ["g", "c"], label: "Calendar" },
      { keys: ["g", "h"], label: "Holdings" },
      { keys: ["g", "s"], label: "Settings" },
      { keys: ["⌘K"], label: "Command palette" },
    ],
  },
  {
    title: "Create",
    rows: [
      { keys: ["n"], label: "New trade" },
      { keys: ["s"], label: "New setup" },
      { keys: ["b"], label: "New note" },
    ],
  },
  {
    title: "Actions",
    rows: [
      { keys: ["r"], label: "Sync prices" },
      { keys: ["?"], label: "This overlay" },
    ],
  },
  {
    title: "In forms",
    rows: [
      { keys: ["⌘↵"], label: "Save trade / note" },
      { keys: ["↵"], label: "Save setup" },
      { keys: ["esc"], label: "Close" },
    ],
  },
];

export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="shortcutsHelp"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="shortcutsHelp__head">
          <span className="shortcutsHelp__title">Keyboard Shortcuts</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="shortcutsHelp__grid">
          {GROUPS.map((g) => (
            <div className="shortcutsHelp__group" key={g.title}>
              <div className="shortcutsHelp__groupTitle">{g.title}</div>
              {g.rows.map((row) => (
                <div className="shortcutsHelp__row" key={row.label}>
                  <span className="shortcutsHelp__label">{row.label}</span>
                  <span className="shortcutsHelp__keys">
                    {row.keys.map((k, i) => (
                      <kbd className="kbd" key={i}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
