import { useEffect, useState } from "react";
import { prefersReducedMotion, useInView } from "@/lib/useInView";

const STEPS = [
  { keys: ["g", "h"], label: "Go to Holdings" },
  { keys: ["n"], label: "New trade" },
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["g", "c"], label: "Go to Calendar" },
  { keys: ["r"], label: "Sync every account" },
  { keys: ["?"], label: "Every shortcut" },
];

const TICK = 260;
/** Ticks a step lingers after its last key lands (caption reading time). */
const HOLD = 6;

/** Oversized keycaps playing the app's real shortcuts, one chord at a time. */
export function KeysDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    const id = window.setInterval(() => setTick((t) => t + 1), TICK);
    return () => window.clearInterval(id);
  }, [inView]);

  // Walk the tick counter onto (step, position-within-step).
  let t = tick;
  let s = 0;
  for (;;) {
    const len = STEPS[s]!.keys.length + HOLD;
    if (t < len) break;
    t -= len;
    s = (s + 1) % STEPS.length;
  }
  const step = STEPS[s]!;
  const isModifierCombo = step.keys[0] === "⌘";

  return (
    <div className="keys" ref={ref}>
      <div className="keys__row" key={s}>
        {step.keys.map((k, i) => {
          // Combos hold the modifier down; chords press and release in turn.
          const down = isModifierCombo ? t >= i && t < step.keys.length + 1 : t === i;
          const done = t > i;
          return (
            <span
              key={i}
              className={[
                "keycap",
                k.length === 1 && /[a-z?]/.test(k) ? "keycap--letter" : "",
                down ? "keycap--down" : "",
                done ? "keycap--done" : "",
              ].join(" ")}
            >
              {k}
            </span>
          );
        })}
      </div>
      <div className="keys__caption" key={`c-${s}`} data-on={t >= step.keys.length}>
        {step.label}
      </div>
      <div className="keys__dots" aria-hidden>
        {STEPS.map((_, i) => (
          <i key={i} className={i === s ? "is-on" : undefined} />
        ))}
      </div>
    </div>
  );
}
