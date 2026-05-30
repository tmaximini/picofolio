import { DATE_RANGE_OPTIONS, type DateRangeKey } from "@/lib/dateRange";

type DateRangePillsProps = {
  value: DateRangeKey;
  onChange: (next: DateRangeKey) => void;
};

export function DateRangePills({ value, onChange }: DateRangePillsProps) {
  return (
    <div className="rangePills" role="tablist" aria-label="Date range">
      {DATE_RANGE_OPTIONS.map((opt) => {
        const isActive = opt.key === value;
        const isReset = opt.key === "ALL";
        const classes = [
          "rangePill",
          isActive && "rangePill--active",
          isReset && "rangePill--reset",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={classes}
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
