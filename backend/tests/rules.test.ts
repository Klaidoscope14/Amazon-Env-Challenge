import { beforeEach, describe, expect, it, vi } from "vitest";
import { marshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CPCB_THRESHOLDS, getThresholdForAqi } from "../shared/src/aqi-categories.js";
import { evaluate } from "../shared/src/evaluate.js";
import {
  getActiveRuleset,
  parseThresholds,
  resetRulesCache,
  rulesetItems,
} from "../shared/src/rules.js";
import type { AQIReading, AQIThreshold } from "../shared/src/types.js";

const clone = () => CPCB_THRESHOLDS.map((t) => ({ ...t }));

function fakeDb(result: () => Promise<unknown>) {
  const send = vi.fn(result);
  return { client: { send } as unknown as DynamoDBClient, send };
}

const itemsFor = (thresholds: AQIThreshold[]) =>
  Promise.resolve({ Items: rulesetItems("cpcb-india-v1", thresholds).map((i) => marshall(i)) });

describe("ruleset validation", () => {
  it("accepts the built-in CPCB bands, in any stored order", () => {
    const parsed = parseThresholds([...clone()].reverse());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.thresholds.map((t) => t.status)).toEqual(CPCB_THRESHOLDS.map((t) => t.status));
  });

  it("rejects gaps between bands", () => {
    const t = clone();
    t[3].minAqi = 205;
    expect(parseThresholds(t)).toMatchObject({ ok: false, error: expect.stringMatching(/contiguous/) });
  });

  it("rejects a missing band", () => {
    expect(parseThresholds(clone().slice(0, 5)).ok).toBe(false);
  });

  it("rejects renamed categories, empty actions and bad colours", () => {
    const renamed = clone();
    renamed[0].status = "Great" as AQIThreshold["status"];
    const noAction = clone();
    noAction[2].action = " ";
    const badColor = clone();
    badColor[1].color = "green";
    for (const t of [renamed, noAction, badColor]) expect(parseThresholds(t).ok).toBe(false);
  });

  it("rejects a ruleset that stops below 500", () => {
    const t = clone();
    t[5].maxAqi = 450;
    expect(parseThresholds(t).ok).toBe(false);
  });
});

describe("getActiveRuleset", () => {
  beforeEach(() => {
    resetRulesCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("uses the built-in rules when no table is configured", async () => {
    const { client, send } = fakeDb(() => itemsFor(clone()));
    expect((await getActiveRuleset(client, {})).source).toBe("built-in");
    expect(send).not.toHaveBeenCalled();
  });

  it("uses validated rules from the table and caches them", async () => {
    const edited = clone();
    edited[3].action = "Custom action for Poor air, edited in the RulesConfig table.";
    const { client, send } = fakeDb(() => itemsFor(edited));
    const config = { table: "rules", rulesetId: "cpcb-india-v1" };

    const ruleset = await getActiveRuleset(client, config);
    expect(ruleset.source).toBe("dynamodb");
    await getActiveRuleset(client, config);
    expect(send).toHaveBeenCalledTimes(1);

    const reading = { aqi: 268, timestamp: new Date().toISOString(), dataMode: "live" } as AQIReading;
    const rec = evaluate(reading, ruleset);
    expect(rec.action).toBe(edited[3].action);
    expect(rec.rule).toMatchObject({ id: "cpcb-india-v1", config: "dynamodb" });
  });

  it("falls back to the built-in rules when the stored set is invalid", async () => {
    const broken = clone();
    broken[1].minAqi = 60;
    const { client } = fakeDb(() => itemsFor(broken));
    const ruleset = await getActiveRuleset(client, { table: "rules" });
    expect(ruleset.source).toBe("built-in");
    expect(getThresholdForAqi(55, ruleset.thresholds)?.status).toBe("Satisfactory");
  });

  it("falls back when the table is empty or unreadable", async () => {
    expect((await getActiveRuleset(fakeDb(() => Promise.resolve({ Items: [] })).client, { table: "a" })).source).toBe("built-in");
    resetRulesCache();
    const failing = fakeDb(() => Promise.reject(Object.assign(new Error("denied"), { name: "AccessDeniedException" })));
    expect((await getActiveRuleset(failing.client, { table: "b" })).source).toBe("built-in");
  });
});
