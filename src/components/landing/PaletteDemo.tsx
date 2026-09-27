import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { prefersReducedMotion, useInView } from "@/lib/useInView";

type Item = { kind: string; label: string; hint: string };

const ITEMS: Item[] = [
  { kind: "Symbol", label: "NVDA", hint: "NVIDIA · 120 sh" },
  { kind: "Action", label: "New trade", hint: "N" },
  { kind: "Go to", label: "Calendar", hint: "g c" },
  { kind: "Symbol", label: "NVO", hint: "Novo Nordisk · 60 sh" },
  { kind: "Action", label: "New note", hint: "B" },
  { kind: "Go to", label: "Holdings", hint: "g h" },
  { kind: "Action", label: "Sync all accounts", hint: "R" },
  { kind: "Symbol", label: "ASML", hint: "ASML Holding · 18 sh" },
  { kind: "Action", label: "New setup", hint: "S" },
];

const QUERIES = ["nv", "new", "cal", "sync"];

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** A command palette typing to itself: symbols, actions and navigation in one list. */
export function PaletteDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    let qi = 0;
    let len = 0;
    let dir: 1 | -1 = 1;
    let timer = 0;
    const step = () => {
      const target = QUERIES[qi]!;
      if (dir === 1 && len < target.length) {
        len++;
        setQ(target.slice(0, len));
        timer = window.setTimeout(step, 110 + Math.random() * 90);
      } else if (dir === 1) {
        dir = -1;
        timer = window.setTimeout(step, 1900);
      } else if (len > 0) {
        len--;
        setQ(target.slice(0, len));
        timer = window.setTimeout(step, 45);
      } else {
        dir = 1;
        qi = (qi + 1) % QUERIES.length;
        timer = window.setTimeout(step, 420);
      }
    };
    timer = window.setTimeout(step, 700);
    return () => window.clearTimeout(timer);
  }, [inView]);

  const results = (q
    ? ITEMS.filter((it) => it.label.toLowerCase().includes(q))
    : ITEMS
  ).slice(0, 5);

  return (
    <div className="palette" ref={ref} aria-hidden>
      <div className="palette__input">
        <Search size={15} strokeWidth={1.5} />
        <span className="palette__query">
          {q || <span className="palette__ph">Search symbols, actions, pages…</span>}
          <i className="palette__caret" />
        </span>
        <span className="kbd">esc</span>
      </div>
      <ul className="palette__list">
        {results.map((it, i) => (
          <li key={it.label} className={i === 0 ? "palette__item palette__item--on" : "palette__item"}>
            <span className="palette__kind">{it.kind}</span>
            <span className="palette__label">
              <Highlight text={it.label} q={q} />
            </span>
            <span className="palette__hint num">{it.hint}</span>
          </li>
        ))}
      </ul>
      <div className="palette__foot num">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
      </div>
    </div>
  );
}
