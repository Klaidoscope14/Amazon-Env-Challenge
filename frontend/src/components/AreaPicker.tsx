"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAreas, resolvePlace, searchPlaces } from "@/lib/api";
import { areaSubtitle, useArea } from "@/lib/area";
import type { AreaInfo } from "@/lib/types";
import Button from "./ui/Button";

const MAX_RESULTS = 60;
const MIN_SEARCH = 3;
const DEBOUNCE_MS = 300;

interface AreaPickerProps {
  /** Shown above the list, e.g. why automatic detection didn't work. */
  intro?: string | null;
  /** Called after an area is chosen or detected. */
  onDone?: () => void;
}

export default function AreaPicker({ intro, onDone }: AreaPickerProps) {
  const { chooseArea, detect, isDetecting } = useArea();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState("");
  // One Google Places session per search, ended by choosing a result.
  const session = useRef<string>("");
  const id = useId();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const placesQuery = useQuery({
    queryKey: ["places", debounced],
    queryFn: () => {
      session.current ||= crypto.randomUUID();
      return searchPlaces(debounced, session.current);
    },
    enabled: debounced.length >= MIN_SEARCH,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Google search when it works; otherwise the built-in list of cities.
  const usePlaces = debounced.length >= MIN_SEARCH && !placesQuery.isError;

  async function choosePlace(placeId: string) {
    setResolving(placeId);
    setResolveError("");
    try {
      const { area } = await resolvePlace(placeId, session.current || crypto.randomUUID());
      session.current = "";
      choose(area);
    } catch {
      setResolveError("Couldn't open that place. Try another, or pick a city.");
    } finally {
      setResolving(null);
    }
  }

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
          Or search for your area
        </label>
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Lajpat Nagar, Koramangala, Pune"
          autoComplete="off"
          className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {usePlaces && (
        <div aria-live="polite">
          {placesQuery.isPending && <p className="text-sm text-muted">Searching…</p>}
          {placesQuery.data && (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded-lg border border-border">
              {placesQuery.data.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted">No places found. Try a nearby area or city.</li>
              )}
              {placesQuery.data.map((place) => (
                <li key={place.placeId}>
                  <button
                    type="button"
                    onClick={() => void choosePlace(place.placeId)}
                    disabled={resolving !== null}
                    aria-label={`${place.name}, ${place.detail}`}
                    className="w-full text-left px-3 py-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-60"
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {place.name}
                      {resolving === place.placeId && <span className="font-normal text-muted"> · opening…</span>}
                    </span>
                    <span className="block text-xs text-muted">{place.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {placesQuery.data && <p className="mt-1 text-right text-[11px] text-muted">Powered by Google</p>}
          {resolveError && (
            <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{resolveError}</p>
          )}
        </div>
      )}

      {!usePlaces && areasQuery.isPending && <p className="text-sm text-muted">Loading areas…</p>}
      {!usePlaces && areasQuery.isError && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          Couldn&apos;t load the list of areas.{" "}
          <button onClick={() => areasQuery.refetch()} className="underline font-medium">
            Retry
          </button>
        </p>
      )}

      {!usePlaces && areasQuery.data && (
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
    </section>
  );
}
