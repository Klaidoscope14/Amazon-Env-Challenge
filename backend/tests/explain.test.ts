import { describe, expect, it } from "vitest";
import { evaluate } from "../shared/src/evaluate.js";
import { getThresholdForAqi } from "../shared/src/aqi-categories.js";
import { checkExplanation } from "../services/explain/src/guardrails.js";
import {
  buildEvidence,
  guardrailContext,
  templateExplanation,
} from "../services/explain/src/explanation.js";
import type { AQIReading } from "../shared/src/types.js";

const reading: AQIReading = {
  campus: "geo-288-771", aqi: 268, dominantPollutant: "pm25", pollutants: {}, source: "Google Air Quality",
  stationName: "Delhi area", timestamp: new Date().toISOString(), fetchedAt: "", dataMode: "live",
};
const place = { areaName: "Delhi area", areaKind: "geo" as const };
const rec = evaluate(reading);
const evidence = buildEvidence(rec, getThresholdForAqi(268)!, place);
const en = templateExplanation(evidence, place, "en");
const hi = templateExplanation(evidence, place, "hi");
const ctxEn = guardrailContext(evidence, en, "en", place);
const ctxHi = guardrailContext(evidence, hi, "hi", place);

describe("explanation template", () => {
  it("explains value, category, range, pollutant and action", () => {
    expect(evidence).toMatchObject({ place: "the Delhi area", category: "Poor", categoryRange: "201–300", mainPollutant: "PM2.5" });
    expect(en).toMatch(/^The air quality index \(AQI\) for the Delhi area is 268/);
    expect(en).toContain('"Poor" (AQI 201–300), mainly because of PM2.5.');
    expect(en).toContain(rec.action);
  });

  it("has a Hindi version", () => {
    expect(hi).toContain("Delhi क्षेत्र में वायु गुणवत्ता सूचकांक (AQI) 268 है।");
    expect(hi).toContain('"खराब" श्रेणी');
  });

  it("labels demo values", () => {
    const demo = buildEvidence(evaluate({ ...reading, dataMode: "demo" }), getThresholdForAqi(268)!, place);
    expect(templateExplanation(demo, place, "en")).toMatch(/sample values/);
  });

  it("passes its own guardrails", () => {
    expect(checkExplanation(en, ctxEn).ok).toBe(true);
    expect(checkExplanation(hi, ctxHi).ok).toBe(true);
  });
});

describe("explanation guardrails", () => {
  const good =
    "Air quality in the Delhi area is Poor, with an AQI of 268, mostly from PM2.5. Avoid long outdoor activity today and keep windows closed at peak hours.";

  it("accepts a grounded rewording", () => {
    expect(checkExplanation(good, ctxEn)).toEqual({ ok: true, text: good });
  });

  it.each([
    ["invented numbers", good.replace("today", "for 3 days"), "invented_number"],
    ["a wrong AQI", good.replace("268", "286"), "invented_number"],
    ["medical advice", good + " Use an inhaler if needed.", "medical_or_safety_claim"],
    ["safety guarantees", good.replace("Avoid", "It is completely safe to avoid"), "medical_or_safety_claim"],
    ["links", good + " See https://example.com.", "markup_or_link"],
    ["markdown", "**Poor** air in the Delhi area: AQI 268 from PM2.5, so limit time outdoors.", "markup_or_link"],
    ["a missing category", good.replace("Poor", "bad"), "missing_category"],
    ["a missing place", good.replace("the Delhi area", "your city"), "missing_place"],
    ["a missing AQI", "Air quality in the Delhi area is Poor, mostly from PM2.5 particles. Limit time outdoors today.", "missing_aqi"],
    ["Hindi in an English answer", good + " कृपया ध्यान दें।", "wrong_language"],
    ["too short", "Poor 268.", "length"],
    ["too many sentences", "Air in the Delhi area is Poor. The AQI is 268. It is from PM2.5. Stay in. Close windows. Wait.", "too_many_sentences"],
    ["non-text", { text: good }, "not_text"],
  ])("rejects %s", (_label, text, reason) => {
    expect(checkExplanation(text, ctxEn)).toEqual({ ok: false, reason });
  });

  it("rejects English in place of Hindi", () => {
    expect(checkExplanation(good, ctxHi)).toEqual({ ok: false, reason: "wrong_language" });
  });

  it("rejects Hindi medical advice", () => {
    expect(checkExplanation(hi + " दवा लें।", ctxHi)).toEqual({ ok: false, reason: "medical_or_safety_claim" });
  });
});
