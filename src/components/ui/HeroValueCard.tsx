import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import {
  usePortfolioDeltaCents,
  usePortfolioValueCents,
} from "@/store/selectors";

type HeroValueCardProps = {
  label?: string;
  caption?: string;
};

export function HeroValueCard({
  label = "Total Portfolio Value",
  caption = "this week",
}: HeroValueCardProps) {
  const valueCents = usePortfolioValueCents();
  const deltaCents = usePortfolioDeltaCents("1W");

  return (
    <div className="heroCard">
      <div className="heroCard__inner">
        <Eyebrow>{label}</Eyebrow>
        {valueCents == null ? <ValueSkeleton /> : <Value valueCents={valueCents} />}
        <Meta deltaCents={deltaCents} valueCents={valueCents} caption={caption} />
      </div>
    </div>
  );
}

function Value({ valueCents }: { valueCents: number }) {
  const dollars = Math.trunc(valueCents / 100);
  const cents = Math.abs(valueCents % 100)
    .toString()
    .padStart(2, "0");
  return (
    <div className="heroValue">
      ${dollars.toLocaleString("en-US")}
      <span className="heroValue__cents">.{cents}</span>
    </div>
  );
}

function ValueSkeleton() {
  return (
    <div className="heroValue" style={{ color: "var(--text-tertiary)" }}>
      $—
    </div>
  );
}

type MetaProps = {
  deltaCents: number | null;
  valueCents: number | null;
  caption: string;
};

function Meta({ deltaCents, valueCents, caption }: MetaProps) {
  if (deltaCents == null || valueCents == null) {
    return (
      <div className="heroMeta">
        <span className="heroMeta__caption">{caption}</span>
      </div>
    );
  }
  const tone = toneOf(deltaCents);
  const Arrow = tone === "loss" ? ArrowDownRight : ArrowUpRight;
  const pct = valueCents === 0 ? 0 : deltaCents / valueCents;
  return (
    <div className="heroMeta">
      <span className={`stat__delta stat__delta--${tone}`}>
        <Arrow size={14} strokeWidth={1.75} />
        {formatCents(Math.abs(deltaCents))}
      </span>
      <span className={`stat__delta stat__delta--${tone}`}>{formatPct(pct)}</span>
      <span className="heroMeta__caption">{caption}</span>
    </div>
  );
}
