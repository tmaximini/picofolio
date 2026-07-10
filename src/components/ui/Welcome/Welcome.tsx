import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  CalendarDays,
  Command,
  Github,
  HardDrive,
  LineChart,
  NotebookPen,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Button, Kbd } from "@/components/primitives";
import {
  useClearAllData,
  useCompleteOnboarding,
  useDismissWelcome,
  useIsFirstRun,
  useSeedDemoData,
} from "@/store/selectors";
import overviewShot from "@/assets/landing/overview.png";
import journalShot from "@/assets/landing/journal.png";
import calendarShot from "@/assets/landing/calendar.png";
import holdingsShot from "@/assets/landing/holdings.png";
import "./welcome.css";

const FEATURES: { icon: typeof LineChart; label: string; body: string }[] = [
  {
    icon: LineChart,
    label: "Multi-account overview",
    body: "Combined portfolio value across trading and long-term accounts, with day, week, MTD and YTD deltas.",
  },
  {
    icon: NotebookPen,
    label: "Trading journal",
    body: "Weekly realized P&L, win rate, average win/loss, and a trade log tagged by setup.",
  },
  {
    icon: CalendarDays,
    label: "P&L calendar",
    body: "Realized profit and loss by day with weekly summaries — your month at a glance.",
  },
  {
    icon: Table2,
    label: "Holdings & allocation",
    body: "A sortable combined table with expandable price charts and allocation by symbol and sector.",
  },
  {
    icon: Command,
    label: "Keyboard-first",
    body: "A ⌘K command palette, Linear-style g-navigation, and single-key actions for everything.",
  },
  {
    icon: HardDrive,
    label: "Local-first, BYOK",
    body: "Connect IBKR with your own Flex Query token. Everything stays in your browser — no server, no signup.",
  },
];

/** Alternating product-shot sections. Copy is written for scanning — and for
 *  search engines: real headings, real sentences, no lorem. */
const SHOWCASES: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  shot: string;
  alt: string;
}[] = [
    {
      eyebrow: "Trading journal",
      title: "Know exactly what your trading generates.",
      body: "The journal turns fills into answers: how much this week, which setups pay, where the leaks are.",
      points: [
        "Daily and cumulative P&L, rolling by week",
        "Win rate, average win/loss, best and worst trade",
        "Setups and tags on every trade",
      ],
      shot: journalShot,
      alt: "Picofolio trading journal showing account value chart, daily P&L bars, win rate and trade statistics",
    },
    {
      eyebrow: "P&L calendar",
      title: "Every day, settled and accounted for.",
      body: "A month of realized P&L on one screen — green days, red days, weekly summaries, and the trades behind each number.",
      points: [
        "Realized P&L by day with trade counts",
        "Weekly summary column, monthly totals",
        "Best and worst trade of the month",
      ],
      shot: calendarShot,
      alt: "Picofolio calendar view showing realized profit and loss by day with weekly summaries",
    },
    {
      eyebrow: "Holdings",
      title: "Your long-term book, kept honest.",
      body: "All accounts in one sortable table — native currencies converted at daily FX rates, charts one click away.",
      points: [
        "Day change and unrealized P&L per position",
        "Allocation by symbol and sector",
        "Expandable price charts inline",
      ],
      shot: holdingsShot,
      alt: "Picofolio holdings table with positions, weights, day change and unrealized P&L",
    },
  ];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["G", "O"], label: "Overview" },
  { keys: ["G", "A"], label: "Journal" },
  { keys: ["N"], label: "New trade" },
  { keys: ["R"], label: "Sync prices" },
  { keys: ["?"], label: "All shortcuts" },
];

/**
 * Full-page landing. The default surface for a brand-new visitor: product
 * story, screenshots, and a choice of demo data or an empty portfolio.
 * Re-openable via "About" — in that mode the user already has data, so the
 * CTAs become "Back to app" plus the (two-step) clear-all-data escape hatch.
 */
