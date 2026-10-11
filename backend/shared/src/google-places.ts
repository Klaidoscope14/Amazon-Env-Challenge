import { z } from "zod";
import { getGoogleApiKey } from "./google-aq.js";
import { errorFields, log } from "./observability.js";
import { Hospital, PlaceSuggestion } from "./types.js";

/*
 * Google Maps Platform, called server-side with the same key as the Air
 * Quality API (read from SSM, never sent to the browser):
 * - Places API (New) Autocomplete + Place Details: search for any locality.
 * - Places API (New) Nearby Search: the nearest hospitals, for SOS.
 * - Geocoding API: the neighbourhood name for a detected location.
 * Every call is billed, so results are cached and inputs are rounded; the
 * project should also carry daily quota caps.
 */

const PLACES = "https://places.googleapis.com/v1";
const GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 6000;
const CACHE_LIMIT = 500;
const HOSPITALS_CACHE_MS = 24 * 3600 * 1000;
const NAME_CACHE_MS = 7 * 24 * 3600 * 1000;
// Ranked by popularity, not distance: by distance, "hospital" also matches
// small clinics next door. Wider radius only when nothing is found nearby.
const HOSPITAL_RADII_M = [10_000, 30_000];
const HOSPITAL_CANDIDATES = 8;
const MAX_HOSPITALS = 5;

export interface ResolvedPlace {
  name: string;
  lat: number;
  lon: number;
}

// ---- Small helpers -----------------------------------------------------------

function remember<T>(cache: Map<string, { value: T; at: number }>, key: string, value: T) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, at: Date.now() });
}

function fresh<T>(cache: Map<string, { value: T; at: number }>, key: string, ttl: number): T | undefined {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < ttl ? hit.value : undefined;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function google(url: string, init: RequestInit & { fieldMask?: string } = {}): Promise<unknown> {
  const key = await getGoogleApiKey();
  if (!key) throw new Error("Google API key is not configured");
  const isGeocode = url.startsWith(GEOCODE);
  const response = await fetch(isGeocode ? `${url}&key=${encodeURIComponent(key)}` : url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(isGeocode ? {} : { "X-Goog-Api-Key": key }),
      ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // Log the status only, never the URL (the geocoding URL carries the key).
    const reason = (body as { error?: { status?: string } } | null)?.error?.status;
    throw new Error(`Google API returned HTTP ${response.status}${reason ? ` (${reason})` : ""}`);
  }
  return body;
}

// ---- Search for a locality ---------------------------------------------------

const AutocompleteSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: z.object({ text: z.string() }),
            structuredFormat: z
              .object({ mainText: z.object({ text: z.string() }), secondaryText: z.object({ text: z.string() }).optional() })
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

/** Localities in India matching `input` (autocomplete). */
export async function searchPlaces(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const data = AutocompleteSchema.parse(
    await google(`${PLACES}/places:autocomplete`, {
      method: "POST",
      body: JSON.stringify({
        input,
        includedRegionCodes: ["in"],
        includedPrimaryTypes: ["locality", "sublocality", "neighborhood", "postal_code"],
        languageCode: "en",
        ...(sessionToken ? { sessionToken } : {}),
      }),
    })
  );
  return (data.suggestions ?? []).flatMap(({ placePrediction: p }) =>
    p
      ? [
          {
            placeId: p.placeId,
            name: p.structuredFormat?.mainText.text ?? p.text.text,
            detail: p.structuredFormat?.secondaryText?.text ?? p.text.text,
          },
        ]
      : []
  );
}

const PlaceDetailsSchema = z.object({
  displayName: z.object({ text: z.string() }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
});

/** Name and coordinates of a place chosen from the search. */
export async function resolvePlace(placeId: string, sessionToken?: string): Promise<ResolvedPlace> {
  const query = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const data = PlaceDetailsSchema.parse(
    await google(`${PLACES}/places/${encodeURIComponent(placeId)}${query}`, { fieldMask: "displayName,location" })
  );
  return {
    name: data.displayName?.text ?? "Selected place",
    lat: data.location.latitude,
    lon: data.location.longitude,
  };
}

// ---- Nearest hospitals (SOS) -------------------------------------------------

const NearbySchema = z.object({
  places: z
    .array(
      z.object({
        displayName: z.object({ text: z.string() }).optional(),
        shortFormattedAddress: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }),
        nationalPhoneNumber: z.string().optional(),
        internationalPhoneNumber: z.string().optional(),
        googleMapsUri: z.string().optional(),
        businessStatus: z.string().optional(),
      })
    )
    .optional(),
});

