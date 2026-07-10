import { ALL_ACCOUNTS } from "@/store";
import {
  usePortfolioBaseCurrency,
  usePortfolioValueCents,
  usePortfolioValueSeries,
} from "@/store/selectors";
import { PerformanceCard } from "./PerformanceCard";

/** The Overview hero — portfolio-wide value + rate-of-return performance curve. */
export function PortfolioPerformanceCard() {
  const valueCents = usePortfolioValueCents();
  const series = usePortfolioValueSeries();
  const currency = usePortfolioBaseCurrency();
  return (
    <PerformanceCard
      label="Total Portfolio Value"
      valueCents={valueCents}
      series={series}
      scope={ALL_ACCOUNTS}
      currency={currency}
    />
  );
}
