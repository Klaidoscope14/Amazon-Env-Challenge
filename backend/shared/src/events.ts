import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

/*
 * Domain events on the stack's EventBridge bus. Producers don't know who
 * listens: today a rule archives every event (replayable for 30 days) and
 * writes it to an event log; new consumers subscribe with a rule, without
 * changing the code that emits.
 *
 * Publishing is best-effort by design: events describe what already
 * happened, so a slow or failed PutEvents is logged and never fails the
 * request that caused it.
 */

export type BreatheSafeEvent =
  | { source: "breathesafe.aqi"; type: "aqi.reading.received"; detail: ReadingEventDetail }
  | { source: "breathesafe.aqi"; type: "aqi.threshold.crossed"; detail: ThresholdCrossedDetail }
  | { source: "breathesafe.alerts"; type: "alert.created"; detail: AlertCreatedDetail }
  | { source: "breathesafe.alerts"; type: "alert.decision.recorded"; detail: DecisionRecordedDetail };

export interface ReadingEventDetail {
  area: string;
  areaName: string;
  aqi: number;
  status: string;
  dominantPollutant: string;
  source: string;
  timestamp: string;
}

export interface ThresholdCrossedDetail extends ReadingEventDetail {
  previousStatus: string;
  previousAqi: number;
  previousTimestamp: string;
  direction: "worse" | "better";
}

export interface AlertCreatedDetail {
  alertId: string;
  area: string;
  areaName?: string;
  audience: string;
  aqi: number;
  status: string;
  dataMode: string;
  emailDelivery: string;
  createdAt: string;
}

export interface DecisionRecordedDetail {
  alertId: string;
  area: string;
  decisionTimestamp: string;
}

// Short timeouts and one retry: an event must never hold up an API response.
const client = new EventBridgeClient({
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 },
});

export function eventBusFromEnv(): string | undefined {
  return process.env.EVENT_BUS_NAME || undefined;
}

export async function publishEvents(
  events: BreatheSafeEvent[],
  busName: string | undefined = eventBusFromEnv()
): Promise<void> {
  if (!busName || events.length === 0) return;
  try {
    const result = await client.send(
      new PutEventsCommand({
        Entries: events.map((e) => ({
          EventBusName: busName,
          Source: e.source,
          DetailType: e.type,
          Detail: JSON.stringify(e.detail),
        })),
      })
    );
    if (result.FailedEntryCount) {
      console.error(
        JSON.stringify({
          event: "event_publish_failed",
          failed: result.FailedEntryCount,
          codes: (result.Entries ?? []).map((entry) => entry.ErrorCode).filter(Boolean),
        })
      );
    }
  } catch (err) {
    console.error(JSON.stringify({ event: "event_publish_failed", error: (err as Error).name }));
  }
}
