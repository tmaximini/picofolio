/**
 * Tiny hotkey hook. Supports:
 *  - Single-key bindings ("n", "?", "/")
 *  - Linear-style `g`-prefix chords ("g j", "g h")
 *  - Modifier combos ("cmd+r", "ctrl+k")
 *
 * Bindings are global. Inputs/textareas are skipped unless the binding
 * has a modifier — typing "n" in a notes field should not open New Trade.
 */

import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

type BindingSpec = {
  /** Lowercased key sequence — single key "n", chord "g j", or combo "cmd+r". */
  combo: string;
  handler: Handler;
};

const CHORD_TIMEOUT = 1200;

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function normalizeCombo(combo: string): string {
  return combo.toLowerCase().replace(/\s+/g, " ").trim();
}

function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("cmd");
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && e.key.length > 1) parts.push("shift");
  parts.push(e.key.toLowerCase());
  return parts.join("+");
}

export function useHotkeys(bindings: BindingSpec[]) {
  useEffect(() => {
    let chordPrefix: string | null = null;
    let chordTimer: number | null = null;

    const cancelChord = () => {
      chordPrefix = null;
      if (chordTimer != null) {
        window.clearTimeout(chordTimer);
        chordTimer = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const combo = eventToCombo(e);
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
      const inEditable = isEditableTarget(e.target);

      if (inEditable && !hasModifier) return;

      // Combo match first
      for (const b of bindings) {
        if (normalizeCombo(b.combo) === combo) {
          e.preventDefault();
          b.handler(e);
          cancelChord();
          return;
        }
      }

      // Chord match
      if (chordPrefix) {
        const sequence = `${chordPrefix} ${e.key.toLowerCase()}`;
        for (const b of bindings) {
          if (normalizeCombo(b.combo) === sequence) {
            e.preventDefault();
            b.handler(e);
            cancelChord();
            return;
          }
        }
        cancelChord();
        return;
      }

      // Single-key chord starter?
      const key = e.key.toLowerCase();
      if (!hasModifier && bindings.some((b) => normalizeCombo(b.combo).startsWith(`${key} `))) {
        chordPrefix = key;
        chordTimer = window.setTimeout(cancelChord, CHORD_TIMEOUT);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelChord();
    };
  }, [bindings]);
}
