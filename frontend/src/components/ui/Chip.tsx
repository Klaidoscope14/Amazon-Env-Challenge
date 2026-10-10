import type { HTMLAttributes } from "react";

/**
 * Small neutral pill used for inline tags (e.g. pollutant values). Accent
 * pills with their own semantics (DataBadge, StatusBadge, delivery chips) keep
 * their dedicated components.
 */
export default function Chip({ className = "", ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-1 text-xs bg-surface-2 text-foreground ${className}`}
      {...rest}
    />
  );
}
