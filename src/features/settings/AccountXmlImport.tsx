import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/primitives";
import { useImportIbkrXml, usePushToast } from "@/store/selectors";

type Pending = { xml: string; source: string };

/**
 * Per-account Flex XML import (drag-drop / file picker / paste) — the fallback
 * when the Flex Web Service won't generate. Picking a file doesn't import it
 * yet: it stages the file and asks for an in-context confirmation, because the
 * account's IBKR positions and cash get replaced by the statement's snapshot.
 */
export function AccountXmlImport({ accountId, accountName }: { accountId: string; accountName: string }) {
  const importXml = useImportIbkrXml();
  const pushToast = usePushToast();
  const [xmlDraft, setXmlDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stageFile = async (file: File) => {
    setError(null);
    if (!/\.(xml|txt)$/i.test(file.name) && !file.type.includes("xml")) {
      setError(`"${file.name}" isn't an XML file.`);
      return;
    }
    try {
      setPending({ xml: await file.text(), source: file.name });
    } catch {
      setError("Couldn't read that file.");
    }
  };

  const runImport = ({ xml, source }: Pending) => {
    try {
      const summary = importXml(xml, accountId);
      setPending(null);
      setXmlDraft("");
      pushToast({
        kind: summary.added > 0 ? "success" : "info",
        title:
          summary.added > 0
            ? `${accountName}: imported ${summary.added} trade${summary.added === 1 ? "" : "s"}`
            : `${accountName}: nothing new`,
        body: `From ${source}.${summary.skipped > 0 ? ` Skipped ${summary.skipped} already imported.` : ""}`,
        duration: 5000,
      });
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (pending) {
    return (
      <div className="acctImport__confirm">
        <div>
          <div className="acctImport__confirmTitle">
            Import <span className="mono">{pending.source}</span> into {accountName}?
          </div>
          <div className="acctImport__confirmBody">
            {accountName}'s IBKR positions and cash are replaced by this statement's
            snapshot. Trades are merged — already-imported ones are skipped. Manual
            entries aren't touched.
          </div>
        </div>
        <div className="ibkrActions">
          <Button variant="primary" onClick={() => runImport(pending)}>
            Import
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="acctImport__body">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void stageFile(f);
          e.target.value = "";
        }}
      />
      <div
        className={`xmlDrop${dragging ? " xmlDrop--active" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void stageFile(f);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
      >
        <Upload size={18} strokeWidth={1.5} className="xmlDrop__icon" />
        <div className="xmlDrop__label">
          {dragging ? "Drop to import" : "Drag a Flex .xml here, or click to browse"}
        </div>
      </div>

      <div className="xmlDrop__or">or paste</div>

      <textarea
        className="ibkrFallback__textarea"
        value={xmlDraft}
        onChange={(e) => setXmlDraft(e.target.value)}
        placeholder="<FlexQueryResponse ...>"
        spellCheck={false}
      />
      <div className="ibkrActions" style={{ marginTop: "var(--space-3)" }}>
        <Button
          onClick={() => setPending({ xml: xmlDraft, source: "pasted XML" })}
          disabled={!xmlDraft.trim()}
        >
          Import…
        </Button>
        {error && <span className="ibkrStatusBadge ibkrStatusBadge--error">{error}</span>}
      </div>
    </div>
  );
}
