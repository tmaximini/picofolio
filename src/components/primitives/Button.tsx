import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "ghost";
type Size = "default" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = "default",
  size = "default",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    variant === "primary" && "btn--primary",
    variant === "ghost" && "btn--ghost",
    size === "sm" && "btn--sm",
    icon && "btn--icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
