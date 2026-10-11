"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBands, useCatalog } from "@/lib/catalog";
import { bandFor, indiaScale } from "@/lib/aqiScale";
import { coordsForArea } from "@/lib/geo";
import { siteKey, useAirLayer } from "@/lib/useAirLayer";
import type { AreaInfo, SavedPlace, UserProfile } from "@/lib/types";

const SUGGESTED_LABELS = ["Home", "Work", "Parents' home", "School"];

interface YourPlacesProps {
  /** The area on screen, offered for saving. */
  current: AreaInfo;
  onChooseArea: (area: AreaInfo) => void;
}

/**
 * The places someone keeps an eye on (home, work, a parent's home), each with
 * its air right now. Saved to their account, so they follow them to any device.
 */
export default function YourPlaces({ current, onChooseArea }: YourPlacesProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) {
    return (
      <section aria-label="Your places" className="glass rounded-3xl p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Your places</h2>
        <p className="mt-1 text-sm text-muted">
          Keep an eye on home, work and your parents&apos; place, all at a glance, on any device.
        </p>
        <Link
          href="/login?redirect=/"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          Sign in to save places
        </Link>
      </section>
    );
  }
  return <SavedPlaces user={user} current={current} onChooseArea={onChooseArea} />;
}

function SavedPlaces({ user, current, onChooseArea }: YourPlacesProps & { user: UserProfile }) {
  const { profileSaved } = useAuth();
  const id = useId();
  const maxPlaces = useCatalog().data?.limits.maxPlaces;
  const bands = useBands();
  const scale = useMemo(() => indiaScale(bands), [bands]);
  const places = user.places;
  const air = useAirLayer(
    places.map((p) => ({ lat: p.lat, lon: p.lon })),
    "places"
  );
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const here = coordsForArea(current);
  const alreadySaved = places.some((p) => p.areaId === current.id);
  const canAdd = !!here && !alreadySaved && (maxPlaces === undefined || places.length < maxPlaces);

  async function save(next: SavedPlace[]) {
    setBusy(true);
    setError("");
    try {
      const saved = await updateProfile({
        name: user.name,
        phone: user.phone,
        addressLine1: user.addressLine1,
        addressLine2: user.addressLine2,
        emergencyContacts: user.emergencyContacts,
        places: next,
      });
      await profileSaved(saved);
      setAdding(false);
      setLabel("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addCurrent(e: React.FormEvent) {
    e.preventDefault();
    if (!here || !label.trim()) return;
    void save([...places, { label: label.trim(), areaId: current.id, name: current.name, lat: here[0], lon: here[1] }]);
  }

  return (
    <section aria-label="Your places" className="glass rounded-3xl p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">Your places</h2>

      {places.length === 0 && !adding && (
        <p className="mt-1 text-sm text-muted">Save the places you care about and see their air at a glance.</p>
      )}

      {places.length > 0 && (
        <ul className="mt-3 space-y-2">
          {places.map((place) => {
            const aqi = air.data?.[siteKey(place.lat, place.lon)]?.aqi ?? null;
            const band = bandFor(scale, aqi);
            const isCurrent = place.areaId === current.id;
            return (
              <li key={place.areaId} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onChooseArea({
                      id: place.areaId,
                      kind: place.areaId.startsWith("city-") ? "city" : "geo",
                      name: place.name,
                      city: "",
                      state: "",
                      lat: place.lat,
                      lon: place.lon,
                    })
                  }
                  aria-current={isCurrent ? "true" : undefined}
                  className={`flex min-h-14 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${
                    isCurrent ? "bg-foreground/10" : "bg-surface-2/70 hover:bg-surface-2"
                  }`}
                >
                  <span
                    className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums"
                    style={{ background: band?.fill ?? "var(--band-unavailable)", color: band?.ink ?? "var(--foreground)" }}
                  >
                    {aqi ?? (air.isPending ? "…" : "–")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{place.label}</span>
                    <span className="block truncate text-xs text-muted">
                      {place.name}
                      {band ? ` · ${band.label}` : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void save(places.filter((p) => p.areaId !== place.areaId))}
                  disabled={busy}
                  aria-label={`Remove ${place.label}`}
                  className="min-h-11 min-w-11 text-xl leading-none text-muted hover:text-foreground disabled:opacity-50"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form onSubmit={addCurrent} className="mt-4 space-y-3">
          <label htmlFor={`${id}-label`} className="block text-sm font-medium text-foreground">
            What should we call {current.name}?
          </label>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_LABELS.filter((s) => !places.some((p) => p.label === s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLabel(s)}
                aria-pressed={label === s}
                className={`min-h-9 rounded-full border px-3 text-sm ${
                  label === s ? "border-foreground bg-foreground text-canvas" : "border-border-strong text-muted-strong hover:bg-surface-2"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            id={`${id}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={30}
            placeholder="Or type a name, e.g. Nani's house"
            className="w-full min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !label.trim()}
              className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save place"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-4 text-sm text-muted-strong hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        canAdd && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-surface-2"
          >
            <span aria-hidden="true">+</span> Save {current.name}
          </button>
        )
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
