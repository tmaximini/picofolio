import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CalendarDays,
  KeyRound,
  LineChart,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/primitives";
import {
  useClearAllData,
  useCompleteOnboarding,
  useDismissWelcome,
  useIsFirstRun,
  useSeedDemoData,
} from "@/store/selectors";

/** Product highlights — kept terse; the welcome screen is an intro, not a tour. */
const FEATURES: { icon: typeof LineChart; label: string; body: string }[] = [
  {
    icon: LineChart,
    label: "Portfolio overview",
    body: "Combined value across accounts with weekly, MTD & YTD deltas.",
  },
  {
    icon: BarChart3,
    label: "Trading journal",
    body: "Weekly realized P&L, setups, and a tagged trade log.",
  },
  {
    icon: CalendarDays,
    label: "P&L calendar",
    body: "Realized profit and loss by day, at a glance.",
  },
  {
    icon: KeyRound,
    label: "Bring your own keys",
    body: "Connect IBKR via Flex Query. Your data stays on your machine.",
  },
];

/**
 * First-run welcome / landing container. Shown until the user picks a path
 * (demo data or an empty portfolio); re-openable via "About". On genuine
 * first run there's no dismiss — the choice is required. In "About" mode the
 * user already has data, so it's purely informational with a close affordance.
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

  // Lock background scroll while the takeover is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className="welcome"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Picofolio"
    >
      <div className="welcome__card">
        {!firstRun && (
          <button
            type="button"
            className="modal__close welcome__close"
            onClick={dismiss}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        )}

        <div className="welcome__brand">Picofolio</div>
        <h1 className="welcome__headline">
          A trading journal and portfolio overview, obsessively designed.
        </h1>
        <p className="welcome__sub">
          A minimal, local-first tracker for the Interactive Brokers investor —
          one trading sleeve, one long-term book, one calm interface.
        </p>

        <ul className="welcome__features">
          {FEATURES.map(({ icon: Icon, label, body }) => (
            <li className="welcome__feature" key={label}>
              <span className="welcome__featureIcon">
                <Icon size={16} strokeWidth={1.5} />
              </span>
              <span className="welcome__featureText">
                <span className="welcome__featureLabel">{label}</span>
                <span className="welcome__featureBody">{body}</span>
              </span>
            </li>
          ))}
        </ul>

        {firstRun ? (
          <div className="welcome__cta">
            <Button variant="primary" onClick={startWithDemo}>
              Start with demo data
            </Button>
            <Button variant="ghost" onClick={complete}>
              Start empty
            </Button>
          </div>
        ) : confirmingClear ? (
          <div className="welcome__danger">
            <p className="welcome__dangerText">
              Erase all local data — accounts, trades, notes, IBKR connections,
              and settings? This can't be undone.
            </p>
            <div className="welcome__cta">
              <button
                type="button"
                className="btn welcome__dangerBtn"
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
          <div className="welcome__cta">
            <Button variant="primary" onClick={dismiss}>
              Back to app
            </Button>
            <Button
              variant="ghost"
              className="welcome__clearTrigger"
              onClick={() => setConfirmingClear(true)}
            >
              <Trash2 size={13} strokeWidth={1.75} />
              <span>Clear all data</span>
            </Button>
          </div>
        )}

        <p className="welcome__foot">
          {firstRun
            ? "Demo data is fully removable later in Settings. No account required."
            : "Local-first · BYOK · your data never leaves your machine."}
        </p>
      </div>
    </div>,
    document.body,
  );
}
