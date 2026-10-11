import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading, NoticeDraft } from "../../../shared/src/types.js";
import { evaluate } from "../../../shared/src/evaluate.js";
import { buildTemplateNotice, describePlace } from "../../../shared/src/notice-templates.js";
import { getReadingAt } from "../../../shared/src/readings.js";
import { getActiveRuleset } from "../../../shared/src/rules.js";
import { geminiConfigFromEnv } from "../../../shared/src/gemini.js";
import {
  NoticeAudioQuerySchema,
  NoticeDraftQuerySchema,
  parse,
  ValidationError,
} from "../../../shared/src/schemas.js";
import { respond, signedInName, UnauthorizedError } from "../../../shared/src/http.js";
import {
  areaDisplayName,
  dataContextFromEnv,
  getAreaReading,
  usesDemo,
} from "../../../shared/src/area-readings.js";
import { polishNotice } from "./ai.js";
import { errorFields, log } from "../../../shared/src/observability.js";

const dynamodb = new DynamoDBClient({});
const polly = new PollyClient({});
const ALERTS_TABLE = process.env.ALERTS_TABLE_NAME!;
const ctx = dataContextFromEnv();
const AI_ENABLED = process.env.NOTICE_AI_ENABLED === "true";
const GEMINI = geminiConfigFromEnv();

const AUDIO_CACHE_LIMIT = 20;
const audioCache = new Map<string, string>();

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod === "GET" && event.path.endsWith("/notices/draft")) {
      return await handleDraft(event, signedInName(event));
    }
    // Public: the reviewed template only (no sender name, no AI), so anyone can
    // forward the current advice on WhatsApp without an account.
    if (event.httpMethod === "GET" && event.path.endsWith("/notices/template")) {
      return await handleDraft(event, undefined, { allowAi: false });
    }
    if (event.httpMethod === "GET" && event.path.endsWith("/notices/audio")) {
      return await handleAudio(event);
    }
    return respond(404, { error: "Not found" });
  } catch (err) {
    if (err instanceof ValidationError) return respond(400, { error: err.message });
    if (err instanceof UnauthorizedError) return respond(401, { error: err.message });
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
    return respond(500, { error: "Internal server error" });
  }
}

async function handleDraft(
  event: APIGatewayProxyEvent,
  senderName: string | undefined,
  { allowAi = true }: { allowAi?: boolean } = {}
): Promise<APIGatewayProxyResult> {
  const query = parse(NoticeDraftQuerySchema, event.queryStringParameters ?? {});
  const { campus: areaId, audience, scenario } = query;

  // Prefer the exact reading on the sender's screen (live mode), else current.
  const [current, ruleset] = await Promise.all([
    getAreaReading(dynamodb, ctx, areaId, scenario),
    getActiveRuleset(dynamodb),
  ]);
  let reading: AQIReading | null = current.reading;
  if (!usesDemo(ctx, scenario) && query.readingTimestamp) {
    reading = (await getReadingAt(dynamodb, ctx.aqiTable, areaId, query.readingTimestamp)) ?? reading;
  }

  const recommendation = reading ? evaluate(reading, ruleset) : null;
  const areaName = areaDisplayName(current.area, reading, "your area");
  const place = {
    areaName,
    areaKind: current.area?.kind,
    measuredStation: reading?.source === "CPCB" ? reading.stationName : undefined,
    senderName,
  };
  const template = recommendation ? buildTemplateNotice(recommendation, place, audience) : null;
  if (!recommendation || !template) {
    return respond(503, { error: "No valid AQI reading available to draft a notice" });
  }

  const polished = AI_ENABLED && allowAi
    ? await polishNotice(
        template,
        { aqi: recommendation.evidence.aqi, audience, areaName: describePlace(place).keep },
        GEMINI
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
  const { campus, alertId, createdAt, lang } = parse(
    NoticeAudioQuerySchema,
    event.queryStringParameters ?? {}
  );

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
