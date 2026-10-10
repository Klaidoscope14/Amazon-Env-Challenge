import {
  GetParameterCommand,
  ParameterNotFound,
  SSMClient,
} from "@aws-sdk/client-ssm";

/*
 * Optional AI polish for notice text via the Gemini API (free tier).
 * The deterministic template is always the source of truth: the model may only
 * rephrase it, every number in its output must already appear in the template,
 * and any error, timeout, rate limit or failed check returns null so the
 * caller falls back to the template.
 */

const ssm = new SSMClient({});
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 6000;
const MAX_CHARS = 1200;
const CACHE_LIMIT = 50;

// undefined = not loaded yet; null = no key configured (AI disabled).
let apiKey: string | null | undefined;
const cache = new Map<string, { en: string; hi: string }>();

async function getApiKey(parameterName: string): Promise<string | null> {
  if (apiKey !== undefined) return apiKey;
  try {
    const result = await ssm.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true })
    );
    apiKey = result.Parameter?.Value?.trim() || null;
  } catch (err) {
    if (err instanceof ParameterNotFound) {
      console.warn(`Gemini key parameter ${parameterName} not found; AI drafts disabled`);
      apiKey = null;
    } else {
      // Transient failure: don't cache, try again on the next request.
      console.warn("Could not read Gemini key from SSM:", (err as Error).name);
      return null;
    }
  }
  return apiKey;
}

const SYSTEM_INSTRUCTION = `You edit school air-quality notices for a campus in India.
You receive an approved English notice and its approved Hindi translation.
Rewrite each so it reads clearly and warmly for the stated audience.
Rules:
- Keep every fact, number, time, name and instruction exactly as given. Do not add new facts, numbers, health or medical advice, or recommendations.
- Do not remove any instruction.
- Keep the monitoring station name exactly as written in the English version.
- Keep the layout: greeting, body and sign-off on separate lines.
- Hindi must be in Devanagari script, with digits written as 0-9.
- Each version must stay under 90 words.
Return JSON with keys "en" and "hi".`;

const NUMBER_PATTERN = /\d+(?:[.:]\d+)?/g;

/** Every number in the output must exist in the template; the AQI must survive. */
export function isFaithful(
  output: { en: string; hi: string },
  template: { en: string; hi: string },
  aqi: number,
  mustKeep: string[] = []
): boolean {
  // Names that are evidence (the monitoring station) must survive verbatim in English.
  if (mustKeep.some((name) => name && !output.en.includes(name))) return false;
  const allowed = new Set(`${template.en} ${template.hi}`.match(NUMBER_PATTERN) ?? []);
  for (const text of [output.en, output.hi]) {
    if (typeof text !== "string") return false;
    const trimmed = text.trim();
    if (trimmed.length < 40 || trimmed.length > MAX_CHARS) return false;
    const numbers: string[] = trimmed.match(NUMBER_PATTERN) ?? [];
    if (numbers.some((n) => !allowed.has(n))) return false;
    if (!numbers.includes(String(aqi))) return false;
  }
  return /[ऀ-ॿ]/.test(output.hi);
}

export async function polishNotice(
  template: { en: string; hi: string },
  context: { aqi: number; audience: string; areaName: string },
  config: { keyParameter: string; model: string }
): Promise<{ en: string; hi: string } | null> {
  const cacheKey = `${config.model}|${context.audience}|${template.en}|${template.hi}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const key = await getApiKey(config.keyParameter);
  if (!key) return null;

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: JSON.stringify({
                    audience: context.audience,
                    english: template.en,
                    hindi: template.hi,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { en: { type: "STRING" }, hi: { type: "STRING" } },
              required: ["en", "hi"],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.warn(`Gemini returned HTTP ${response.status}; using template`);
      return null;
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    const parsed = JSON.parse(text) as { en?: unknown; hi?: unknown };
    const output = { en: String(parsed.en ?? "").trim(), hi: String(parsed.hi ?? "").trim() };

    if (!isFaithful(output, template, context.aqi, [context.areaName])) {
      console.warn("Gemini draft failed the faithfulness check; using template");
      return null;
    }

    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, output);
    return output;
  } catch (err) {
    console.warn("Gemini draft failed; using template:", (err as Error).name);
    return null;
  }
}
