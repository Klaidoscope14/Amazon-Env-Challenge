"use client";

import { useState, type ReactNode } from "react";
import { areaSubtitle } from "@/lib/area";
import type { AreaInfo } from "@/lib/types";
import AreaPicker from "./AreaPicker";

interface AreaHeaderProps {
  area: AreaInfo;
  title: string;
  /** Extra controls shown on the right (e.g. presenter controls). */
  actions?: ReactNode;
}

/** Page heading naming the current area, with a "Change location" control. */
export default function AreaHeader({ area, title, actions }: AreaHeaderProps) {
  const [changing, setChanging] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{title}</p>
          <h1 className="text-2xl font-bold text-foreground">{area.name}</h1>
          <p className="text-sm text-muted mt-1">
            {areaSubtitle(area)}
            {areaSubtitle(area) ? " · " : ""}
            <button
              type="button"
              onClick={() => setChanging((v) => !v)}
              aria-expanded={changing}
              className="font-medium text-accent-text underline"
            >
              {changing ? "Cancel" : "Change location"}
            </button>
          </p>
        </div>
        {actions}
      </div>
      {changing && <AreaPicker onDone={() => setChanging(false)} />}
    </div>
  );
}
