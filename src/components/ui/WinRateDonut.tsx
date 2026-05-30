type WinRateDonutProps = {
  /** Ratio 0..1. */
  ratio: number;
  tone?: "gain" | "loss" | "neutral";
  label?: string;
};

export function WinRateDonut({ ratio, tone = "neutral", label }: WinRateDonutProps) {
  const r = 12;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  const dash = c * clamped;
  const gap = c - dash;
  const displayLabel = label ?? `${Math.round(clamped * 100)}%`;
  const arcClass =
    tone === "gain"
      ? "donut__arc--gain"
      : tone === "loss"
        ? "donut__arc--loss"
        : "donut__arc--neutral";
  return (
    <svg className="donut" viewBox="0 0 32 32">
      <circle
        className="donut__track"
        cx="16"
        cy="16"
        r={r}
        fill="none"
        strokeWidth="3"
      />
      <circle
        className={`donut__arc ${arcClass}`}
        cx="16"
        cy="16"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        transform="rotate(-90 16 16)"
      />
      <text className="donut__label" x="16" y="16">
        {displayLabel}
      </text>
    </svg>
  );
}
