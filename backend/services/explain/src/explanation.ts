import { AQIThreshold, Recommendation } from "../../../shared/src/types.js";
import {
  adviceHi,
  Band,
  describePlace,
  formatIstTime,
  NoticePlace,
  pollutantName,
  statusHi,
} from "../../../shared/src/notice-templates.js";
import { GuardrailContext, numbersIn } from "./guardrails.js";

/*
 * Evidence, deterministic template and prompt for plain-language
 * explanations. The evidence is built on the server from the reading the
 * dashboard shows — never from client input — and is the only material the
 * model may use.
 */

export type Lang = "en" | "hi";

export interface ExplanationEvidence {
  place: string;
  aqi: number;
  category: string;
  categoryRange: string;
  mainPollutant: string;
  dataSource: string;
  observedAtIst: string;
  recommendedAction: string;
  dataQuality: Recommendation["dataQuality"];
}

export function buildEvidence(
  rec: Recommendation,
  band: AQIThreshold,
  place: NoticePlace
): ExplanationEvidence {
  return {
    place: describePlace(place).en.replace(/^(for|at) /, ""),
    aqi: rec.evidence.aqi,
    category: band.status,
    categoryRange: `${band.minAqi}–${band.maxAqi}`,
    mainPollutant: pollutantName(rec.evidence.dominantPollutant),
    dataSource: rec.evidence.source,
    observedAtIst: formatIstTime(rec.evidence.timestamp),
    recommendedAction: band.action,
    dataQuality: rec.dataQuality,
  };
}

const QUALITY_NOTE: Partial<Record<Recommendation["dataQuality"], { en: string; hi: string }>> = {
  stale: {
    en: "This reading is not recent, so check a current source before relying on it.",
    hi: "यह रीडिंग हाल की नहीं है, इसलिए इस पर भरोसा करने से पहले कोई मौजूदा स्रोत देखें।",
  },
  demo: {
    en: "These are sample values for demonstration, not a live reading.",
    hi: "ये प्रदर्शन के लिए नमूना मान हैं, लाइव रीडिंग नहीं।",
  },
};

/** The deterministic explanation, used whenever the AI one is not. */
export function templateExplanation(
  evidence: ExplanationEvidence,
  place: NoticePlace,
  lang: Lang
): string {
  const band = evidence.category as Band;
  const where = describePlace(place);
  const time = evidence.observedAtIst;
  const note = QUALITY_NOTE[evidence.dataQuality];

  if (lang === "hi") {
    return [
      `${time ? `${time} बजे ` : ""}${where.hi} वायु गुणवत्ता सूचकांक (AQI) ${evidence.aqi} है।`,
      `CPCB के पैमाने पर यह "${statusHi(band)}" श्रेणी (AQI ${evidence.categoryRange}) है, और इसका मुख्य कारण ${evidence.mainPollutant} है।`,
      adviceHi(band),
      note?.hi,
    ].filter(Boolean).join(" ");
  }
  return [
    `The air quality index (AQI) ${where.en} is ${evidence.aqi}${time ? ` as of ${time} IST` : ""}.`,
    `On India's CPCB scale that is "${band}" (AQI ${evidence.categoryRange}), mainly because of ${evidence.mainPollutant}.`,
    evidence.recommendedAction,
    note?.en,
  ].filter(Boolean).join(" ");
}

export function systemInstruction(lang: Lang): string {
  const language =
    lang === "hi" ? "Hindi, in Devanagari script, with digits written as 0-9" : "plain English";
  return `You explain an air-quality reading to a member of the public in India.
You receive the evidence as JSON. Write 2 or 3 short sentences in ${language}.
Say what the AQI value and its category mean for the place and what the recommended action is.
Rules:
- Use only facts in the evidence. Do not add numbers, dates, places, sources, causes or forecasts that are not in it.
- Mention the AQI value, the category and the place, keeping the place name exactly as written.
- Do not give medical advice, diagnoses, treatments or medicines, and never say anyone is safe or will not be harmed.
- If dataQuality is "stale" or "demo", say so.
- Plain text only: no markdown, lists or links.
Return JSON with the key "explanation".`;
}

export function guardrailContext(
  evidence: ExplanationEvidence,
  template: string,
  lang: Lang,
  place: NoticePlace
): GuardrailContext {
  const band = evidence.category as Band;
  return {
    lang,
    aqi: evidence.aqi,
    allowedNumbers: new Set([...numbersIn(JSON.stringify(evidence)), ...numbersIn(template)]),
    categoryNames: lang === "hi" ? [statusHi(band), band] : [band],
    place: lang === "en" ? describePlace(place).keep : undefined,
  };
}
