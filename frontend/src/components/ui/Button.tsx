import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "danger" | "secondary";
export type ButtonSize = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  secondary: "border border-border-strong text-muted-strong hover:bg-surface-2",
};

// `sm` keeps a 44px min height so it stays a comfortable touch target.
const SIZES: Record<ButtonSize, string> = {
  md: "px-4 py-2 text-sm",
  sm: "min-h-11 px-3 text-xs",
};

/**
 * Shared className for buttons and button-styled links, so a <button> and a
 * next/link <Link> can look identical. Use <Button> for plain buttons.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  ...rest
}: ButtonProps) {
  return <button className={buttonClasses({ variant, size, fullWidth, className })} {...rest} />;
}
