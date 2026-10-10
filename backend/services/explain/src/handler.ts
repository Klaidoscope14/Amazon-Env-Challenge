import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Explanation } from "../../../shared/src/types.js";
import { evaluate } from "../../../shared/src/evaluate.js";
import { DISCLAIMER, getThresholdForAqi } from "../../../shared/src/aqi-categories.js";
import { getActiveRuleset } from "../../../shared/src/rules.js";
import { geminiConfigFromEnv, generateJson } from "../../../shared/src/gemini.js";
import { ExplainQuerySchema, parse, ValidationError } from "../../../shared/src/schemas.js";
import { respond } from "../../../shared/src/http.js";
import {
  areaDisplayName,
  dataContextFromEnv,
  getAreaReading,
  usesDemo,
} from "../../../shared/src/area-readings.js";
import { checkExplanation } from "./guardrails.js";
import {
  buildEvidence,
  guardrailContext,
  Lang,
  systemInstruction,
  templateExplanation,
} from "./explanation.js";
import { errorFields, log, metric } from "../../../shared/src/observability.js";

/*
 * GET /api/v1/explain?campus=<area>&lang=en|hi — a plain-language
 * explanation of the current reading and recommendation. Public, so it is
 * protected on cost as well as content: answers are cached per reading, AI
 * calls are rate-limited per container, and anything the guardrails reject
 * is replaced by the deterministic explanation.
 */

const dynamodb = new DynamoDBClient({});
const ctx = dataContextFromEnv();
const AI_ENABLED = process.env.EXPLAIN_AI_ENABLED === "true";
const GEMINI = geminiConfigFromEnv();

const CACHE_MS = 30 * 60 * 1000;
const CACHE_LIMIT = 100;
const AI_CALLS_PER_MINUTE = 10;

const cache = new Map<string, { value: Explanation; at: number }>();
let aiCallTimes: number[] = [];

const AI_DISCLAIMER =
  "AI-generated summary of the reading above, automatically checked against it. Not medical advice.";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const { campus: areaId, scenario, lang } = parse(
      ExplainQuerySchema,
      event.queryStringParameters ?? {}
    );

    const [{ area, reading }, ruleset] = await Promise.all([
      getAreaReading(dynamodb, ctx, areaId, scenario),
      getActiveRuleset(dynamodb),
    ]);
    if (!reading) {
      return area || usesDemo(ctx, scenario)
        ? respond(503, { error: "No AQI data available to explain" })
        : respond(404, { error: `Unknown area: ${areaId}` });
    }

    const recommendation = evaluate(reading, ruleset);
    const band = getThresholdForAqi(reading.aqi, ruleset.thresholds);
    if (recommendation.status === "Unavailable" || !band) {
      return respond(503, { error: "No valid AQI reading to explain" });
    }

    const cacheKey = [areaId, reading.timestamp, reading.aqi, reading.dataMode, lang, ruleset.id, band.action].join("|");
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return respond(200, hit.value);

    const place = {
      areaName: areaDisplayName(area, reading, areaId),
      areaKind: area?.kind,
      measuredStation: reading.source === "CPCB" ? reading.stationName : undefined,
    };
    const evidence = buildEvidence(recommendation, band, place);
    const template = templateExplanation(evidence, place, lang);

    const base = {
      lang,
      groundedIn: [
        `aqi:${evidence.aqi}`,
        `category:${evidence.category}`,
        `pollutant:${evidence.mainPollutant}`,
        `rule:${ruleset.id}/${evidence.category}`,
        `source:${evidence.dataSource}`,
        `observed:${reading.timestamp}`,
      ],
      status: recommendation.status,
      aqi: evidence.aqi,
      dataQuality: recommendation.dataQuality,
    };

    const ai = await explainWithAi(evidence, template, lang, place);
    const value: Explanation = ai.ok
      ? { ...base, explanation: ai.text, generatedBy: "ai", disclaimer: AI_DISCLAIMER }
      : {
          ...base,
          explanation: template,
          generatedBy: "template",
          fallbackReason: ai.reason,
          disclaimer: DISCLAIMER,
        };

    metric(ai.ok ? "ExplanationsAI" : "ExplanationsFallback");

    // Transient failures are not cached, so the next request can try AI again.
    if (ai.ok || ai.reason.startsWith("guardrail:") || ai.reason === "ai_disabled") {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { value, at: Date.now() });
    }
    return respond(200, value);
  } catch (err) {
    if (err instanceof ValidationError) return respond(400, { error: err.message });
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
    return respond(500, { error: "Internal server error" });
  }
}

async function explainWithAi(
  evidence: ReturnType<typeof buildEvidence>,
  template: string,
  lang: Lang,
  place: Parameters<typeof templateExplanation>[1]
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  if (!AI_ENABLED) return { ok: false, reason: "ai_disabled" };

  const now = Date.now();
  aiCallTimes = aiCallTimes.filter((t) => now - t < 60_000);
  if (aiCallTimes.length >= AI_CALLS_PER_MINUTE) return { ok: false, reason: "rate_limited" };
  aiCallTimes.push(now);

  const output = (await generateJson(GEMINI, {
    systemInstruction: systemInstruction(lang),
    userText: JSON.stringify(evidence),
    responseSchema: {
      type: "OBJECT",
      properties: { explanation: { type: "STRING" } },
      required: ["explanation"],
    },
    temperature: 0.2,
    maxOutputTokens: 512,
  })) as { explanation?: unknown } | null;
  if (!output) return { ok: false, reason: "ai_unavailable" };

  const verdict = checkExplanation(output.explanation, guardrailContext(evidence, template, lang, place));
  if (!verdict.ok) {
    console.warn(JSON.stringify({ event: "explain_guardrail_rejected", reason: verdict.reason, lang }));
    return { ok: false, reason: `guardrail:${verdict.reason}` };
  }
  return verdict;
}
