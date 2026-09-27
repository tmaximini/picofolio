import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BrandMark } from "@/components/primitives";
import { formatMoney, formatPct } from "@/lib/money";
import { prefersReducedMotion, useInView } from "@/lib/useInView";
import { EquityCurve } from "./EquityCurve";
import { Odometer } from "./Odometer";
import { HOLDINGS, equityCurve } from "./demoData";

const NAV = [
  { label: "Overview", keys: "g o", active: true },
  { label: "Holdings", keys: "g h" },
  { label: "Journal", keys: "g a" },
  { label: "Calendar", keys: "g c" },
  { label: "Performance", keys: "g p" },
];

const RANGES = ["7D", "MTD", "YTD", "1Y", "All"];

/**
 * A working miniature of the app, built from the same visual grammar rather
 * than a screenshot: the value rolls in, the curve draws, and prices tick.
 * It lies back in perspective and stands up as it scrolls into view.
 */
export function ProductWindow() {
  const [viewRef, inView] = useInView<HTMLDivElement>({ threshold: 0.15, rootMargin: "0px" });
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const curve = useMemo(() => equityCurve(), []);
  const [prices, setPrices] = useState(() => HOLDINGS.map((h) => h.price));
  const [flash, setFlash] = useState<{ i: number; dir: "up" | "down"; n: number } | null>(null);

  // Scroll-linked tilt: 16° back at the fold → flat once it's well in view.
  useEffect(() => {
    const el = tiltRef.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const t = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      el.style.setProperty("--tilt", String(1 - t));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Live ticks: one holding nudges every ~1.4s once the intro has played.
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    let n = 0;
    const id = window.setInterval(() => {
      const i = Math.floor(Math.random() * HOLDINGS.length);
      const move = (Math.random() - 0.45) * 0.004;
      setPrices((p) => p.map((v, j) => (j === i ? Math.max(1, Math.round(v * (1 + move))) : v)));
      setFlash({ i, dir: move >= 0 ? "up" : "down", n: ++n });
    }, 1400);
    return () => window.clearInterval(id);
  }, [inView]);

  const value = formatMoney(16491917, "EUR");
  const [whole, cents] = value.split(".");

  return (
    <div className="pw" ref={tiltRef}>
      <div className={inView ? "pw__frame pw__frame--on" : "pw__frame"} ref={viewRef}>
        <div className="pw__bar">
          <span className="pw__lights" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="pw__url num">picofolio.app/overview</span>
          <span className="pw__sync num">
            <i className="pw__syncDot" /> Synced 08:21
          </span>
        </div>

        <div className="pw__body">
          <aside className="pw__side" aria-hidden>
            <div className="pw__brand">
              <BrandMark size={18} />
              <span className="wordmark">picofolio</span>
            </div>
            <div className="pw__acct">
              <i /> All accounts
            </div>
            <nav className="pw__nav">
              {NAV.map((n) => (
                <span key={n.label} className={n.active ? "pw__navItem pw__navItem--on" : "pw__navItem"}>
                  {n.label}
                  <span className="pw__navKeys num">{n.keys}</span>
                </span>
              ))}
            </nav>
          </aside>

          <div className="pw__main">
            <div className="pw__head">
              <div>
                <div className="eyebrow">Account value</div>
                <div className="pw__value">
                  <Odometer value={whole!} active={inView} />
                  <span className="pw__cents num">.{cents}</span>
                </div>
              </div>
              <div className="pw__ror">
                <div className="eyebrow">Return · All</div>
                <div className="pw__rorVal num">
                  <Odometer value="+12.40%" active={inView} />
                </div>
              </div>
            </div>

            <EquityCurve data={curve} active={inView} />

            <div className="pw__ranges" aria-hidden>
              {RANGES.map((r) => (
                <span key={r} className={r === "All" ? "pw__range pw__range--on" : "pw__range"}>
                  {r}
                </span>
              ))}
            </div>

            <div className="pw__table" role="table" aria-label="Sample holdings">
              <div className="pw__row pw__row--head" role="row">
                <span role="columnheader">Symbol</span>
                <span role="columnheader" className="num">Qty</span>
                <span role="columnheader" className="num">Price</span>
                <span role="columnheader" className="num">Day</span>
              </div>
              {HOLDINGS.map((h, i) => {
                const f = flash?.i === i ? flash : null;
                return (
                  <div
                    className="pw__row"
                    role="row"
                    key={h.symbol}
                    style={{ "--i": i } as CSSProperties}
                  >
                    <span role="cell" className="pw__sym">
                      {h.symbol}
                      <small>{h.name}</small>
                    </span>
                    <span role="cell" className="num">{h.qty}</span>
                    <span
                      role="cell"
                      // Re-keyed per tick so the flash animation restarts.
                      key={f ? f.n : "p"}
                      className={f ? `num pw__px pw__px--${f.dir}` : "num pw__px"}
                    >
                      {formatMoney(prices[i]!, h.currency)}
                    </span>
                    <span role="cell" className={h.dayPct >= 0 ? "num tone-gain" : "num tone-loss"}>
                      {formatPct(h.dayPct)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
