import { afterEach, describe, expect, it, vi } from "vitest";
import { log, metric } from "../shared/src/observability.js";

afterEach(() => {
  delete process.env.STAGE;
  vi.restoreAllMocks();
});

describe("observability", () => {
  it("writes one JSON line per log event", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log("warn", "gemini_http_error", { status: 429 });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({ level: "warn", event: "gemini_http_error", status: 429 });
  });

  it("emits metrics in CloudWatch Embedded Metric Format", () => {
    process.env.STAGE = "dev";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    metric("AlertsCreated");
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ Stage: "dev", AlertsCreated: 1 });
    expect(line._aws.CloudWatchMetrics[0]).toEqual({
      Namespace: "BreatheSafe",
      Dimensions: [["Stage"]],
      Metrics: [{ Name: "AlertsCreated", Unit: "Count" }],
    });
  });

  it("does not emit metrics outside Lambda", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    metric("AlertsCreated");
    expect(spy).not.toHaveBeenCalled();
  });
});