const hospitalsCache = new Map<string, { value: Hospital[]; at: number }>();

/** Nearest hospitals to a point (input rounded to ~1 km so results can be shared and cached). */
export async function nearbyHospitals(lat: number, lon: number): Promise<Hospital[]> {
  const origin = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
  const cacheKey = `${origin.lat},${origin.lon}`;
  const cached = fresh(hospitalsCache, cacheKey, HOSPITALS_CACHE_MS);
  if (cached) return cached;

  let hospitals: Hospital[] = [];
  for (const radius of HOSPITAL_RADII_M) {
    const data = NearbySchema.parse(
      await google(`${PLACES}/places:searchNearby`, {
        method: "POST",
        fieldMask:
          "places.displayName,places.shortFormattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.businessStatus",
        body: JSON.stringify({
          includedPrimaryTypes: ["hospital"],
          maxResultCount: HOSPITAL_CANDIDATES,
          rankPreference: "POPULARITY",
          languageCode: "en",
          locationRestriction: {
            circle: { center: { latitude: origin.lat, longitude: origin.lon }, radius },
          },
        }),
      })
    );
    hospitals = (data.places ?? [])
      .filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL")
      .map((p) => ({
        name: p.displayName?.text ?? "Hospital",
        ...(p.shortFormattedAddress ? { address: p.shortFormattedAddress } : {}),
        ...(p.internationalPhoneNumber || p.nationalPhoneNumber
          ? { phone: (p.internationalPhoneNumber ?? p.nationalPhoneNumber)!.replace(/[^\d+]/g, "") }
          : {}),
        distanceKm: Math.round(distanceKm(origin, { lat: p.location.latitude, lon: p.location.longitude }) * 10) / 10,
        ...(p.googleMapsUri ? { mapsUrl: p.googleMapsUri } : {}),
      }))
      .sort((x, y) => x.distanceKm - y.distanceKm)
      .slice(0, MAX_HOSPITALS);
    if (hospitals.length > 0) break;
  }
  remember(hospitalsCache, cacheKey, hospitals);
  return hospitals;
}

// ---- Neighbourhood name for a location ---------------------------------------

const GeocodeSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        address_components: z.array(z.object({ long_name: z.string(), types: z.array(z.string()) })),
      })
    )
    .optional(),
});

const nameCache = new Map<string, { value: string | null; at: number }>();

/**
 * The neighbourhood (else town) at a point, e.g. "Lajpat Nagar", or null.
 * Never throws: the caller falls back to the nearest-city name.
 */
export async function placeNameAt(lat: number, lon: number): Promise<string | null> {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = fresh(nameCache, cacheKey, NAME_CACHE_MS);
  if (cached !== undefined) return cached;
  try {
    const data = GeocodeSchema.parse(
      await google(
        `${GEOCODE}?latlng=${lat.toFixed(4)},${lon.toFixed(4)}&result_type=sublocality|neighborhood|locality&language=en`
      )
    );
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Geocoding status ${data.status}`);
    const components = data.results?.[0]?.address_components ?? [];
    const pick = (type: string) => components.find((c) => c.types.includes(type))?.long_name;
    const name = pick("sublocality_level_1") ?? pick("sublocality") ?? pick("neighborhood") ?? pick("locality") ?? null;
    remember(nameCache, cacheKey, name);
    return name;
  } catch (err) {
    log("warn", "google_geocode_failed", errorFields(err));
    return null;
  }
}

/** Clears caches (tests). */
export function resetGooglePlaces(): void {
  hospitalsCache.clear();
  nameCache.clear();
}
