import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading, NoticeDraft } from "../../../shared/src/types.js";
import { evaluate } from "../../../shared/src/evaluate.js";
import { isDemoScenario } from "../../../shared/src/demo.js";
import { buildTemplateNotice, describePlace, isAudience } from "../../../shared/src/notice-templates.js";
import { getReadingAt } from "../../../shared/src/readings.js";
import {
  dataContextFromEnv,
  getAreaReading,
  isAreaId,
  usesDemo,
} from "../../../shared/src/area-readings.js";
import { polishNotice } from "./ai.js";

const dynamodb = new DynamoDBClient({});
const polly = new PollyClient({});
const ALERTS_TABLE = process.env.ALERTS_TABLE_NAME!;
const ctx = dataContextFromEnv();
const AI_ENABLED = process.env.NOTICE_AI_ENABLED === "true";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const GEMINI_KEY_PARAM = process.env.GEMINI_API_KEY_PARAM || "/breathesafe/gemini-api-key";

const AUDIO_CACHE_LIMIT = 20;
const audioCache = new Map<string, string>();

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod === "GET" && event.path.endsWith("/notices/draft")) {
      return await handleDraft(event);
    }
    if (event.httpMethod === "GET" && event.path.endsWith("/notices/audio")) {
      return await handleAudio(event);
    }
    return respond(404, { error: "Not found" });
  } catch (err) {
    console.error("Notices handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}

async function handleDraft(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters ?? {};
  const areaId = qs.campus;
  const audience = qs.audience || "all";
  const scenario = qs.scenario || undefined;
  const institution = (qs.institution ?? "").trim().slice(0, 100) || undefined;

  if (!isAreaId(areaId)) {
    return respond(400, { error: "campus (area id) is required" });
  }
  if (!isAudience(audience)) {
    return respond(400, { error: `Unknown audience: ${audience}` });
  }
  if (scenario && !isDemoScenario(scenario)) {
    return respond(400, { error: `Unknown demo scenario: ${scenario}` });
  }

  // Prefer the exact reading on the admin's screen (live mode), else current.
  const current = await getAreaReading(dynamodb, ctx, areaId, scenario);
  let reading: AQIReading | null = current.reading;
  if (!usesDemo(ctx, scenario) && qs.readingTimestamp) {
    reading = (await getReadingAt(dynamodb, ctx.aqiTable, areaId, qs.readingTimestamp)) ?? reading;
  }

  const recommendation = reading ? evaluate(reading) : null;
  const areaName = current.area?.name ?? reading?.stationName.replace(/ \(sample values\)$/, "") ?? "your area";
  const place = {
    areaName,
    areaKind: current.area?.kind,
    measuredStation: reading?.source === "CPCB" ? reading.stationName : undefined,
    institution,
  };
  const template = recommendation ? buildTemplateNotice(recommendation, place, audience) : null;
  if (!recommendation || !template) {
    return respond(503, { error: "No valid AQI reading available to draft a notice" });
  }

  const polished = AI_ENABLED
    ? await polishNotice(
        template,
        { aqi: recommendation.evidence.aqi, audience, areaName: describePlace(place).keep },
        { keyParameter: GEMINI_KEY_PARAM, model: GEMINI_MODEL }
      )
    : null;

  const draft: NoticeDraft = {
    ...(polished ?? template),
    source: polished ? "ai" : "template",
    status: recommendation.status,
    aqi: recommendation.evidence.aqi,
  };
  return respond(200, draft);
}

// Audio is only generated for alerts that were actually issued (text read
// from the table), so the endpoint can't be used as a general TTS service.
async function handleAudio(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters ?? {};
  const { campus, alertId, createdAt } = qs;
  const lang = qs.lang || "en";

  if (lang !== "en" && lang !== "hi") {
    return respond(400, { error: "lang must be en or hi" });
  }
  if (!isAreaId(campus) || !alertId || !createdAt || alertId.length > 64 || createdAt.length > 40) {
    return respond(400, { error: "campus, alertId and createdAt are required" });
  }

  const cacheKey = `${campus}|${alertId}|${lang}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return respond(200, { contentType: "audio/mpeg", audioBase64: cached });

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: ALERTS_TABLE,
      Key: marshall({ PK: `CAMPUS#${campus}`, SK: `ALERT#${createdAt}#${alertId}` }),
      ProjectionExpression: "message, messageHi",
    })
  );
  if (!result.Item) return respond(404, { error: "Alert not found" });

  const alert = unmarshall(result.Item) as { message?: string; messageHi?: string };
  const text = lang === "hi" ? alert.messageHi : alert.message;
  if (!text) return respond(404, { error: `No ${lang === "hi" ? "Hindi" : "English"} text for this alert` });

  const speech = await polly.send(
    new SynthesizeSpeechCommand({
      Engine: "neural",
      VoiceId: "Kajal",
      LanguageCode: lang === "hi" ? "hi-IN" : "en-IN",
      OutputFormat: "mp3",
      Text: text.slice(0, 2500),
    })
  );
  const bytes = await speech.AudioStream?.transformToByteArray();
  if (!bytes || bytes.length === 0) {
    return respond(502, { error: "Speech synthesis returned no audio" });
  }

  const audioBase64 = Buffer.from(bytes).toString("base64");
  if (audioCache.size >= AUDIO_CACHE_LIMIT) audioCache.delete(audioCache.keys().next().value!);
  audioCache.set(cacheKey, audioBase64);
  return respond(200, { contentType: "audio/mpeg", audioBase64 });
}

function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(body),
  };
}