export function Welcome() {
  const firstRun = useIsFirstRun();
  const seedDemo = useSeedDemoData();
  const complete = useCompleteOnboarding();
  const dismiss = useDismissWelcome();
  const clearAllData = useClearAllData();
  // Two-step guard on the destructive "clear all data" action.
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Seed, then hard-reload. The store persists to localStorage synchronously,
  // so the reload rehydrates with the demo portfolio and the pages' mount-time
  // price fetch runs cleanly — populating charts/values without a manual sync.
  const startWithDemo = () => {
    seedDemo();
    window.location.reload();
  };

  // Esc closes only in About mode — first run forces an explicit choice.
  useEffect(() => {
    if (firstRun) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [firstRun, dismiss]);

  // Lock background scroll while the takeover is up (it scrolls internally).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // First-run choice, rendered twice (hero + closing section).
  const startCtas = (
    <div className="landing__cta">
      <Button variant="primary" onClick={startWithDemo}>
        <span>Start with demo data</span>
        <ArrowRight size={14} strokeWidth={1.75} />
      </Button>
      <Button variant="ghost" onClick={complete}>
        Start empty
      </Button>
    </div>
  );

  const primaryCtas = firstRun ? (
    startCtas
  ) : confirmingClear ? (
    <div className="landing__danger">
      <p className="landing__dangerText">
        Erase all local data — accounts, trades, notes, IBKR connections, and
        settings? This can't be undone.
      </p>
      <div className="landing__cta">
        <button
          type="button"
          className="btn landing__dangerBtn"
          onClick={clearAllData}
        >
          <Trash2 size={13} strokeWidth={1.75} />
          <span>Clear everything</span>
        </button>
        <Button variant="ghost" onClick={() => setConfirmingClear(false)}>
          Cancel
        </Button>
      </div>
    </div>
  ) : (
    <div className="landing__cta">
      <Button variant="primary" onClick={dismiss}>
        Back to app
      </Button>
      <Button
        variant="ghost"
        className="landing__clearTrigger"
        onClick={() => setConfirmingClear(true)}
      >
        <Trash2 size={13} strokeWidth={1.75} />
        <span>Clear all data</span>
      </Button>
    </div>
  );

  return createPortal(
    <div
      className="landing"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Picofolio"
    >
      <header className="landing__nav">
        <span className="landing__brand">Picofolio</span>
        <div className="landing__navRight">
          <a
            className="landing__navLink"
            href="https://github.com/tmaximini/picofolio"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github size={14} strokeWidth={1.75} />
            <span>GitHub</span>
          </a>
          {!firstRun && (
            <button
              type="button"
              className="modal__close landing__close"
              onClick={dismiss}
              aria-label="Close"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </header>

      <main className="landing__main">
        {/* ---------- hero ---------- */}
        <section className="landing__hero" aria-label="Introduction">
          <p className="landing__eyebrow">
            Local-first · Keyboard-first · Bring your own keys
          </p>
          <h1 className="landing__headline">
            A <em>minimalistic</em> portfolio tracker and trading journal{" "}

          </h1>
          <p className="landing__sub">
            Picofolio is a minimal, local-first tracker for the Interactive
            Brokers investor — one trading sleeve, one long-term book, one calm
            interface. Your data never leaves your machine. <em>Free &amp; open source.</em>
          </p>
          {primaryCtas}
          <p className="landing__foot">
            {firstRun
              ? "Demo data is fully removable later in Settings. No account required."
              : "Local-first · BYOK · your data never leaves your machine."}
          </p>
          <figure className="landing__shot">
            <img
              src={overviewShot}
              alt="Picofolio portfolio overview with account value chart, total return and holdings table"
              width={1800}
              height={1395}
            />
          </figure>
        </section>

        {/* ---------- feature grid ---------- */}
        <section className="landing__section" aria-labelledby="landing-features">
          <p className="landing__eyebrow">What's inside</p>
          <h2 className="landing__sectionTitle" id="landing-features">
            One excellent IBKR integration, not five mediocre ones.
          </h2>
          <ul className="landing__features">
            {FEATURES.map(({ icon: Icon, label, body }) => (
              <li className="landing__feature" key={label}>
                <span className="landing__featureIcon">
                  <Icon size={16} strokeWidth={1.5} />
                </span>
                <h3 className="landing__featureLabel">{label}</h3>
                <p className="landing__featureBody">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- product showcases ---------- */}
        {SHOWCASES.map((s, i) => (
          <section
            className={`landing__showcase${i % 2 ? " landing__showcase--flip" : ""}`}
            key={s.eyebrow}
            aria-label={s.eyebrow}
          >
            <div className="landing__showcaseCopy">
              <p className="landing__eyebrow">{s.eyebrow}</p>
              <h2 className="landing__showcaseTitle">{s.title}</h2>
              <p className="landing__showcaseBody">{s.body}</p>
              <ul className="landing__showcasePoints">
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <figure className="landing__showcaseShot">
              <img src={s.shot} alt={s.alt} loading="lazy" />
            </figure>
          </section>
        ))}

        {/* ---------- keyboard strip ---------- */}
        <section className="landing__section" aria-labelledby="landing-keys">
          <p className="landing__eyebrow">Keyboard-first</p>
          <h2 className="landing__sectionTitle" id="landing-keys">
            Your hands never leave the keys.
          </h2>
          <ul className="landing__keys">
            {SHORTCUTS.map(({ keys, label }) => (
              <li className="landing__key" key={label}>
                <span className="landing__keyCaps">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
                <span className="landing__keyLabel">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- closing CTA (first run only) ---------- */}
        {firstRun && (
          <section className="landing__closing" aria-label="Get started">
            <h2 className="landing__closingTitle">
              Sixty seconds from here to a live portfolio.
            </h2>
            <p className="landing__sub">
              Explore with realistic demo data, or start empty and connect your
              IBKR Flex Query in Settings.
            </p>
            {startCtas}
          </section>
        )}
      </main>

      <footer className="landing__footer">
        <span>Free &amp; open source · no server, no signup, no telemetry</span>
        <a
          className="landing__navLink"
          href="https://github.com/tmaximini/picofolio"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Github size={14} strokeWidth={1.75} />
          <span>tmaximini/picofolio</span>
        </a>
        <span className="landing__footerFine">
          Not affiliated with Interactive Brokers.
        </span>
      </footer>
    </div>,
    document.body,
  );
}
