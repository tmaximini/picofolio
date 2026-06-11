import { Pencil, X } from "lucide-react";
import type { Note } from "@/lib/notes";
import { useDeleteNote } from "@/store/selectors";

/** Compact one-line note row — same chip-chain DNA as TradeSetupRow.
 *  Used on the Activity page strip and the Calendar day panel. */
export function NoteRow({ note, onEdit }: { note: Note; onEdit?: () => void }) {
  const deleteNote = useDeleteNote();
  const dateLabel = new Date(note.createdAt).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
  });

  return (
    <div className="noteRow">
      <span className="noteRow__label">Note · {dateLabel}</span>
      <div className="noteRow__main">
        <span className="noteRow__body">{note.body}</span>
        {(note.symbols.length > 0 || note.tags.length > 0) && (
          <span className="noteRow__chips">
            {note.symbols.map((s) => (
              <span key={s} className="noteChip noteChip--sym">${s}</span>
            ))}
            {note.tags.map((t) => (
              <span key={t} className="noteChip">#{t}</span>
            ))}
          </span>
        )}
      </div>
      <div className="noteRow__actions">
        {onEdit && (
          <button
            type="button"
            className="setupRow__iconBtn"
            title="Edit note"
            onClick={onEdit}
          >
            <Pencil size={12} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className="setupRow__iconBtn"
          title="Delete note"
          onClick={() => deleteNote(note.id)}
        >
          <X size={12} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
