import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Search } from "lucide-react";
import { searchYahoo, type YahooSearchHit } from "@/lib/yahoo";

const DEBOUNCE_MS = 220;

type SymbolSearchProps = {
  placeholder?: string;
  /** Called with a picked hit, or a bare typed symbol when there are no hits. */
  onPick: (hit: { symbol: string; name?: string }) => void;
  /** Symbols to mark as already added in the results. */
  existing?: ReadonlySet<string>;
};

/**
 * Yahoo symbol typeahead. ↑/↓ move, ↵ picks (or adds the raw symbol when
 * search found nothing), esc clears and blurs. Search failures never block
 * typing a ticker by hand.
 */
export const SymbolSearch = forwardRef<HTMLInputElement, SymbolSearchProps>(
  function SymbolSearch({ placeholder = "Add symbol…", onPick, existing }, ref) {
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<YahooSearchHit[]>([]);
    const [active, setActive] = useState(0);
    const [open, setOpen] = useState(false);
    const ticket = useRef(0);

    useEffect(() => {
      const query = q.trim();
      if (query.length < 1) {
        setHits([]);
        setOpen(false);
        return;
      }
      const t = ++ticket.current;
      const timer = window.setTimeout(async () => {
        try {
          const found = await searchYahoo(query);
          if (ticket.current !== t) return;
          setHits(found);
          setActive(0);
          setOpen(true);
        } catch {
          if (ticket.current === t) setHits([]);
        }
      }, DEBOUNCE_MS);
      return () => window.clearTimeout(timer);
    }, [q]);

    const pick = (hit: { symbol: string; name?: string }) => {
      onPick(hit);
      setQ("");
      setHits([]);
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, hits.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = hits[active];
        if (hit) pick(hit);
        else if (q.trim()) pick({ symbol: q.trim() });
      } else if (e.key === "Escape") {
        e.stopPropagation();
        setQ("");
        setOpen(false);
        e.currentTarget.blur();
      }
    };

    return (
      <div className="symSearch">
        <Search size={14} strokeWidth={1.5} className="symSearch__icon" />
        <input
          ref={ref}
          className="symSearch__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label="Search symbols"
        />
        <span className="kbd symSearch__kbd">/</span>
        {open && hits.length > 0 && (
          <ul className="symSearch__menu" role="listbox">
            {hits.map((h, i) => {
              const added = existing?.has(h.symbol.toUpperCase());
              return (
                <li
                  key={h.symbol}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "symSearch__hit symSearch__hit--on" : "symSearch__hit"}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(h);
                  }}
                >
                  <span className="symSearch__sym num">{h.symbol}</span>
                  <span className="symSearch__name">{h.name}</span>
                  <span className="symSearch__meta">
                    {added ? "Watching" : h.exchange}
                  </span>
                  {!added && <Plus size={13} strokeWidth={1.75} className="symSearch__plus" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  },
);
