"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAreas } from "@/lib/api";
import { areaSubtitle, useArea } from "@/lib/area";
import type { AreaInfo } from "@/lib/types";
import Button from "./ui/Button";

const MAX_RESULTS = 60;

interface AreaPickerProps {
  /** Shown above the list, e.g. why automatic detection didn't work. */
  intro?: string | null;
  /** Called after an area is chosen or detected. */
  onDone?: () => void;
}

export default function AreaPicker({ intro, onDone }: AreaPickerProps) {
  const { chooseArea, detect, isDetecting } = useArea();
  const [search, setSearch] = useState("");
  const id = useId();

  const areasQuery = useQuery({
    queryKey: ["areas"],
    queryFn: getAreas,
    staleTime: 30 * 60 * 1000,
    refetchInterval: false,
  });

  const matches = useMemo(() => {
    const areas = areasQuery.data?.areas ?? [];
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return areas
      .filter((a) => {
        const text = `${a.name} ${a.city} ${a.state}`.toLowerCase();
        return terms.every((t) => text.includes(t));
      })
      .slice(0, MAX_RESULTS);
  }, [areasQuery.data, search]);

  function choose(area: AreaInfo) {
    chooseArea(area);
    onDone?.();
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4"
    >
      <div>
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          Choose your area
        </h2>
        <p className="text-sm text-muted mt-1">
          {intro ?? "Air quality is shown for the area around your location, anywhere in India."}
        </p>
      </div>

      <Button
        type="button"
        onClick={async () => {
          if (await detect()) onDone?.();
        }}
        disabled={isDetecting}
        className="gap-2"
      >
        {isDetecting ? "Finding your location…" : "Use my location"}
      </Button>

      <div>
        <label htmlFor={`${id}-search`} className="block text-sm font-medium text-muted-strong mb-1">
          Or search for a city
        </label>
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Delhi, Pune, Anand Vihar"
          autoComplete="off"
          className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {areasQuery.isPending && <p className="text-sm text-muted">Loading areas…</p>}
      {areasQuery.isError && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          Couldn&apos;t load the list of areas.{" "}
          <button onClick={() => areasQuery.refetch()} className="underline font-medium">
            Retry
          </button>
        </p>
      )}

      {areasQuery.data && (
        <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded-lg border border-border">
          {matches.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted">No matching areas.</li>
          )}
          {matches.map((area) => (
            <li key={area.id}>
              <button
                type="button"
                onClick={() => choose(area)}
                aria-label={`${area.name}, ${areaSubtitle(area)}`}
                className="w-full text-left px-3 py-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                <span className="block text-sm font-medium text-foreground">{area.name}</span>
                <span className="block text-xs text-muted">{areaSubtitle(area)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {areasQuery.data?.source === "cities" && (
        <p className="text-xs text-muted">
          Demo mode: areas are cities and readings are labelled sample values.
        </p>
      )}
    </section>
  );
}
