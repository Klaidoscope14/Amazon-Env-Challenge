"use client";

import type { ReactNode } from "react";
import { useArea } from "@/lib/area";
import type { AreaInfo } from "@/lib/types";
import AreaPicker from "./AreaPicker";
import Card from "./ui/Card";

/** Renders its children once the user's area is known; otherwise detects or asks. */
export default function AreaGate({ children }: { children: (area: AreaInfo) => ReactNode }) {
  const { area, status, message } = useArea();

  if (status === "ready" && area) return <>{children(area)}</>;
  if (status === "needs-choice") return <AreaPicker intro={message} />;

  return (
    <Card role="status" className="p-6 text-sm text-muted-strong shadow-none">
      <p className="font-medium text-foreground">Finding the nearest air-quality monitoring station…</p>
      <p className="mt-1 text-muted">
        Allow location access when your browser asks. Your location is only used to find the
        nearest station and is not stored.
      </p>
    </Card>
  );
}
