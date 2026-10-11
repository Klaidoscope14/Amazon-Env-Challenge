"use client";

import { useEffect, useMemo, useState } from "react";
import { getNearestArea } from "@/lib/api";
import { coordsForArea, distanceKm } from "@/lib/geo";
import { countryAt, loadWorld, type City, type World } from "@/lib/world";
import { siteKey, useAirLayer } from "@/lib/useAirLayer";
import { useBands } from "@/lib/catalog";
import { US_SCALE, STANDARD_LABEL, bandFor, indiaScale } from "@/lib/aqiScale";
import { useAqiStandard } from "@/lib/useAqiStandard";
import type { AreaInfo } from "@/lib/types";

interface OtherCitiesProps {
  selected: AreaInfo;
  onChooseArea: (area: AreaInfo) => void;
}

/**
 * The selected area's nearest major cities with their own current reading — a
 * quick "how is the air elsewhere?" glance. Each value comes from that city's
 * location, so they genuinely differ.
 */
export default function OtherCities({ selected, onChooseArea }: OtherCitiesProps) {
  const [world, setWorld] = useState<World | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);

  const home = useMemo(() => coordsForArea(selected.id), [selected.id]);
  const a3 = useMemo(() => (world && home ? countryAt(world, home[0], home[1])?.a3 ?? null : null), [world, home]);

  // Same site list (and so the same cached request) the globe uses for this country.
  const countryCities: City[] = useMemo(() => (world && a3 ? world.cities[a3] ?? [] : []), [world, a3]);
  const sites = useMemo(() => {
    const s = countryCities.map((c) => ({ lat: c.lat, lon: c.lon }));
    if (home) s.push({ lat: home[0], lon: home[1] });
    return s;
  }, [countryCities, home]);
  const air = useAirLayer(sites, a3 ?? "none");

  // Same scale as the globe: follows the shared "AQI Standard" switch.
  const [standard] = useAqiStandard();
  const bands = useBands();
  const scale = useMemo(() => (standard === "us" ? US_SCALE : indiaScale(bands)), [standard, bands]);

  const rows = useMemo(() => {
    if (!home) return [];
    return countryCities
      .map((city) => ({ city, km: distanceKm(home, [city.lat, city.lon]) }))
      .filter((r) => r.km >= 25)
      .sort((a, b) => a.km - b.km)
      .slice(0, 6);
  }, [countryCities, home]);

  const open = async (city: City) => {
    setOpening(city.name);
    setFailed(false);
    try {
      const { area } = await getNearestArea(Math.round(city.lat * 100) / 100, Math.round(city.lon * 100) / 100);
      onChooseArea(area);
    } catch {
      setFailed(true);
    } finally {
      setOpening(null);
    }
  };

  const loading = !world || (air.isPending && rows.length > 0);

  return (
    <section aria-label="Other cities" className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">Cities near {selected.name}</h2>
        <span className="text-[11px] text-muted">{STANDARD_LABEL[standard].name}</span>
      </div>

      {loading ? (
        <ul className="mt-4 space-y-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-2xl bg-surface-2/70" />
          ))}
        </ul>
      ) : rows.length === 0 || air.isError ? (
        <p className="mt-3 text-sm text-muted">
          {air.isError ? "Couldn't load readings for nearby cities right now." : "No other major cities on file nearby."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(({ city, km }) => {
            const a = air.data?.[siteKey(city.lat, city.lon)];
            const value = standard === "us" ? a?.usAqi : a?.aqi;
            const band = bandFor(scale, value);
            return (
              <li key={`${city.name}-${city.lat}`}>
                <button
                  type="button"
                  onClick={() => open(city)}
                  disabled={opening !== null}
                  className="flex w-full items-center gap-3 rounded-2xl bg-surface-2/60 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-70"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold"
                    style={{
                      background: band ? band.fill : "var(--band-unavailable)",
                      color: band ? band.ink : "var(--band-unavailable-ink)",
                    }}
                  >
                    {value != null ? Math.round(value) : "–"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{city.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {Math.round(km).toLocaleString("en-IN")} km away
                      {opening === city.name ? " · opening…" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs font-medium" style={{ color: band ? band.text : undefined }}>
                    {band ? band.label.replace("Unhealthy for sensitive groups", "Sensitive groups") : "No reading"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-300">
          Couldn&apos;t open that city. Try again.
        </p>
      )}
    </section>
  );
}
