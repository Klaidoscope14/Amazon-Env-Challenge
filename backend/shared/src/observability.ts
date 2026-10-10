/*
 * Structured logging and business metrics.
 *
 * log() writes one JSON line per event ({ level, event, ...fields }), so
 * CloudWatch Logs Insights can filter and aggregate on any field.
 *
 * metric() uses CloudWatch's Embedded Metric Format: a specially shaped log
 * line that CloudWatch turns into a metric, with no SDK call or extra
 * permission. Namespace "BreatheSafe", one dimension (Stage). The metric
 * names are a fixed set so the account stays inside the free custom-metric
 * allowance.
 */

type Level = "info" | "warn" | "error";

export function errorFields(err: unknown): { error: string; message?: string } {
  return err instanceof Error ? { error: err.name, message: err.message } : { error: String(err) };
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type MetricName =
  | "AlertsCreated"
  | "DecisionsRecorded"
  | "ExplanationsAI"
  | "ExplanationsFallback"
  | "ReadingsUnavailable";

/** Records a count metric (no-op outside Lambda, where STAGE is unset). */
export function metric(name: MetricName, value = 1): void {
  const stage = process.env.STAGE;
  if (!stage) return;
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          { Namespace: "BreatheSafe", Dimensions: [["Stage"]], Metrics: [{ Name: name, Unit: "Count" }] },
        ],
      },
      Stage: stage,
      [name]: value,
    })
  );
}
