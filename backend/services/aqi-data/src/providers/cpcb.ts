import { AQIReading } from "../../../../shared/src/types.js";

const CPCB_API_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";

export async function fetchFromCPCB(
  campus: string,
  apiKey: string
): Promise<AQIReading | null> {
  try {
    const url = new URL(CPCB_API_URL);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("filters[city]", "Delhi");
    url.searchParams.set("limit", "5");

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`CPCB API returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      records?: Record<string, string>[];
    };

    if (!data.records || data.records.length === 0) {
      console.warn("CPCB returned no records for Delhi");
      return null;
    }

    const record = data.records[0];

    const pollutants: Record<string, number> = {};
    if (record.pm25) pollutants.pm25 = parseFloat(record.pm25);
    if (record.pm10) pollutants.pm10 = parseFloat(record.pm10);
    if (record.no2) pollutants.no2 = parseFloat(record.no2);
    if (record.so2) pollutants.so2 = parseFloat(record.so2);
    if (record.co) pollutants.co = parseFloat(record.co);
    if (record.ozone) pollutants.o3 = parseFloat(record.ozone);

    const dominantPollutant = record.predominant_parameter || findDominantPollutant(pollutants);

    return {
      campus,
      aqi: parseFloat(record.pollutant_avg || record.pm25 || "0"),
      dominantPollutant,
      pollutants,
      source: "CPCB",
      stationName: record.station || "Delhi",
      timestamp: record.last_update || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      dataMode: "live",
    };
  } catch (err) {
    console.error("Failed to fetch from CPCB:", err);
    return null;
  }
}

function findDominantPollutant(pollutants: Record<string, number>): string {
  let max = 0;
  let dominant = "PM2.5";
  for (const [key, value] of Object.entries(pollutants)) {
    if (value > max) {
      max = value;
      dominant = key;
    }
  }
  return dominant;
}
