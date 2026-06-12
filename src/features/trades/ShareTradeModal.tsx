/**
 * Shareable trade card — Carbon-style: the trade rendered as a beautiful
 * framed card on a glowing backdrop, exportable as a crisp PNG (2400×1260)
 * for social. The preview IS the export target (scaled 0.5), so what you
 * see is pixel-for-pixel what you share.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, X } from "lucide-react";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import { formatCents, formatDelta, formatPct, toneOf } from "@/lib/money";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import { deriveTotals, formatHold, tradeDateKey } from "@/lib/tradeMath";
import type { Trade } from "@/lib/trades";
import { usePushToast } from "@/store/selectors";
import { ShareCardChart } from "./ShareCardChart";

type ShareTradeModalProps = {
  trade: Trade;
  onClose: () => void;
};

/** Logical card size — exported at pixelRatio 2 → 2400×1260. */
const CARD_W = 1200;
const CARD_H = 630;
/** Preview scale inside the modal. */
const PREVIEW_SCALE = 0.5;

function dateLabel(key: string): string {
  if (!key) return "";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ShareTradeModal({ trade, onClose }: ShareTradeModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pctOnly, setPctOnly] = useState(false);
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);
  const pushToast = usePushToast();

  // Capture-phase Escape so the trade modal underneath doesn't close too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  const tot = deriveTotals(trade);
  const tone = toneOf(tot.returnCents);
  const opt = parseOccSymbol(trade.symbol);
  const underlying = opt?.underlying ?? trade.symbol;
  const openingAction = trade.side === "LONG" ? "BUY" : "SELL";
  const qty = trade.executions
    .filter((e) => e.action === openingAction)
    .reduce((s, e) => s + e.qty, 0);

  async function renderBlob(node: HTMLElement): Promise<Blob> {
    // Inline the Google Fonts woff2 so the PNG carries the real typefaces;
    // if that fails (offline / blocked) export still works on fallbacks.
    let fontEmbedCSS: string | undefined;
    try {
      fontEmbedCSS = await getFontEmbedCSS(node);
    } catch {
      fontEmbedCSS = undefined;
    }
    const blob = await toBlob(node, {
      width: CARD_W,
      height: CARD_H,
      pixelRatio: 2,
      fontEmbedCSS,
      skipFonts: fontEmbedCSS === undefined,
      backgroundColor: "#07080A",
    });
    if (!blob) throw new Error("Render produced no image");
    return blob;
  }

  const onCopy = () => {
    const node = cardRef.current;
    if (!node) return;
    if (typeof ClipboardItem === "undefined") {
      // Firefox without asyncClipboard.clipboardItem — fall back to download.
      void onDownload();
      return;
    }
    setBusy("copy");
    // Promise payload keeps Safari's user-gesture window open; older
    // Chromium rejects promise payloads, so retry with the awaited blob.
    const blobPromise = renderBlob(node).finally(() => setBusy(null));
    navigator.clipboard
      .write([new ClipboardItem({ "image/png": blobPromise })])
      .then(() => pushToast({ kind: "success", title: "Image copied", duration: 2500 }))
      .catch(async () => {
        try {
          const blob = await blobPromise;
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          pushToast({ kind: "success", title: "Image copied", duration: 2500 });
        } catch {
          pushToast({
            kind: "error",
            title: "Copy failed",
            body: "Try Download PNG instead.",
          });
        }
      });
  };

  const onDownload = async () => {
    const node = cardRef.current;
    if (!node) return;
    setBusy("download");
    try {
      const blob = await renderBlob(node);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${underlying}-${tradeDateKey(trade)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ kind: "success", title: "PNG downloaded", duration: 2500 });
    } catch {
      pushToast({ kind: "error", title: "Export failed" });
    } finally {
      setBusy(null);
    }
  };

  const sidePillClass =
    trade.side === "LONG"
      ? "shareCard__pill shareCard__pill--long"
      : "shareCard__pill shareCard__pill--short";

  return createPortal(
    // stopPropagation everywhere: this portal's React events would otherwise
    // bubble through the React tree into the TradeViewModal backdrop beneath
    // and close both modals at once.
    <div
      className="modalBackdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal modal--share"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__head">
          <div className="modal__title">Share Trade</div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="shareModal__body">
          <div
            className="shareCard__viewport"
            style={{ width: CARD_W * PREVIEW_SCALE, height: CARD_H * PREVIEW_SCALE }}
          >
            <div className="shareCard__scale" style={{ transform: `scale(${PREVIEW_SCALE})` }}>
              <div
                ref={cardRef}
                className="shareCard"
                style={{ width: CARD_W, height: CARD_H }}
              >
                <div className="shareCard__inner">
                  <div className="shareCard__head">
                    <div className="shareCard__symGroup">
                      <span className="shareCard__sym">{underlying}</span>
                      {opt && (
                        <span className="shareCard__optLabel">{formatOptionLabel(opt)}</span>
                      )}
                      <span className={sidePillClass}>{trade.side}</span>
                      <span className="shareCard__pill">{trade.market}</span>
                    </div>
                    <span className="shareCard__date">{dateLabel(tradeDateKey(trade))}</span>
                  </div>

                  <div className={`shareCard__headline shareCard__headline--${tone}`}>
                    {!pctOnly && (
                      <span className="shareCard__pl">{formatDelta(tot.returnCents)}</span>
                    )}
                    {tot.returnPct != null && (
                      <span
                        className={
                          pctOnly ? "shareCard__pl" : "shareCard__pct"
                        }
                      >
                        {formatPct(tot.returnPct)}
                      </span>
                    )}
                  </div>

                  <ShareCardChart trade={trade} />

                  <div className="shareCard__stats">
                    <ShareStat label="Entry" value={formatCents(tot.avgEntryCents ?? 0)} />
                    <ShareStat label="Exit" value={formatCents(tot.avgExitCents ?? 0)} />
                    {!pctOnly && (
                      <ShareStat label="Qty" value={qty.toLocaleString("en-US")} />
                    )}
                    <ShareStat label="Hold" value={formatHold(tot.holdMs)} />
                    {tot.rMultiple != null && (
                      <ShareStat label="R" value={`${tot.rMultiple.toFixed(2)}R`} />
                    )}
                  </div>

                  <div className="shareCard__watermark">
                    <span className="brand__mark" aria-hidden>
                      <span className="brand__markGlyph">P</span>
                    </span>
                    <span className="shareCard__wordmark">picofolio</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal__foot">
          <button
            type="button"
            className={pctOnly ? "shareToggle shareToggle--on" : "shareToggle"}
            onClick={() => setPctOnly((v) => !v)}
            aria-pressed={pctOnly}
          >
            <span className="shareToggle__knob" />
            <span>% only</span>
          </button>
          <div className="shareModal__actions">
            <button type="button" className="btn" onClick={onCopy} disabled={busy != null}>
              <Copy size={13} strokeWidth={1.75} />
              <span>{busy === "copy" ? "Copying…" : "Copy image"}</span>
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void onDownload()}
              disabled={busy != null}
            >
              <Download size={13} strokeWidth={1.75} />
              <span>{busy === "download" ? "Exporting…" : "Download PNG"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ShareStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="shareCard__stat">
      <span className="shareCard__statLabel">{label}</span>
      <span className="shareCard__statValue">{value}</span>
    </div>
  );
}
