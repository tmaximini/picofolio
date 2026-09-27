import type { CSSProperties, ElementType, ReactNode } from "react";
import { useInView } from "@/lib/useInView";

type RevealProps = {
  as?: ElementType;
  className?: string;
  /** Stagger slot — each step adds a short delay. */
  delay?: number;
  children: ReactNode;
};

/** Fades and lifts its children in (from a slight blur) on first scroll-in. */
export function Reveal({ as: Tag = "div", className, delay = 0, children }: RevealProps) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref}
      className={["reveal", inView && "reveal--on", className].filter(Boolean).join(" ")}
      style={{ "--delay": delay } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
