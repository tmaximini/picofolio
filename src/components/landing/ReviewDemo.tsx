import { useEffect, useState, type CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMoney, formatMoneyDelta } from "@/lib/money";
import { DEFAULT_REVIEW_LABELS } from "@/lib/review";
import { prefersReducedMotion, useInView } from "@/lib/useInView";

const label = (id: string) => DEFAULT_REVIEW_LABELS.find((l) => l.id === id)!;

/** The chips shown on the demo card — a slice of the real default set. */
const CHIPS = ["m-fomo", "m-no-exit", "m-stop", "m-chase", "g-setup", "g-disc", "g-cut"].map(label);

type DemoTrade = {
  symbol: string;
  side: string;
  closed: string;
  pnl: number;
  r: number;
  /** Labels the autoplay ticks, in order. */
  tags: string[];
  note: string;
};

const TRADES: DemoTrade[] = [
  { symbol: "TSLA", side: "Short", closed: "18 Sep", pnl: -41230, r: -1.3, tags: ["m-fomo", "m-no-exit"], note: "Shorted into strength before the break. No plan for the squeeze." },
  { symbol: "NVDA", side: "Long", closed: "16 Sep", pnl: 123640, r: 2.4, tags: ["g-setup", "g-disc"], note: "Waited for the retest, took half at 2R, trailed the rest." },
  { symbol: "AMD", side: "Long", closed: "11 Sep", pnl: -28610, r: -0.6, tags: ["m-chase", "g-cut"], note: "Chased the gap — but got out the moment it lost VWAP." },
];

const MISTAKES = [
  { id: "m-fomo", net: -214000, trades: 9, win: 0.22 },
  { id: "m-stop", net: -161000, trades: 4, win: 0 },
  { id: "m-revenge", net: -98000, trades: 3, win: 0.33 },
];
const WORKS = [
  { id: "g-setup", net: 642000, trades: 31, win: 0.71 },
  { id: "g-cut", net: 118000, trades: 12, win: 0.58 },
];
const MAX = 642000;

/**
 * A trade review playing itself: labels get ticked, the trade is marked
 * reviewed, the next one slides in. Beside it, what those labels add up to.
 * Clicking anything hands control to the visitor.
 */
export function ReviewDemo() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [auto, setAuto] = useState(true);
  const trade = TRADES[i]!;

  // Autoplay: tick each label, mark reviewed, move on — then loop.
  useEffect(() => {
    if (!inView || !auto || prefersReducedMotion()) return;
    const steps = [...trade.tags.map((t) => () => setPicked((p) => [...p, t])), () => setDone(true)];
    const timers = steps.map((fn, n) => window.setTimeout(fn, 700 + n * 850));
    timers.push(
      window.setTimeout(() => {
        setI((x) => (x + 1) % TRADES.length);
        setPicked([]);
        setDone(false);
      }, 700 + steps.length * 850 + 1100),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Re-run per trade; the step setters are stable.
  }, [inView, auto, i, trade.tags]);

  const go = (d: number) => {
    setAuto(false);
    setI((x) => (x + d + TRADES.length) % TRADES.length);
    setPicked([]);
    setDone(false);
  };

  return (
    <div className={inView ? "rdemo rdemo--on" : "rdemo"} ref={ref}>
      <div className="rdemo__card" key={i}>
        <div className="rdemo__head">
          <div>
            <span className="rdemo__sym">{trade.symbol}</span>
            <span className="rdemo__meta">
              {trade.side} · closed <span className="num">{trade.closed}</span>
            </span>
          </div>
          <div className="rdemo__nav">
            <button type="button" aria-label="Previous trade" onClick={() => go(-1)}>
              <ChevronLeft size={14} strokeWidth={1.75} />
            </button>
            <span className="num">
              {i + 1} / {TRADES.length}
            </span>
            <button type="button" aria-label="Next trade" onClick={() => go(1)}>
              <ChevronRight size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="rdemo__result">
          <span className={`num ${trade.pnl >= 0 ? "tone-gain" : "tone-loss"}`}>{formatMoneyDelta(trade.pnl, "EUR")}</span>
          <span className="num rdemo__r">
            {trade.r > 0 ? "+" : ""}
            {trade.r.toFixed(1)}R
          </span>
        </div>

        <div className="rdemo__chips">
          {CHIPS.map((l, n) => {
            const on = picked.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className={on ? "rdemo__chip rdemo__chip--on" : "rdemo__chip"}
                aria-pressed={on}
                onClick={() => {
                  setAuto(false);
                  setPicked((p) => (p.includes(l.id) ? p.filter((x) => x !== l.id) : [...p, l.id]));
                }}
              >
                <i style={{ background: l.color }} aria-hidden />
                {l.name}
                <span className="rdemo__key num">{n + 1}</span>
              </button>
            );
          })}
        </div>

        <p className="rdemo__note">“{trade.note}”</p>

        <div className="rdemo__foot">
          <span className="rdemo__keys">
            <span className="kbd">1</span>–<span className="kbd">9</span> label <span className="kbd">↵</span> next
          </span>
          <span className={done ? "rdemo__done rdemo__done--on" : "rdemo__done"}>
            <Check size={13} strokeWidth={2} /> Reviewed
          </span>
        </div>
      </div>

      <div className="rdemo__insights">
        <div className="rdemo__compare">
          <div>
            <span className="eyebrow">With a mistake</span>
            <span className="num rdemo__big tone-loss">38%</span>
            <span className="rdemo__sub">win rate</span>
          </div>
          <div>
            <span className="eyebrow">Clean trades</span>
            <span className="num rdemo__big tone-gain">64%</span>
            <span className="rdemo__sub">win rate</span>
          </div>
        </div>
        <Bars title="Costliest mistakes" rows={MISTAKES} />
        <Bars title="What works" rows={WORKS} />
      </div>
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { id: string; net: number; trades: number; win: number }[] }) {
  return (
    <div className="rdemo__bars">
      <div className="rdemo__barsTitle">{title}</div>
      {rows.map((r, n) => {
        const l = label(r.id);
        return (
          <div className="rdemo__row" key={r.id} style={{ "--w": Math.abs(r.net) / MAX, "--i": n } as CSSProperties}>
            <div className="rdemo__rowTop">
              <span>
                <i style={{ background: l.color }} aria-hidden />
                {l.name}
              </span>
              <span className={`num ${r.net >= 0 ? "tone-gain" : "tone-loss"}`}>
                {r.net >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(r.net), "EUR", true)}
              </span>
            </div>
            <div className="rdemo__track">
              <span style={{ background: l.color }} />
            </div>
            <div className="rdemo__rowMeta num">
              {r.trades} trades · {Math.round(r.win * 100)}% win
            </div>
          </div>
        );
      })}
    </div>
  );
}
