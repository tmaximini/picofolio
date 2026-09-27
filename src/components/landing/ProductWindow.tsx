import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronsUpDown } from "lucide-react";
import { BrandMark } from "@/components/primitives";
import { formatMoney, formatMoneyDelta, formatPct, toneOf } from "@/lib/money";
import { prefersReducedMotion, useInView } from "@/lib/useInView";
import { EquityCurve } from "./EquityCurve";
import { Odometer } from "./Odometer";
import { PnlCalendar } from "./PnlCalendar";
import { WeeklyBars } from "./WeeklyBars";
import {
  DEMO_ACCOUNTS,
  DEMO_CASH,
  DEMO_CURVE_SEED,
  DEMO_FX_TO_EUR,
  HOLDINGS,
  MONTHLY_2026,
  RECENT_TRADES,
  equityCurve,
  type DemoAccountId,
} from "./demoData";

type View = "overview" | "holdings" | "journal" | "calendar" | "performance";

const NAV: { id: View; label: string; keys: string }[] = [
  { id: "overview", label: "Overview", keys: "g o" },
  { id: "holdings", label: "Holdings", keys: "g h" },
  { id: "journal", label: "Journal", keys: "g a" },
  { id: "calendar", label: "Calendar", keys: "g c" },
  { id: "performance", label: "Performance", keys: "g p" },
];

