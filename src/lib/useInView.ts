import { useEffect, useRef, useState } from "react";

/**
 * One-shot visibility trigger for scroll-reveal motion. Flips to true the
 * first time the element crosses the threshold and stays true — reveals
 * never replay on scroll-back (that reads as jittery on a financial page).
 */
export function useInView<T extends Element>(
  options: { threshold?: number; rootMargin?: string } = {},
) {
  const { threshold = 0.25, rootMargin = "0px 0px -10% 0px" } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold, rootMargin]);

  return [ref, inView] as const;
}

/** True when the user asked the OS for less motion. Read once per mount. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
