import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Github, Trash2 } from "lucide-react";
import { BrandMark, Kbd } from "@/components/primitives";
import {
  AllocationDemo,
  DataFlow,
  KeysDemo,
  PaletteDemo,
  PnlCalendar,
  ProductWindow,
  Reveal,
  WeeklyBars,
} from "@/components/landing";
import { useHotkeys } from "@/lib/hotkeys";
import { ACCOUNT_LONG_TERM_COLOR, ACCOUNT_TRADING_COLOR } from "@/lib/mock";
import { prefersReducedMotion } from "@/lib/useInView";
import {
  useClearAllData,
  useCompleteOnboarding,
  useSeedDemoData,
} from "@/store/selectors";

const REPO = "https://github.com/tmaximini/picofolio";

const NAV_LINKS = [
  { href: "#journal", label: "Journal" },
  { href: "#calendar", label: "Calendar" },
  { href: "#keys", label: "Keyboard" },
  { href: "#privacy", label: "Privacy" },
];

const HEADLINE: { text: string; em?: boolean }[][] = [
  [{ text: "Your" }, { text: "portfolio," }],
  [{ text: "in" }, { text: "a" }, { text: "better" }, { text: "light.", em: true }],
];

const FACTS = [
  { k: "No sign-up", v: "Open the page and start. There's nothing to register for." },
  { k: "No database", v: "Nothing about your portfolio is stored on a server." },
  { k: "No telemetry", v: "No analytics, no trackers, no pixels." },
  { k: "AGPL-3.0", v: "Every line is public. Read it, fork it, self-host it." },
];

const SPECS: { k: string; v: string }[] = [
  { k: "Broker", v: "Interactive Brokers, via Flex Query" },
  { k: "Accounts", v: "1 trading + N long-term, one switcher" },
  { k: "Positions", v: "Stocks, ETFs and options, multi-exchange" },
  { k: "Currencies", v: "Native prices, daily FX into your base" },
  { k: "Option marks", v: "MarketData.app, bring your own key" },
  { k: "Journal", v: "Setups, tags and notes per trade or day" },
  { k: "Storage", v: "Browser local storage, snapshot per sync" },
  { k: "Numerals", v: "Tabular, monospaced, right-aligned — always" },
  { k: "Price", v: "€0.00" },
];

type LandingProps = {
  /** first-run: the visitor must choose demo or empty. about: re-opened from the app. */
  mode: "first-run" | "about";
};

/**
 * The front door. On first run it stands in for the whole app until the
 * visitor picks demo data or an empty start. Set-up users reach it via About.
 * Every illustration is a live miniature of the real UI, not a screenshot.
 */