/** Range → trailing trading days of the ~14-month sample curve. */
const RANGES = [
  { id: "7D", days: 5 },
  { id: "MTD", days: 19 },
  { id: "YTD", days: 190 },
  { id: "1Y", days: 252 },
  { id: "All", days: 300 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const eur = (cents: number, currency: string) => Math.round(cents * (DEMO_FX_TO_EUR[currency] ?? 1));

/**
 * A working miniature of the app, built from the same visual grammar rather
 * than a screenshot. Click the sidebar to switch views, the account chip to
 * change scope, the range pills to re-slice the curve. Prices tick live.
 * It lies back in perspective and stands up as it scrolls into view.
 */
export function ProductWindow() {
  const [viewRef, inView] = useInView<HTMLDivElement>({ threshold: 0.15, rootMargin: "0px" });
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>("overview");
  const [account, setAccount] = useState<DemoAccountId>("all");
  const [acctOpen, setAcctOpen] = useState(false);
  const [range, setRange] = useState<RangeId>("All");
  const [prices, setPrices] = useState(() => HOLDINGS.map((h) => h.price));
  const [flash, setFlash] = useState<{ i: number; dir: "up" | "down"; n: number } | null>(null);

  // Scroll-linked tilt: 18° back at the fold → flat once it's well in view.
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

  const rows = useMemo(
    () =>
      HOLDINGS.map((h, i) => ({ ...h, i, price: prices[i]! }))
        .filter((h) => account === "all" || h.account === account)
        .map((h) => ({ ...h, valueEur: eur(h.qty * h.price, h.currency) }))
        .sort((a, b) => b.valueEur - a.valueEur),
    [prices, account],
  );
  const cash = account === "all" ? DEMO_CASH.trading + DEMO_CASH.long : DEMO_CASH[account];
  const total = rows.reduce((a, r) => a + r.valueEur, 0) + cash;

  const fullCurve = useMemo(() => equityCurve(300, DEMO_CURVE_SEED[account]), [account]);
  const curve = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    const slice = fullCurve.slice(-days - 1);
    const base = 1 + slice[0]! / 100;
    return slice.map((v) => ((1 + v / 100) / base - 1) * 100);
  }, [fullCurve, range]);
  const ret = curve[curve.length - 1]! / 100;

  const [whole, cents] = formatMoney(total, "EUR").split(".");
  const acct = DEMO_ACCOUNTS.find((a) => a.id === account)!;

  const priceCell = (h: (typeof rows)[number]) => {
    const f = flash?.i === h.i ? flash : null;
    return (
      <span
        role="cell"
        // Re-keyed per tick so the flash animation restarts.
        key={f ? f.n : "p"}
        className={f ? `num pw__px pw__px--${f.dir}` : "num pw__px"}
      >
        {formatMoney(h.price, h.currency)}
      </span>
    );
  };

  return (
    <div className="pw" ref={tiltRef}>
      <div className={inView ? "pw__frame pw__frame--on" : "pw__frame"} ref={viewRef}>
        <div className="pw__bar">
          <span className="pw__lights" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="pw__url num">picofolio.app/{view}</span>
          <span className="pw__sync num">
            <i className="pw__syncDot" /> Synced 08:21
          </span>
        </div>

        <div className="pw__body">
          <aside className="pw__side">
            <div className="pw__brand" aria-hidden>
              <BrandMark size={18} />
              <span className="wordmark">picofolio</span>
            </div>

            <div className="pw__acctWrap">
              <button
                type="button"
                className="pw__acct"
                aria-haspopup="listbox"
                aria-expanded={acctOpen}
                onClick={() => setAcctOpen((v) => !v)}
                onBlur={() => window.setTimeout(() => setAcctOpen(false), 120)}
              >
                <i style={acct.color ? { background: acct.color } : undefined} />
                <span>{acct.label}</span>
                <ChevronsUpDown size={12} strokeWidth={1.5} />
              </button>
              {acctOpen && (
                <ul className="pw__acctMenu" role="listbox">
                  {DEMO_ACCOUNTS.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={a.id === account}
                        className={a.id === account ? "is-on" : undefined}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setAccount(a.id);
                          setAcctOpen(false);
                        }}
                      >
                        <i style={a.color ? { background: a.color } : undefined} />
                        {a.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <nav className="pw__nav" aria-label="Demo navigation">
              {NAV.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  className={n.id === view ? "pw__navItem pw__navItem--on" : "pw__navItem"}
                  aria-current={n.id === view ? "page" : undefined}
                  onClick={() => setView(n.id)}
                >
                  {n.label}
                  <span className="pw__navKeys num">{n.keys}</span>
                </button>
              ))}
            </nav>
            <p className="pw__hint">It's live — click around.</p>
          </aside>

          <div className="pw__main">
            {/* Narrow screens hide the sidebar; views become tabs. */}
            <div className="pw__tabs" role="tablist">
              {NAV.map((n) => (
                <button
                  type="button"
                  role="tab"
                  key={n.id}
                  aria-selected={n.id === view}
                  className={n.id === view ? "pw__tab pw__tab--on" : "pw__tab"}
                  onClick={() => setView(n.id)}
                >
                  {n.label}
                </button>
              ))}
            </div>

            <div className="pw__view" key={view}>
              {view === "overview" && (
                <>
                  <div className="pw__head">
                    <div>
                      <div className="eyebrow">{account === "all" ? "Portfolio value" : `${acct.label} value`}</div>
                      <div className="pw__value">
                        <Odometer value={whole!} active={inView} />
                        <span className="pw__cents num">.{cents}</span>
                      </div>
                    </div>
                    <div className="pw__ror">
                      <div className="eyebrow">Return · {range}</div>
                      <div className={`pw__rorVal num tone-${toneOf(ret)}`}>
                        <Odometer value={formatPct(ret)} active={inView} />
                      </div>
                    </div>
                  </div>

                  <EquityCurve key={`${account}-${range}`} data={curve} active={inView} tone={ret >= 0 ? "gain" : "loss"} />

                  <div className="pw__ranges" role="tablist" aria-label="Range">
                    {RANGES.map((r) => (
                      <button
                        type="button"
                        role="tab"
                        key={r.id}
                        aria-selected={r.id === range}
                        className={r.id === range ? "pw__range pw__range--on" : "pw__range"}
                        onClick={() => setRange(r.id)}
                      >
                        {r.id}
                      </button>
                    ))}
                  </div>

                  <div className="pw__table" role="table" aria-label="Sample holdings">
                    <div className="pw__row pw__row--head" role="row">
                      <span role="columnheader">Symbol</span>
                      <span role="columnheader" className="num">Qty</span>
                      <span role="columnheader" className="num">Price</span>
                      <span role="columnheader" className="num">Day</span>
                    </div>
                    {rows.slice(0, 4).map((h, i) => (
                      <div className="pw__row" role="row" key={h.symbol} style={{ "--i": i } as CSSProperties}>
                        <span role="cell" className="pw__sym">
                          {h.symbol}
                          <small>{h.name}</small>
                        </span>
                        <span role="cell" className="num">{h.qty}</span>
                        {priceCell(h)}
                        <span role="cell" className={`num tone-${toneOf(h.dayPct)}`}>{formatPct(h.dayPct)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {view === "holdings" && (
                <>
                  <ViewHead title="Holdings" meta={`${rows.length} positions · ${formatMoney(cash, "EUR", true)} cash`} />
                  <div className="pw__table pw__table--holdings" role="table" aria-label="Sample holdings">
                    <div className="pw__row pw__row--head" role="row">
                      <span role="columnheader">Symbol</span>
                      <span role="columnheader" className="num">Price</span>
                      <span role="columnheader" className="num">Value</span>
                      <span role="columnheader">Weight</span>
                      <span role="columnheader" className="num">Day</span>
                      <span role="columnheader" className="num">Unreal.</span>
                    </div>
                    {rows.map((h) => {
                      const w = h.valueEur / total;
                      return (
                        <div className="pw__row" role="row" key={h.symbol}>
                          <span role="cell" className="pw__sym">
                            {h.symbol}
                            <small>{h.name}</small>
                          </span>
                          {priceCell(h)}
                          <span role="cell" className="num">{formatMoney(h.valueEur, "EUR", true)}</span>
                          <span role="cell" className="pw__weight">
                            <i style={{ "--w": w } as CSSProperties} />
                            <span className="num">{(w * 100).toFixed(1)}%</span>
                          </span>
                          <span role="cell" className={`num tone-${toneOf(h.dayPct)}`}>{formatPct(h.dayPct)}</span>
                          <span role="cell" className={`num tone-${toneOf(h.unrealPct)}`}>{formatPct(h.unrealPct)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {view === "journal" && (
                <>
                  <ViewHead title="Journal" meta="Trading · last 12 weeks" />
                  <WeeklyBars />
                  <div className="pw__table pw__table--trades" role="table" aria-label="Recent trades">
                    <div className="pw__row pw__row--head" role="row">
                      <span role="columnheader">Date</span>
                      <span role="columnheader">Symbol</span>
                      <span role="columnheader">Setup</span>
                      <span role="columnheader" className="num">R</span>
                      <span role="columnheader" className="num">P&amp;L</span>
                    </div>
                    {RECENT_TRADES.map((t) => (
                      <div className="pw__row" role="row" key={`${t.date}-${t.symbol}`}>
                        <span role="cell" className="mono pw__dim">{t.date}</span>
                        <span role="cell" className="pw__sym">
                          {t.symbol}
                          <small>{t.side}</small>
                        </span>
                        <span role="cell"><span className="pw__tag">#{t.setup}</span></span>
                        <span role="cell" className={`num tone-${toneOf(t.r)}`}>{t.r > 0 ? "+" : ""}{t.r.toFixed(1)}R</span>
                        <span role="cell" className={`num tone-${toneOf(t.pnl)}`}>{formatMoneyDelta(t.pnl, "EUR")}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {view === "calendar" && (
                <>
                  <ViewHead title="Calendar" meta="Realized P&L by day" />
                  <PnlCalendar />
                </>
              )}

              {view === "performance" && (
                <>
                  <ViewHead title="Performance" meta="All-time · trading" />
                  <div className="pw__stats">
                    {[
                      { k: "Net P&L", v: formatMoneyDelta(1248012, "EUR"), tone: "gain" },
                      { k: "Win rate", v: "64%" },
                      { k: "Profit factor", v: "2.31×", tone: "gain" },
                      { k: "Expectancy", v: formatMoneyDelta(18640, "EUR"), tone: "gain" },
                      { k: "Max drawdown", v: formatMoneyDelta(-214030, "EUR"), tone: "loss" },
                      { k: "Avg hold", v: "3.4 d" },
                    ].map((s) => (
                      <div key={s.k}>
                        <span className="eyebrow">{s.k}</span>
                        <span className={s.tone ? `num tone-${s.tone}` : "num"}>{s.v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="eyebrow pw__subhead">2026 monthly returns</div>
                  <div className="pw__months">
                    {MONTHS.map((m, i) => {
                      const r = MONTHLY_2026[i];
                      return (
                        <span
                          key={i}
                          className={`pw__month pw__month--${r == null ? "empty" : toneOf(r)}`}
                          style={r == null ? undefined : ({ "--m": Math.min(1, Math.abs(r) / 0.08) } as CSSProperties)}
                          title={r == null ? undefined : formatPct(r)}
                        >
                          <small>{m}</small>
                          {r == null ? "" : `${r > 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}`}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="pw__viewHead">
      <span className="pw__viewTitle">{title}</span>
      <span className="pw__viewMeta">{meta}</span>
    </div>
  );
}
