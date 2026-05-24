import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  flush?: boolean;
  children?: ReactNode;
};

export function Card({ interactive, flush, className, children, ...rest }: CardProps) {
  const classes = [
    "card",
    interactive && "card--interactive",
    flush && "card--flush",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
