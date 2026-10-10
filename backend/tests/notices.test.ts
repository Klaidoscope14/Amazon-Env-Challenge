import { describe, expect, it } from "vitest";
import { AUDIENCES, buildTemplateNotice, describePlace } from "../shared/src/notice-templates.js";
import { evaluate, evaluateUnavailable } from "../shared/src/evaluate.js";
import { isFaithful } from "../services/notices/src/ai.js";

const rec = evaluate({
  campus: "geo-288-771", aqi: 268, dominantPollutant: "pm25", pollutants: {}, source: "Google Air Quality",
  stationName: "Delhi area", timestamp: "2026-10-10T13:30:00.000Z", fetchedAt: "", dataMode: "live",
});

describe("notice templates", () => {
  it("phrases measured station readings as such", () => {
    expect(describePlace({ areaName: "Rohini", measuredStation: "Rohini, Delhi - DPCC" }).en)
      .toBe("at the nearest monitoring station (Rohini, Delhi - DPCC)");
  });
  it("phrases area estimates without claiming a station", () => {
    const n = buildTemplateNotice(rec, { areaName: "Delhi area", areaKind: "geo", senderName: "Asha Verma" }, "family")!;
    expect(n.en).toContain("The Air Quality Index (AQI) for the Delhi area is 268 (Poor) as of 19:00 IST");
    expect(n.en).toMatch(/^Dear family,\n\n/);
    expect(n.en).toMatch(/— Asha Verma \(via BreatheSafe\)$/);
    expect(n.hi).toMatch(/^प्रिय परिवारजनों,/);
    expect(n.hi).toContain("Delhi क्षेत्र में वायु गुणवत्ता");
    expect(n.en).not.toMatch(/monitoring station/);
  });
  it("signs off as BreatheSafe when there is no sender name", () => {
    expect(buildTemplateNotice(rec, { areaName: "Pune", areaKind: "city" }, "all")!.en).toMatch(/— BreatheSafe$/);
  });
  it("has wording for every audience and no institutional language", () => {
    for (const audience of AUDIENCES) {
      const n = buildTemplateNotice(rec, { areaName: "Pune", areaKind: "city" }, audience)!;
      expect(n.en).not.toMatch(/campus|student|staff|parent|administration/i);
      expect(n.hi).toMatch(/[ऀ-ॿ]/);
    }
  });
  it("refuses to draft without a usable reading", () => {
    expect(buildTemplateNotice(evaluateUnavailable(), { areaName: "x" }, "all")).toBeNull();
  });
});

describe("AI draft faithfulness guard", () => {
  const template = buildTemplateNotice(rec, { areaName: "Delhi area", areaKind: "geo" }, "all")!;
  it("accepts a rephrasing that keeps every number and the place", () => {
    expect(isFaithful({ en: template.en.replace("Dear", "Hello"), hi: template.hi }, template, 268, ["Delhi area"])).toBe(true);
  });
  it("rejects invented numbers", () => {
    expect(isFaithful({ en: template.en + " Stay home for 3 days.", hi: template.hi }, template, 268)).toBe(false);
  });
  it("rejects drafts that drop the place", () => {
    expect(isFaithful({ en: template.en.replace("the Delhi area", "the city"), hi: template.hi }, template, 268, ["Delhi area"])).toBe(false);
  });
  it("requires Hindi in Devanagari", () => {
    expect(isFaithful({ en: template.en, hi: "AQI 268 in Delhi area at 19:00 is Poor, please stay indoors today." }, template, 268)).toBe(false);
  });
});
