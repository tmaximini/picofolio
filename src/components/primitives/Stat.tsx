import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

type StatProps = {
  label: ReactNode;
  value: ReactNode;
  delta?: { value: ReactNode; tone?: "gain" | "loss" | "neutral" };
  display?: boolean;
};

export function Stat({ label, value, delta, display }: StatProps) {
  const valueClass = display ? "stat__value stat__value--display" : "stat__value";
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={valueClass}>{value}</span>
      {delta && <Delta tone={delta.tone ?? "neutral"}>{delta.value}</Delta>}
    </div>
  );
}

type DeltaProps = { tone?: "gain" | "loss" | "neutral"; children: ReactNode };

export function Delta({ tone = "neutral", children }: DeltaProps) {
  const cls = `stat__delta stat__delta--${tone}`;
  return (
    <span className={cls}>
      {tone === "gain" && <ArrowUpRight size={12} strokeWidth={1.75} />}
      {tone === "loss" && <ArrowDownRight size={12} strokeWidth={1.75} />}
      {children}
    </span>
  );
}
