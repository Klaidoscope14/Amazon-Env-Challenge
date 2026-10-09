"use client";

import { STATUS_CONFIG } from "@/lib/constants";
import type { AQIStatus } from "@/lib/types";

interface StatusBadgeProps {
  status: AQIStatus;
  large?: boolean;
}

export default function StatusBadge({ status, large }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.Good;

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-lg border ${config.bg} ${config.color} ${config.border} ${large ? "px-4 py-2 text-lg" : "px-3 py-1 text-sm"}`}
    >
      {config.text}
    </span>
  );
}
