import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Muted inset surface (e.g. the "data unavailable" card) instead of the raised surface. */
  muted?: boolean;
}

/**
 * The shared card shell used across the app. Colours come from semantic tokens
 * (`surface` / `border`) so the card flips with the dark theme automatically.
 * Padding stays with the caller (cards use p-6, auth panels p-8, etc.).
 */
export default function Card({ muted = false, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border shadow-sm ${
        muted ? "bg-surface-2 border-border" : "bg-surface border-border"
      } ${className}`}
      {...rest}
    />
  );
}
