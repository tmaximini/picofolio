import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Github } from "lucide-react";
import { BrandMark, Kbd } from "@/components/primitives";
import {
  AllocationDemo,
  DataFlow,
  KeysDemo,
  PaletteDemo,
  PnlCalendar,
  ProductWindow,
  Reveal,
  ReviewDemo,
  WeeklyBars,
} from "@/components/landing";
import { useHotkeys } from "@/lib/hotkeys";
import { prefersReducedMotion } from "@/lib/useInView";
import { ACCOUNT_LONG_TERM_COLOR, ACCOUNT_TRADING_COLOR } from "@/lib/mock";
import {
  useCompleteOnboarding,
  useSeedDemoData,
} from "@/store/selectors";

const REPO = "https://github.com/tmaximini/picofolio";

const NAV_LINKS = [
  { href: "#journal", label: "Journal" },
  { href: "#calendar", label: "Calendar" },
  { href: "#review", label: "Review" },
  { href: "#keys", label: "Keyboard" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
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

/** Rendered on the page and as FAQPage structured data — one source, so the
 *  markup search engines read always matches what visitors see. */
const FAQ: { q: string; a: string }[] = [
  {
    q: "Is Picofolio free?",
    a: "Yes. Picofolio is free and open source under the AGPL-3.0 licence. There's no account, no subscription and no paid tier.",
  },
  {
    q: "Where is my portfolio data stored?",
    a: "In your browser's local storage, on your device. There is no Picofolio database. Broker and price requests pass through a stateless relay only because brokers refuse requests made directly from a browser — it stores nothing.",
  },
  {
    q: "Do I need an Interactive Brokers account?",
    a: "No. You can add positions and trades by hand for any broker. If you use Interactive Brokers, you can connect a Flex Query to sync trades, positions, cash and daily account value automatically.",
  },
  {
    q: "How does the Interactive Brokers sync work?",
    a: "Create a Flex Query and a Flex Web Service token in IBKR Client Portal, then paste both into Picofolio's Settings. Picofolio pulls the statement when you sync. Access is read-only: it can't place orders or move money.",
  },
  {
    q: "Does it handle options and non-US stocks?",
    a: "Yes. Stocks and ETFs on major exchanges show in their native currency and convert into your base currency at daily FX rates. Open options can be marked live with your own MarketData.app key.",
  },
  {
    q: "Is there a desktop app?",
    a: "Picofolio runs in any modern desktop browser today. A native desktop app is planned.",
  },
];

const FAQ_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
}).replace(/</g, "\\u003c");

