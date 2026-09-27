import { useId } from "react";

type BrandMarkProps = {
  size?: number;
  className?: string;
};

/**
 * The Picofolio mark: a lowercase "p" whose bowl is a price line that never
 * quite closes — it ends in the live-price dot, the last point on every chart
 * in the app. Off-white stroke on a lamplit near-black tile; the single dot is
 * the only accent (a brand moment, per the accent budget).
 */
export function BrandMark({ size = 24, className }: BrandMarkProps) {
  // Gradient ids must be unique per instance — several marks can share a page.
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262A33" />
          <stop offset="1" stopColor="#0F1115" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.2" />
          <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.06" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.04" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#C44536" stopOpacity="0.6" />
          <stop offset="1" stopColor="#C44536" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8.5"
        fill={`url(#${id}-tile)`}
        stroke={`url(#${id}-edge)`}
      />
      <path
        d="M11 8.5V24M11 13.5a5.5 5.5 0 1 1 5.5 5.5"
        stroke="#E8E8EA"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="19" r="5" fill={`url(#${id}-glow)`} />
      <circle cx="16.5" cy="19" r="2.2" fill="#D4513F" />
    </svg>
  );
}
