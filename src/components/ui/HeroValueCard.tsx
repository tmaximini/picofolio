import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Eyebrow } from "@/components/primitives";
import { formatMoney, formatPct, toneOf } from "@/lib/money";
import {
  usePortfolioBaseCurrency,
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
  const currency = usePortfolioBaseCurrency();

  return (
    <div className="heroCard">
      <div className="heroCard__inner">
        <Eyebrow>{label}</Eyebrow>
        {valueCents == null ? (
          <ValueSkeleton />
        ) : (
          <Value valueCents={valueCents} currency={currency} />
        )}
        <Meta
          deltaCents={deltaCents}
          valueCents={valueCents}
          caption={caption}
          currency={currency}
        />
      </div>
    </div>
  );
}

function Value({ valueCents, currency }: { valueCents: number; currency: string }) {
  // Split the formatted amount at its decimal point so the fraction renders
  // in the smaller cap — zero-decimal currencies (KRW, JPY) have no split.
  const formatted = formatMoney(valueCents, currency);
  const dot = formatted.lastIndexOf(".");
  const main = dot >= 0 ? formatted.slice(0, dot) : formatted;
  const frac = dot >= 0 ? formatted.slice(dot) : null;
  return (
    <div className="heroValue">
      {main}
      {frac && <span className="heroValue__cents">{frac}</span>}
    </div>
  );
}

function ValueSkeleton() {
  return (
    <div className="heroValue" style={{ color: "var(--text-tertiary)" }}>
      —
    </div>
  );
}

type MetaProps = {
  deltaCents: number | null;
  valueCents: number | null;
  caption: string;
  currency: string;
};

function Meta({ deltaCents, valueCents, caption, currency }: MetaProps) {
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
        {formatMoney(Math.abs(deltaCents), currency)}
      </span>
      <span className={`stat__delta stat__delta--${tone}`}>{formatPct(pct)}</span>
      <span className="heroMeta__caption">{caption}</span>
    </div>
  );
}
