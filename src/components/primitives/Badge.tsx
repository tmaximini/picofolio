import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant = "default" | "gain" | "loss" | "accent";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children?: ReactNode;
};

export function Badge({ variant = "default", className, children, ...rest }: BadgeProps) {
  const classes = [
    "badge",
    variant !== "default" && `badge--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
