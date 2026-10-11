import { beforeEach, describe, expect, it, vi } from "vitest";
import { SSMClient } from "@aws-sdk/client-ssm";
import { resetGoogleAq } from "../shared/src/google-aq.js";
import {
  distanceKm,
  nearbyHospitals,
  placeNameAt,
  resetGooglePlaces,
  resolvePlace,
  searchPlaces,
} from "../shared/src/google-places.js";

const ssmSend = vi.spyOn(SSMClient.prototype, "send");
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const ok = (body: unknown) => new Response(JSON.stringify(body));
const sentBody = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body);
const sentHeaders = (i = 0) => fetchMock.mock.calls[i][1].headers as Record<string, string>;

beforeEach(() => {
  resetGoogleAq();
  resetGooglePlaces();
  fetchMock.mockReset();
  ssmSend.mockReset();
  ssmSend.mockImplementation((async () => ({ Parameter: { Value: "gkey" } })) as never);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("locality search", () => {
  it("searches Indian localities and returns name + detail", async () => {
    fetchMock.mockResolvedValue(
      ok({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJ1",
              text: { text: "Lajpat Nagar II, Lajpat Nagar, New Delhi, Delhi, India" },
              structuredFormat: { mainText: { text: "Lajpat Nagar II" }, secondaryText: { text: "Lajpat Nagar, New Delhi, Delhi, India" } },
            },
          },
          { queryPrediction: { text: { text: "ignored" } } },
        ],
      })
    );
    expect(await searchPlaces("Lajpat", "session-1234")).toEqual([
      { placeId: "ChIJ1", name: "Lajpat Nagar II", detail: "Lajpat Nagar, New Delhi, Delhi, India" },
    ]);
    expect(sentBody()).toMatchObject({ input: "Lajpat", includedRegionCodes: ["in"], sessionToken: "session-1234" });
    expect(sentHeaders()["X-Goog-Api-Key"]).toBe("gkey");
  });

  it("resolves a chosen place to a name and coordinates in the same session", async () => {
    fetchMock.mockResolvedValue(ok({ displayName: { text: "Lajpat Nagar" }, location: { latitude: 28.5649, longitude: 77.2403 } }));
    expect(await resolvePlace("ChIJ1", "session-1234")).toEqual({ name: "Lajpat Nagar", lat: 28.5649, lon: 77.2403 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places/ChIJ1?sessionToken=session-1234");
    expect(sentHeaders()["X-Goog-FieldMask"]).toBe("displayName,location");
  });
});

describe("nearest hospitals", () => {
  const hospital = (name: string, lat: number, extra: Record<string, unknown> = {}) => ({
    displayName: { text: name },
    location: { latitude: lat, longitude: 77.24 },
    businessStatus: "OPERATIONAL",
    ...extra,
  });

  it("asks for well-known hospitals, drops closed ones and sorts by distance", async () => {
    fetchMock.mockResolvedValue(
      ok({
        places: [
          hospital("Max Saket", 28.52, { internationalPhoneNumber: "+91 11 2651 5050", googleMapsUri: "https://maps.google.com/?cid=1" }),
          hospital("AIIMS", 28.54),
          hospital("Closed Clinic", 28.571, { businessStatus: "CLOSED_PERMANENTLY" }),
        ],
      })
    );
    const result = await nearbyHospitals(28.5677, 77.2433);
    expect(result.map((h) => h.name)).toEqual(["AIIMS", "Max Saket"]);
    expect(result[1]).toMatchObject({ phone: "+911126515050", mapsUrl: "https://maps.google.com/?cid=1" });
    expect(sentBody()).toMatchObject({ includedPrimaryTypes: ["hospital"], rankPreference: "POPULARITY" });
    // Rounded to ~1 km before leaving the server.
    expect(sentBody().locationRestriction.circle.center).toEqual({ latitude: 28.57, longitude: 77.24 });
  });

  it("widens the search when nothing is nearby, and caches by rounded location", async () => {
    fetchMock.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(ok({ places: [hospital("District Hospital", 28.7)] }));
    expect((await nearbyHospitals(28.571, 77.241))[0].name).toBe("District Hospital");
    expect(sentBody(0).locationRestriction.circle.radius).toBe(10_000);
    expect(sentBody(1).locationRestriction.circle.radius).toBe(30_000);
    await nearbyHospitals(28.5712, 77.2408);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on API errors so the route can answer 503", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 }));
    await expect(nearbyHospitals(28.5, 77.2)).rejects.toThrow(/HTTP 403 \(PERMISSION_DENIED\)/);
  });
});

describe("neighbourhood names", () => {
  const geocode = (components: { long_name: string; types: string[] }[]) =>
    ok({ status: "OK", results: [{ address_components: components }] });

  it("prefers the neighbourhood over the city", async () => {
    fetchMock.mockResolvedValue(
      geocode([
        { long_name: "Block L", types: ["sublocality_level_3", "sublocality"] },
        { long_name: "Lajpat Nagar", types: ["sublocality_level_1", "sublocality"] },
        { long_name: "New Delhi", types: ["locality"] },
      ])
    );
    expect(await placeNameAt(28.5677, 77.2433)).toBe("Lajpat Nagar");
    // The geocoding API takes the key as a query parameter.
    expect(fetchMock.mock.calls[0][0]).toMatch(/latlng=28\.5677,77\.2433.*&key=gkey$/);
  });

  it("returns null (never throws) when geocoding is refused, and retries next time", async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: "REQUEST_DENIED" }));
    expect(await placeNameAt(19.07, 72.87)).toBeNull();
    fetchMock.mockResolvedValueOnce(geocode([{ long_name: "Kurla", types: ["sublocality_level_1"] }]));
    expect(await placeNameAt(19.07, 72.87)).toBe("Kurla");
  });
});

it("measures distance in km", () => {
  expect(distanceKm({ lat: 28.6139, lon: 77.209 }, { lat: 19.076, lon: 72.8777 })).toBeCloseTo(1148, -1);
});
