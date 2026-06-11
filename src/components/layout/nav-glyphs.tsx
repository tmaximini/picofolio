/**
 * Hand-drawn nav glyphs — 16×16, 1.5px stroke, no icon library. Each one
 * carries a single animatable element (needle, pulse, bars, dot, trend,
 * knobs) that the row's :hover wakes up via classes in app.css.
 */

type GlyphProps = { className?: string };

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Overview — a dial; the needle sweeps on hover. */
export function GlyphOverview({ className }: GlyphProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="8" cy="8" r="6" />
      <path
        className="navGlyph__needle"
        d="M8 8 L10.6 5.4"
        style={{ transformOrigin: "8px 8px" }}
      />
    </svg>
  );
}

/** Activity — a pulse line; redraws itself on hover. */
export function GlyphActivity({ className }: GlyphProps) {
  return (
    <svg {...base} className={className}>
      <path
        className="navGlyph__draw"
        d="M1.5 8.5 H4.2 L6.4 4 L9.6 12 L11.6 8.5 H14.5"
        pathLength={1}
      />
    </svg>
  );
}

/** Holdings — ledger rows; they nudge in sequence on hover. */
export function GlyphHoldings({ className }: GlyphProps) {
  return (
    <svg {...base} className={className}>
      <path className="navGlyph__bar" d="M2.5 4 H11" />
      <path className="navGlyph__bar" d="M2.5 8 H13.5" />
      <path className="navGlyph__bar" d="M2.5 12 H8.5" />
    </svg>
  );
}

/** Calendar — frame + today-dot; the dot steps to the next day on hover. */
export function GlyphCalendar({ className }: GlyphProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" />
      <path d="M2.5 6.25 H13.5" />
      <circle className="navGlyph__dot" cx="5.75" cy="9.75" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Performance — a trend with an end tick; redraws on hover. */
export function GlyphPerformance({ className }: GlyphProps) {
  return (
    <svg {...base} className={className}>
      <path
        className="navGlyph__draw"
        d="M2 13 L6.2 8.8 L9 10.6 L14 4.4"
        pathLength={1}
      />
      <path d="M10.8 4 H14 V7.2" />
    </svg>
  );
}

/** Settings — two sliders; the knobs trade places on hover. */
export function GlyphSettings({ className }: GlyphProps) {
  return (
    <svg {...base} className={className}>
      <path d="M1.5 5.25 H14.5" />
      <path d="M1.5 10.75 H14.5" />
      <circle className="navGlyph__knob navGlyph__knob--a" cx="10.5" cy="5.25" r="1.6" fill="currentColor" stroke="none" />
      <circle className="navGlyph__knob navGlyph__knob--b" cx="5.5" cy="10.75" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
