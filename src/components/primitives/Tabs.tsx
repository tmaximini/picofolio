import type { ReactNode } from "react";

type TabsProps<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
};

export function Tabs<T extends string>({ value, onChange, options }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "tab tab--active" : "tab"}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