export function Landing({ mode }: LandingProps) {
  const navigate = useNavigate();
  const seedDemo = useSeedDemoData();
  const complete = useCompleteOnboarding();
  const clearAllData = useClearAllData();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firstRun = mode === "first-run";

  // Seed, then hard-load the overview: the store persists synchronously, so
  // the reload rehydrates with the demo portfolio and pages fetch prices on mount.
  const startWithDemo = useCallback(() => {
    seedDemo();
    window.location.assign("/overview");
  }, [seedDemo]);
  const startEmpty = useCallback(() => {
    complete();
    navigate("/overview", { replace: true });
  }, [complete, navigate]);
  const backToApp = useCallback(() => navigate("/overview"), [navigate]);

  const bindings = useMemo(
    () =>
      firstRun
        ? [
            { combo: "d", handler: startWithDemo },
            { combo: "e", handler: startEmpty },
          ]
        : [{ combo: "escape", handler: backToApp }],
    [firstRun, startWithDemo, startEmpty, backToApp],
  );
  useHotkeys(bindings);

  useEffect(() => {
    window.scrollTo(0, 0);
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The lamp: a pool of warm light that trails the pointer, eased so it
  // drifts rather than snaps. Written straight to CSS vars — no re-renders.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || prefersReducedMotion()) return;
    let tx = 0.5;
    let ty = 0.2;
    let x = tx;
    let y = ty;
    let raf = 0;
    const loop = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      el.style.setProperty("--mx", `${(x * 100).toFixed(2)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(2)}%`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.0005 ? requestAnimationFrame(loop) : 0;
    };
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth;
      ty = e.clientY / window.innerHeight;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const primaryCtas = firstRun ? (
    <>
      <button type="button" className="lcta lcta--primary" onClick={startWithDemo}>
        <span>Explore the demo</span>
        <Kbd>D</Kbd>
      </button>
      <button type="button" className="lcta" onClick={startEmpty}>
        <span>Start empty</span>
        <Kbd>E</Kbd>
      </button>
    </>
  ) : (
    <button type="button" className="lcta lcta--primary" onClick={backToApp}>
      <span>Back to app</span>
      <Kbd>esc</Kbd>
    </button>
  );

  let word = 0;

  return (
    <div className="landing" ref={rootRef}>
      <div className="landing__grain" aria-hidden />

      <header className={scrolled ? "lnav lnav--scrolled" : "lnav"}>
        <a className="lnav__brand" href="#top" aria-label="Picofolio — back to top">
          <BrandMark size={26} />
          <span className="wordmark">picofolio</span>
        </a>
        <nav className="lnav__links" aria-label="Sections">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="lnav__actions">
          <a className="lnav__icon" href={REPO} target="_blank" rel="noopener noreferrer" aria-label="Source on GitHub">
            <Github size={16} strokeWidth={1.5} />
          </a>
          <button
            type="button"
            className="lnav__cta"
            onClick={firstRun ? startWithDemo : backToApp}
          >
            {firstRun ? "Open demo" : "Back to app"}
            <ArrowRight size={14} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main>
        {/* ---------------- HERO ---------------- */}
        <section className="hero" id="top">
          <div className="hero__beam" aria-hidden />
          <div className="hero__lamp" aria-hidden />

          <div className="hero__copy">
            <p className="hero__kicker">
              <span className="hero__kickerDot" />
              For Interactive Brokers investors
              <span className="hero__kickerSep" />
              <span className="num">Local-first</span>
            </p>

            <h1 className="hero__title">
              {HEADLINE.map((line, li) => (
                <span className="hero__line" key={li}>
                  {line.map((w) => {
                    const i = word++;
                    return (
                      <span className="hero__wordMask" key={i}>
                        <span
                          className={w.em ? "hero__word hero__word--em" : "hero__word"}
                          style={{ "--w": i } as CSSProperties}
                        >
                          {w.text}
                        </span>
                      </span>
                    );
                  })}
                </span>
              ))}
            </h1>

            <p className="hero__sub">
              Picofolio turns your IBKR accounts into one calm, keyboard-driven
              view — a trading journal and a long-term book, side by side. No
              sign-up, no cloud, just your numbers, set properly.
            </p>

            <div className="hero__ctas">
              {primaryCtas}
              <a className="lcta lcta--link" href={REPO} target="_blank" rel="noopener noreferrer">
                <span>Read the source</span>
                <ArrowUpRight size={14} strokeWidth={1.75} />
              </a>
            </div>
          </div>

          <div className="hero__window">
            <ProductWindow />
          </div>
        </section>

        {/* ---------------- TWO BOOKS ---------------- */}
        <section className="lsec" id="journal">
          <div className="lsec__intro">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">01</span> Two books, one ledger
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Trade the week. <em>Hold the decade.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              Most investors run two strategies out of one broker. Picofolio
              keeps them apart where it matters — a journal for the trading
              sleeve, an allocation view for the long-term book — and adds them
              up where it counts.
            </Reveal>
          </div>

          <div className="books">
            <Reveal className="book" delay={1}>
              <div className="book__head">
                <span className="book__id" style={{ background: ACCOUNT_TRADING_COLOR }} />
                <span className="book__name">Trading sleeve</span>
                <span className="book__tag num">U1234567</span>
              </div>
              <WeeklyBars />
              <p className="book__caption">
                Weekly realized P&amp;L, rolling. Every fill tagged with the
                setup that earned it — or cost it.
              </p>
            </Reveal>
            <Reveal className="book" delay={2}>
              <div className="book__head">
                <span className="book__id" style={{ background: ACCOUNT_LONG_TERM_COLOR }} />
                <span className="book__name">Long-term book</span>
                <span className="book__tag num">U7654321</span>
              </div>
              <AllocationDemo />
              <p className="book__caption">
                Weights by symbol and sector, with weekly, month-to-date and
                year-to-date deltas on the combined value.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ---------------- CALENDAR ---------------- */}
        <section className="lsec lsec--split" id="calendar">
          <div className="lsec__intro">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">02</span> The P&amp;L calendar
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Every session, <em>accounted for.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              Realized profit and loss, laid out by day. Streaks, slumps and
              that one Thursday you'd rather forget — legible at a glance, in
              muted sage and terracotta instead of casino green.
            </Reveal>
          </div>
          <Reveal className="lsec__stage" delay={2}>
            <PnlCalendar />
          </Reveal>
        </section>

        {/* ---------------- KEYBOARD ---------------- */}
        <section className="lsec lsec--split lsec--flip" id="keys">
          <div className="lsec__intro">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">03</span> Keyboard first
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Your hands never <em>leave the keys.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              Every action has a shortcut. <span className="num">⌘K</span> finds
              any symbol, page or action;{" "}
              <span className="nowrap"><span className="num">g</span>-chords</span> jump between views the way Linear taught you. The mouse is optional.
            </Reveal>
            <Reveal delay={3}>
              <KeysDemo />
            </Reveal>
          </div>
          <Reveal className="lsec__stage" delay={2}>
            <PaletteDemo />
          </Reveal>
        </section>

        {/* ---------------- PRIVACY ---------------- */}
        <section className="lsec" id="privacy">
          <div className="lsec__intro lsec__intro--center">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">04</span> Local-first
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Your keys. <em>Your machine.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              There's no Picofolio account, because there's no Picofolio server
              holding your data. Bring your own Flex token; positions, fills and
              notes live in your browser — and leave with you.
            </Reveal>
          </div>
          <Reveal delay={2}>
            <DataFlow />
          </Reveal>
          <ul className="facts">
            {FACTS.map((f, i) => (
              <Reveal as="li" className="fact" key={f.k} delay={i}>
                <span className="fact__k">{f.k}</span>
                <span className="fact__v">{f.v}</span>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------- SPEC SHEET ---------------- */}
        <section className="lsec lsec--split">
          <div className="lsec__intro">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">05</span> The fine print
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              The details <em>are the product.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              One broker, done properly, beats five done badly. What's in the
              box — and just as deliberately, what isn't: no news feed, no
              social, no AI, no crypto-green.
            </Reveal>
          </div>
          <dl className="spec">
            {SPECS.map((s, i) => (
              <Reveal className="spec__row" key={s.k} delay={i * 0.5}>
                <dt>{s.k}</dt>
                <dd className={s.k === "Price" ? "num spec__price" : "num"}>{s.v}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* ---------------- CLOSE ---------------- */}
        <section className="close">
          <div className="close__word wordmark" aria-hidden>
            picofolio
          </div>
          <Reveal as="h2" className="close__title">
            {firstRun ? (
              <>
                Open it. <em>Look around.</em>
              </>
            ) : (
              <>
                Thanks for <em>looking closely.</em>
              </>
            )}
          </Reveal>
          <Reveal as="p" className="close__sub" delay={1}>
            {firstRun
              ? "It's all demo data until you say otherwise — and one click in Settings clears it."
              : "Everything here lives on this machine. You can take it with you, or wipe it clean."}
          </Reveal>
          <Reveal className="close__ctas" delay={2}>
            {primaryCtas}
          </Reveal>

          {!firstRun && (
            <div className="close__danger">
              {confirmingClear ? (
                <>
                  <p>
                    Erase every account, trade, note, IBKR connection and setting
                    on this device? This can't be undone.
                  </p>
                  <div className="close__dangerRow">
                    <button type="button" className="lcta lcta--danger" onClick={clearAllData}>
                      <Trash2 size={13} strokeWidth={1.75} />
                      <span>Erase everything</span>
                    </button>
                    <button type="button" className="lcta lcta--link" onClick={() => setConfirmingClear(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="lcta lcta--link lcta--quiet" onClick={() => setConfirmingClear(true)}>
                  <Trash2 size={13} strokeWidth={1.75} />
                  <span>Clear all local data</span>
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="lfoot">
        <div className="lfoot__brand">
          <BrandMark size={20} />
          <span className="wordmark">picofolio</span>
        </div>
        <p className="lfoot__meta">
          Portfolio tracker &amp; trading journal. Not affiliated with
          Interactive Brokers.
        </p>
        <div className="lfoot__links">
          <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">AGPL-3.0</a>
          <span className="num">© 2026</span>
        </div>
      </footer>
    </div>
  );
}