const SPECS: { k: string; v: string }[] = [
  { k: "Broker sync", v: "Interactive Brokers (Flex Query) — more to come" },
  { k: "Manual entry", v: "Any stock, ETF or option, any broker" },
  { k: "Accounts", v: "1 trading + N long-term, one switcher" },
  { k: "Positions", v: "Stocks, ETFs and options, multi-exchange" },
  { k: "Currencies", v: "Native prices, daily FX into your base" },
  { k: "Option marks", v: "MarketData.app, bring your own key" },
  { k: "Journal", v: "Setups, tags and notes per trade or day" },
  { k: "Review", v: "Tag mistakes and habits, see what each one costs" },
  { k: "Storage", v: "Browser local storage, snapshot per sync" },
  { k: "Numerals", v: "Tabular, monospaced, right-aligned — always" },
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
  const [scrolled, setScrolled] = useState(false);
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

  // In-page anchors scroll without touching the URL. A hash change is a
  // navigation, and in About mode that drops the router state that keeps "/"
  // on the landing page — the links used to bounce a set-up user into the app.
  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const id = e.currentTarget.getAttribute("href")?.slice(1);
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    if (id === "top") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior });
      return;
    }
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior, block: "start" });
  };

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
    <div className="landing">
      <div className="landing__grain" aria-hidden />

      <header className={scrolled ? "lnav lnav--scrolled" : "lnav"}>
        <a className="lnav__brand" href="#top" onClick={scrollTo} aria-label="Picofolio — back to top">
          <BrandMark size={26} />
          <span className="wordmark">picofolio</span>
        </a>
        <nav className="lnav__links" aria-label="Sections">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={scrollTo}>
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

          <div className="hero__copy">
            <p className="hero__kicker">
              <span className="hero__kickerDot" />
              Portfolio tracker &amp; trading journal
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
              One calm, keyboard-driven view of everything you own and trade —
              a journal for the trading book, allocation for the long-term one.
              Syncs automatically with Interactive Brokers. No sign-up, no
              cloud, just your numbers, set properly.
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
              Most investors run two strategies at once. Picofolio
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

        {/* ---------------- TRADE REVIEW ---------------- */}
        <section className="lsec" id="review">
          <div className="lsec__intro">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">03</span> Trade review
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Learn what your <em>mistakes cost.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              Step through every closed trade and tag what really happened — FOMO entry,
              missed stop, disciplined exit. Picofolio adds it up: which habits lose you
              money, which ones pay, and how your win rate changes when you break your own
              rules.
            </Reveal>
          </div>
          <Reveal className="lsec__stage lsec__stage--wide" delay={2}>
            <ReviewDemo />
          </Reveal>
        </section>

        {/* ---------------- KEYBOARD ---------------- */}
        <section className="lsec lsec--split lsec--flip" id="keys">
          <div className="lsec__intro">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">04</span> Keyboard first
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
              <span className="num">05</span> Local-first
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Your keys. <em>Your machine.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              There's no Picofolio account, because there's no Picofolio server
              holding your data. Enter positions by hand or bring your own broker
              token; positions, fills and notes live in your browser — and leave
              with you.
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
              <span className="num">06</span> What's inside
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Focus on what's <em>essential.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              Fewer features, each done properly. What's in the
              box — and just as deliberately, what isn't: no news feed, no
              social, no AI, no crypto-green.
            </Reveal>
          </div>
          <dl className="spec">
            {SPECS.map((s, i) => (
              <Reveal className="spec__row" key={s.k} delay={i * 0.5}>
                <dt>{s.k}</dt>
                <dd className="num">{s.v}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="lsec lsec--split lsec--top" id="faq">
          <div className="lsec__intro">
            <Reveal as="p" className="lsec__eyebrow">
              <span className="num">07</span> Questions
            </Reveal>
            <Reveal as="h2" className="lsec__title" delay={1}>
              Asked, <em>answered.</em>
            </Reveal>
            <Reveal as="p" className="lsec__lede" delay={2}>
              Anything else? Open an issue on GitHub — it's the whole support desk.
            </Reveal>
          </div>
          <div className="faq">
            {FAQ.map((f, i) => (
              <Reveal as="details" className="faq__item" key={f.q} delay={i * 0.5}>
                <summary className="faq__q">
                  <span>{f.q}</span>
                  <i className="faq__icon" aria-hidden />
                </summary>
                <p className="faq__a">{f.a}</p>
              </Reveal>
            ))}
          </div>
          <script
            type="application/ld+json"
            // Static, JSON-escaped constant — structured data, never executed.
            dangerouslySetInnerHTML={{ __html: FAQ_JSONLD }}
          />
        </section>

        {/* ---------------- CLOSE ---------------- */}
        <section className="close">
          <div className="close__word wordmark" aria-hidden>
            picofolio
          </div>
          <Reveal as="h2" className="close__title">
            {firstRun ? (
              <>
                See your trading <em>for what it is.</em>
              </>
            ) : (
              <>
                Back to <em>your numbers.</em>
              </>
            )}
          </Reveal>
          <Reveal as="p" className="close__sub" delay={1}>
            {firstRun
              ? "Explore with sample data in seconds, or start empty and connect Interactive Brokers. Your first review might surprise you."
              : "Everything is where you left it — on this device, and only here."}
          </Reveal>
          <Reveal className="close__ctas" delay={2}>
            {primaryCtas}
          </Reveal>
          {firstRun && (
            <Reveal as="p" className="close__trust" delay={3}>
              Free · Open source · No account · Your data stays on your device
            </Reveal>
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
        <p className="lfoot__legal">
          Picofolio is free, open-source software provided “as is”, without warranty of any
          kind, express or implied. It is not financial, investment or tax advice. Figures are
          derived from your broker's data and public price feeds and may be incomplete, delayed
          or wrong — always check your broker's statements before making decisions. You use it
          at your own risk; the authors aren't liable for any loss arising from its use. See the{" "}
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
            licence
          </a>{" "}
          for the full terms.
        </p>
      </footer>
    </div>
  );
}
