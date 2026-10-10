import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { refreshSnapshot } from "../../../shared/src/stations.js";
import { dataContextFromEnv } from "../../../shared/src/area-readings.js";

const dynamodb = new DynamoDBClient({});

/**
 * Scheduled (EventBridge) refresh of the CPCB station snapshot, so API
 * requests only ever read one stored item. No-op outside live mode.
 */
export async function handler(): Promise<{ refreshed: boolean; stations?: number }> {
  const ctx = dataContextFromEnv();
  if (ctx.dataMode !== "live" || !ctx.cpcbApiKey) {
    console.log("Station refresh skipped (not in live mode or no CPCB key)");
    return { refreshed: false };
  }
  // A failed refresh is logged (cpcb_refresh_failed) but not thrown: the API
  // falls back to Open-Meteo, and throwing would only make EventBridge retry.
  const snapshot = await refreshSnapshot(dynamodb, ctx.aqiTable, ctx.cpcbApiKey);
  return snapshot ? { refreshed: true, stations: snapshot.stations.length } : { refreshed: false };
}
