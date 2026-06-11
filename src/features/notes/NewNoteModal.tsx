import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Kbd } from "@/components/primitives";
import { extractNoteTokens, type Note } from "@/lib/notes";
import { ALL_ACCOUNTS } from "@/store";
import {
  useAddNote,
  useDeleteNote,
  useSelectedAccountId,
  useUpdateNote,
} from "@/store/selectors";

type NewNoteModalProps = {
  onClose: () => void;
  /** Edit an existing note instead of creating a new one. */
  note?: Note;
};

function timestampLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NewNoteModal({ onClose, note }: NewNoteModalProps) {
  const [body, setBody] = useState(note?.body ?? "");
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const selectedAccountId = useSelectedAccountId();
  // Notes are stamped when the modal opens (or keep the original on edit).
  const [createdAt] = useState(() => note?.createdAt ?? new Date().toISOString());

  const { symbols, tags } = useMemo(() => extractNoteTokens(body), [body]);
  const canSave = body.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const save = () => {
    if (!canSave) return;
    const trimmed = body.trim();
    if (note) {
      updateNote(note.id, { body: trimmed });
    } else {
      addNote({
        id: `nt-${Math.random().toString(36).slice(2, 10)}`,
        accountId:
          selectedAccountId !== ALL_ACCOUNTS ? selectedAccountId : undefined,
        body: trimmed,
        symbols,
        tags,
        createdAt,
      });
    }
    onClose();
  };

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="noteModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={note ? "Edit note" : "New note"}
      >
        <div className="noteModal__head">
          <span className="noteModal__title">{note ? "Edit Note" : "New Note"}</span>
          <span className="noteModal__stamp">{timestampLabel(createdAt)}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <textarea
          className="noteModal__body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="What's on your mind about the market? Use $NVDA and #earnings inline."
          rows={6}
          autoFocus
          spellCheck={false}
        />

        {(symbols.length > 0 || tags.length > 0) && (
          <div className="noteModal__chips">
            {symbols.map((s) => (
              <span key={s} className="noteChip noteChip--sym">${s}</span>
            ))}
            {tags.map((t) => (
              <span key={t} className="noteChip">#{t}</span>
            ))}
          </div>
        )}

        <div className="noteModal__foot">
          {note ? (
            <button
              type="button"
              className="btn"
              style={{
                background: "var(--loss-muted)",
                borderColor: "transparent",
                color: "var(--loss)",
              }}
              onClick={() => {
                deleteNote(note.id);
                onClose();
              }}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSave}
            onClick={save}
          >
            <span>Save</span>
            <Kbd>⌘↵</Kbd>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
