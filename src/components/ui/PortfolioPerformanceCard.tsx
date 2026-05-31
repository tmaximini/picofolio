import {
  usePortfolioValueCents,
  usePortfolioValueSeries,
} from "@/store/selectors";
import { PerformanceCard } from "./PerformanceCard";

/** The Overview hero — portfolio-wide value + rate-of-return performance curve. */
export function PortfolioPerformanceCard() {
  const valueCents = usePortfolioValueCents();
  const series = usePortfolioValueSeries();
  return (
    <PerformanceCard
      label="Total Portfolio Value"
      valueCents={valueCents}
      series={series}
    />
  );
}
