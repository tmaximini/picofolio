import { ArrowRight, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHoldings, useTrades } from "@/store/selectors";

// Small built-in pool — guarantees the palette is useful from a fresh start
// before any sync. Replace with a remote symbol search later.
const COMMON_SYMBOLS: ReadonlyArray<{ symbol: string; name: string }> = [
  { symbol: "NVDA", name: "NVIDIA Corp" },
  { symbol: "AAPL", name: "Apple Inc" },
  { symbol: "MSFT", name: "Microsoft Corp" },
  { symbol: "GOOGL", name: "Alphabet Inc" },
  { symbol: "AMZN", name: "Amazon.com Inc" },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "TSLA", name: "Tesla Inc" },
  { symbol: "AMD", name: "Advanced Micro Devices" },
  { symbol: "AVGO", name: "Broadcom Inc" },
  { symbol: "TSM", name: "Taiwan Semiconductor" },
  { symbol: "ASML", name: "ASML Holding" },
  { symbol: "PLTR", name: "Palantir Technologies" },
  { symbol: "COIN", name: "Coinbase Global" },
  { symbol: "HOOD", name: "Robinhood Markets" },
  { symbol: "NFLX", name: "Netflix Inc" },
  { symbol: "BRK.B", name: "Berkshire Hathaway" },
];

const NAV_TARGETS: ReadonlyArray<{ path: string; label: string; shortcut?: string }> = [
  { path: "/", label: "Go to Overview", shortcut: "g o" },
  { path: "/activity", label: "Go to Activity", shortcut: "g a" },
  { path: "/calendar", label: "Go to Calendar", shortcut: "g c" },
  { path: "/holdings", label: "Go to Holdings", shortcut: "g h" },
  { path: "/performance", label: "Go to Performance" },
  { path: "/settings", label: "Go to Settings", shortcut: "g s" },
];

type SymbolResult = {
  kind: "symbol";
  symbol: string;
  name?: string;
  source: "trade" | "holding" | "common";
};
type NavResult = { kind: "nav"; path: string; label: string; shortcut?: string };
type CreateResult = { kind: "create"; symbol: string };
type Result = SymbolResult | NavResult | CreateResult;

type CommandPaletteProps = {
  onClose: () => void;
  onPickSymbol: (symbol: string) => void;
  onPickNav: (path: string) => void;
};

