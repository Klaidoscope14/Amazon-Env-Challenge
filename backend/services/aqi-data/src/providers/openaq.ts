import { AQIReading } from "../../../../shared/src/types.js";

const OPENAQ_API_URL = "https://api.openaq.org/v2/latest";

export async function fetchFromOpenAQ(
  campus: string,
  apiKey?: string,
  city: string = "Delhi"
): Promise<AQIReading | null> {
  try {
    const url = new URL(OPENAQ_API_URL);
    url.searchParams.set("city", city);
    url.searchParams.set("country", "IN");
    url.searchParams.set("limit", "5");
    url.searchParams.set("parameter", "pm25");

    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;

    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`OpenAQ API returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{
        location?: string;
        measurements?: Array<{
          parameter?: string;
          value: number;
          lastUpdated?: string;
        }>;
      }>;
    };

    if (!data.results || data.results.length === 0) {
      console.warn(`OpenAQ returned no results for ${city}`);
      return null;
    }

    const result = data.results[0];
    const measurements = result.measurements || [];

    const pollutants: Record<string, number> = {};
    let dominantPollutant = "PM2.5";
    let maxValue = 0;

    for (const m of measurements) {
      const key = m.parameter?.toLowerCase() || "";
      pollutants[key] = m.value;
      if (m.value > maxValue) {
        maxValue = m.value;
        dominantPollutant = m.parameter || "PM2.5";
      }
    }

    const pm25 = pollutants["pm25"] ?? pollutants["pm2.5"] ?? 0;
    const aqi = pm25ToAqi(pm25);

    return {
      campus,
      aqi,
      dominantPollutant,
      pollutants,
      source: "OpenAQ",
      stationName: result.location || "Delhi",
      timestamp: result.measurements?.[0]?.lastUpdated || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      dataMode: "live",
    };
  } catch (err) {
    console.error("Failed to fetch from OpenAQ:", err);
    return null;
  }
}

function pm25ToAqi(pm25: number): number {
  const breakpoints = [
    { cLow: 0, cHigh: 30, iLow: 0, iHigh: 50 },
    { cLow: 31, cHigh: 60, iLow: 51, iHigh: 100 },
    { cLow: 61, cHigh: 90, iLow: 101, iHigh: 200 },
    { cLow: 91, cHigh: 120, iLow: 201, iHigh: 300 },
    { cLow: 121, cHigh: 250, iLow: 301, iHigh: 400 },
    { cLow: 251, cHigh: 500, iLow: 401, iHigh: 500 },
  ];

  for (const bp of breakpoints) {
    if (pm25 >= bp.cLow && pm25 <= bp.cHigh) {
      return Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow
      );
    }
  }
  return 500;
}
