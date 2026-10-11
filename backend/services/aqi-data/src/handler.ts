import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading, AQIReadingResponse, Ruleset } from "../../../shared/src/types.js";
import { getThresholdForAqi } from "../../../shared/src/aqi-categories.js";
import { Area, findNearestArea, listAreas } from "../../../shared/src/areas.js";
import { getActiveRuleset } from "../../../shared/src/rules.js";
import {
  AreaQuerySchema,
  NearestQuerySchema,
  parse,
  PlaceResolveQuerySchema,
  PlaceSearchQuerySchema,
  SitesQuerySchema,
  ValidationError,
} from "../../../shared/src/schemas.js";
import { respond } from "../../../shared/src/http.js";
import {
  dataContextFromEnv,
  getAreaReading,
  usesDemo,
} from "../../../shared/src/area-readings.js";
import { errorFields, log, metric } from "../../../shared/src/observability.js";
import { nearbyHospitals, placeNameAt, resolvePlace, searchPlaces } from "../../../shared/src/google-places.js";

const dynamodb = new DynamoDBClient({});
const ctx = dataContextFromEnv();

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (event.path.endsWith("/areas/nearest")) return await handleNearest(event);
    if (event.path.endsWith("/aqi/sites")) return await handleSites(event);
    if (event.path.endsWith("/places/search")) return await handlePlaceSearch(event);
    if (event.path.endsWith("/places/resolve")) return await handlePlaceResolve(event);
    if (event.path.endsWith("/places/hospitals")) return await handleHospitals(event);
    if (event.path.endsWith("/areas")) return await handleListAreas();
    return await handleCurrent(event);
  } catch (err) {
    if (err instanceof ValidationError) return respond(400, { error: err.message });
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
    return respond(500, { error: "Internal server error" });
  }
}

async function handleCurrent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { campus: areaId, scenario } = parse(AreaQuerySchema, event.queryStringParameters ?? {});

  const [{ area, reading }, ruleset] = await Promise.all([
    getAreaReading(dynamodb, ctx, areaId, scenario),
    getActiveRuleset(dynamodb),
  ]);
  if (!reading) {
    if (area) metric("ReadingsUnavailable");
    return area || usesDemo(ctx, scenario)
      ? respond(503, {
          error: "No AQI data available",
          message: "No valid air-quality reading is available for this area right now. Check official sources.",
          dataMode: "unavailable",
        })
      : respond(404, { error: `Unknown area: ${areaId}` });
  }
  return respond(200, withStatus(reading, area, ruleset));
}

async function handleListAreas(): Promise<APIGatewayProxyResult> {
  return respond(200, { areas: listAreas(), source: "cities" });
}

async function handleNearest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { lat, lon } = parse(NearestQuerySchema, event.queryStringParameters ?? {});

  // Coordinates are used only for this lookup; they are never logged or stored.
  const area = findNearestArea(lat, lon, ctx.dataMode === "live");
  if (!area) return respond(404, { error: "No area found for this location" });
  // Live mode: name the area after the neighbourhood (e.g. "Lajpat Nagar") when Google knows it.
  const place = ctx.dataMode === "live" ? await placeNameAt(lat, lon) : null;
  return respond(200, { area: place ? { ...area, name: place } : area });
}

/** Globe and nearby cities can reuse a stored reading this old, to bound Google calls per city. */
const SITE_REUSE_MS = 2 * 60 * 60 * 1000;

/**
 * Current readings for many places at once (the globe and "cities near you"),
 * keyed "lat,lon" with 2 decimals. Places in India get the same reading as the
 * dashboard for their area; anywhere else, or without data, gets null.
 */
async function handleSites(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { points } = parse(SitesQuerySchema, event.queryStringParameters ?? {});
  const key = (p: { lat: number; lon: number }) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
  const live = ctx.dataMode === "live";

  // Several cities can share one area; look each area up once.
  const areaOf = new Map(points.map((p) => [key(p), live ? findNearestArea(p.lat, p.lon, true) : null]));
  const areaIds = [...new Set([...areaOf.values()].flatMap((a) => (a ? [a.id] : [])))];
  const readings = new Map(
    await Promise.all(
      areaIds.map(async (id) => {
        const { reading } = await getAreaReading(dynamodb, ctx, id, undefined, {
          reuseStoredMs: SITE_REUSE_MS,
          iqAirFallback: false,
        }).catch(() => ({ reading: null }));
        return [id, reading] as const;
      })
    )
  );

  const result: Record<string, object | null> = {};
  for (const [k, area] of areaOf) {
    const reading = area ? readings.get(area.id) : null;
    if (!reading || reading.dataMode === "demo") {
      result[k] = null;
      continue;
    }
    const p = reading.pollutants ?? {};
    result[k] = {
      aqi: reading.aqi,
      dominant: reading.dominantPollutant,
      pm25: p.pm25 ?? null,
      pm10: p.pm10 ?? null,
      o3: p.o3 ?? null,
      no2: p.no2 ?? null,
      time: reading.timestamp,
    };
  }
  return respond(200, { points: result });
}

// Google-backed lookups: a 503 tells the browser to fall back (city list, no hospitals).
const GOOGLE_UNAVAILABLE = { error: "This lookup is unavailable right now" };

async function handlePlaceSearch(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { q, session } = parse(PlaceSearchQuerySchema, event.queryStringParameters ?? {});
  try {
    return respond(200, { places: await searchPlaces(q, session) });
  } catch (err) {
    log("error", "places_search_failed", errorFields(err));
    return respond(503, GOOGLE_UNAVAILABLE);
  }
}

async function handlePlaceResolve(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { placeId, session } = parse(PlaceResolveQuerySchema, event.queryStringParameters ?? {});
  let place;
  try {
    place = await resolvePlace(placeId, session);
  } catch (err) {
    log("error", "places_resolve_failed", errorFields(err));
    return respond(503, GOOGLE_UNAVAILABLE);
  }
  const area = findNearestArea(place.lat, place.lon, ctx.dataMode === "live");
  return area
    ? respond(200, { area: { ...area, name: place.name } })
    : respond(404, { error: "Air quality is available for places in India" });
}

async function handleHospitals(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { lat, lon } = parse(NearestQuerySchema, event.queryStringParameters ?? {});
  try {
    return respond(200, { hospitals: await nearbyHospitals(lat, lon) });
  } catch (err) {
    log("error", "places_hospitals_failed", errorFields(err));
    return respond(503, GOOGLE_UNAVAILABLE);
  }
}

// Status comes from the shared rules engine so the dashboard never derives
// its own (possibly different) category from the raw number.
function withStatus(reading: AQIReading, area: Area | null, ruleset: Ruleset): AQIReadingResponse {
  const threshold = getThresholdForAqi(reading.aqi, ruleset.thresholds);
  return {
    ...reading,
    status: threshold?.status ?? "Unavailable",
    statusLevel: threshold?.statusLevel ?? 0,
    ...(area ? { area } : {}),
  };
}