export function CommandPalette({
  onClose,
  onPickSymbol,
  onPickNav,
}: CommandPaletteProps) {
  const trades = useTrades();
  const holdings = useHoldings();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Merge symbol sources into a deduped pool, preferring richer metadata.
  const symbolPool = useMemo(() => {
    const map = new Map<string, SymbolResult>();
    for (const t of trades) {
      if (!map.has(t.symbol)) {
        map.set(t.symbol, { kind: "symbol", symbol: t.symbol, source: "trade" });
      }
    }
    for (const h of holdings) {
      const existing = map.get(h.symbol);
      if (existing && !existing.name) existing.name = h.name;
      else if (!existing) {
        map.set(h.symbol, {
          kind: "symbol",
          symbol: h.symbol,
          name: h.name,
          source: "holding",
        });
      }
    }
    for (const c of COMMON_SYMBOLS) {
      const existing = map.get(c.symbol);
      if (existing && !existing.name) existing.name = c.name;
      else if (!existing) {
        map.set(c.symbol, {
          kind: "symbol",
          symbol: c.symbol,
          name: c.name,
          source: "common",
        });
      }
    }
    return Array.from(map.values());
  }, [trades, holdings]);

  const results = useMemo((): Result[] => {
    const q = query.trim().toUpperCase();
    if (!q) {
      // Empty query — show top symbols + nav targets
      const topSyms = symbolPool.slice(0, 8);
      return [...topSyms, ...NAV_TARGETS.map(navToResult)];
    }
    const matched: Result[] = [];
    // Symbol matches: prefix > substring > name substring
    const prefixHits: SymbolResult[] = [];
    const substringHits: SymbolResult[] = [];
    for (const s of symbolPool) {
      const sym = s.symbol.toUpperCase();
      const name = (s.name ?? "").toUpperCase();
      if (sym.startsWith(q)) prefixHits.push(s);
      else if (sym.includes(q) || name.includes(q)) substringHits.push(s);
    }
    matched.push(...prefixHits.slice(0, 8));
    matched.push(...substringHits.slice(0, 8));

    // Nav matches
    for (const nav of NAV_TARGETS) {
      if (nav.label.toUpperCase().includes(q)) matched.push(navToResult(nav));
    }

    // Always offer "create with X" if query looks like a ticker
    if (/^[A-Z][A-Z0-9.-]{0,7}$/.test(q) && !matched.some((m) => m.kind === "symbol" && m.symbol === q)) {
      matched.unshift({ kind: "create", symbol: q });
    }

    return matched.slice(0, 16);
  }, [query, symbolPool]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Esc / Up / Down / Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[activeIdx];
        if (r) pick(r);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [results, activeIdx, onClose]);

  // Auto-focus + scroll active item into view
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const pick = (r: Result) => {
    if (r.kind === "symbol" || r.kind === "create") {
      onPickSymbol(r.symbol);
    } else {
      onPickNav(r.path);
    }
    onClose();
  };

  return createPortal(
    <div className="cmdBackdrop" onClick={onClose}>
      <div
        className="cmdPalette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="cmdPalette__inputRow">
          <Search size={15} strokeWidth={1.75} />
          <input
            ref={inputRef}
            className="cmdPalette__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols or actions…"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="kbd">ESC</kbd>
        </div>

        <div className="cmdPalette__list" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmdPalette__empty">No matches</div>
          ) : (
            results.map((r, i) => (
              <CommandRow
                key={resultKey(r) + i}
                idx={i}
                active={i === activeIdx}
                result={r}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(r)}
              />
            ))
          )}
        </div>

        <div className="cmdPalette__foot">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            <span className="cmdPalette__footHint">navigate</span>
          </span>
          <span>
            <kbd className="kbd">↵</kbd>
            <span className="cmdPalette__footHint">select</span>
          </span>
          <span>
            <kbd className="kbd">⌘K</kbd>
            <span className="cmdPalette__footHint">toggle</span>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CommandRow({
  result,
  active,
  idx,
  onMouseEnter,
  onClick,
}: {
  result: Result;
  active: boolean;
  idx: number;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-idx={idx}
      className={active ? "cmdRow cmdRow--active" : "cmdRow"}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className="cmdRow__icon">
        {result.kind === "symbol" ? (
          <span className="cmdRow__symBadge">$</span>
        ) : result.kind === "create" ? (
          <Plus size={14} strokeWidth={1.75} />
        ) : (
          <ArrowRight size={14} strokeWidth={1.75} />
        )}
      </span>
      <span className="cmdRow__main">
        {result.kind === "symbol" ? (
          <>
            <span className="cmdRow__title">{result.symbol}</span>
            {result.name && <span className="cmdRow__sub">{result.name}</span>}
          </>
        ) : result.kind === "create" ? (
          <span className="cmdRow__title">
            New trade with{" "}
            <span style={{ color: "var(--accent)" }}>{result.symbol}</span>
          </span>
        ) : (
          <span className="cmdRow__title">{result.label}</span>
        )}
      </span>
      <span className="cmdRow__tag">
        {result.kind === "symbol"
          ? result.source === "trade"
            ? "Traded"
            : result.source === "holding"
              ? "Holding"
              : "Common"
          : result.kind === "create"
            ? "Create"
            : (result.shortcut ?? "")}
      </span>
    </button>
  );
}

function navToResult(n: (typeof NAV_TARGETS)[number]): NavResult {
  return { kind: "nav", path: n.path, label: n.label, shortcut: n.shortcut };
}

function resultKey(r: Result): string {
  if (r.kind === "symbol") return `sym:${r.symbol}`;
  if (r.kind === "create") return `new:${r.symbol}`;
  return `nav:${r.path}`;
}
