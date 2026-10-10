import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { NoticeDraft } from "../../../shared/src/types.js";
import { evaluate } from "../../../shared/src/evaluate.js";
import { fetchDemoReading, isDemoScenario } from "../../../shared/src/demo.js";
import { getCampus } from "../../../shared/src/campus.js";
import { buildTemplateNotice, isAudience } from "../../../shared/src/notice-templates.js";
import { getLatestReading, getReadingByFetchedAt } from "../../../shared/src/readings.js";
import { polishNotice } from "./ai.js";

const dynamodb = new DynamoDBClient({});
const polly = new PollyClient({});
const AQI_TABLE = process.env.AQI_TABLE_NAME!;
const ALERTS_TABLE = process.env.ALERTS_TABLE_NAME!;
const DATA_MODE = process.env.DATA_MODE || "demo";
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
  const campus = getCampus(qs.campus || "dtu-delhi");
  const audience = qs.audience || "all";
  if (!isAudience(audience)) {
    return respond(400, { error: `Unknown audience: ${audience}` });
  }
  if (qs.scenario && !isDemoScenario(qs.scenario)) {
    return respond(400, { error: `Unknown demo scenario: ${qs.scenario}` });
  }

  let reading;
  if (DATA_MODE === "demo") {
    reading = fetchDemoReading(campus.id, qs.scenario);
  } else {
    reading =
      (qs.readingFetchedAt &&
        (await getReadingByFetchedAt(dynamodb, AQI_TABLE, campus.id, qs.readingFetchedAt))) ||
      (await getLatestReading(dynamodb, AQI_TABLE, campus.id));
  }

  const recommendation = reading ? evaluate(reading) : null;
  const template = recommendation
    ? buildTemplateNotice(recommendation, campus, audience)
    : null;
  if (!recommendation || !template) {
    return respond(503, { error: "No valid AQI reading available to draft a notice" });
  }

  const polished = AI_ENABLED
    ? await polishNotice(
        template,
        { aqi: recommendation.evidence.aqi, audience },
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
  const campus = getCampus(qs.campus || "dtu-delhi");
  const { alertId, createdAt } = qs;
  const lang = qs.lang || "en";

  if (lang !== "en" && lang !== "hi") {
    return respond(400, { error: "lang must be en or hi" });
  }
  if (!alertId || !createdAt || alertId.length > 64 || createdAt.length > 40) {
    return respond(400, { error: "alertId and createdAt are required" });
  }

  const cacheKey = `${alertId}|${lang}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return respond(200, { contentType: "audio/mpeg", audioBase64: cached });

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: ALERTS_TABLE,
      Key: marshall({ PK: `CAMPUS#${campus.id}`, SK: `ALERT#${createdAt}#${alertId}` }),
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
