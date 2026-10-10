import { GeminiConfig, generateJson } from "../../../shared/src/gemini.js";

/*
 * Optional AI polish for notice text via the Gemini API (free tier).
 * The deterministic template is always the source of truth: the model may only
 * rephrase it, every number in its output must already appear in the template,
 * and any error, timeout, rate limit or failed check returns null so the
 * caller falls back to the template.
 */

const MAX_CHARS = 1200;
const CACHE_LIMIT = 50;

const cache = new Map<string, { en: string; hi: string }>();

const SYSTEM_INSTRUCTION = `You edit air-quality notices that a person in India shares with their family, neighbours or group.
You receive an approved English notice and its approved Hindi translation.
Rewrite each so it reads clearly and warmly for the stated audience.
Rules:
- Keep every fact, number, time, name and instruction exactly as given. Do not add new facts, numbers, health or medical advice, or recommendations.
- Do not remove any instruction.
- Keep the place or monitoring station name and the sender's name exactly as written in the English version.
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
  config: GeminiConfig
): Promise<{ en: string; hi: string } | null> {
  const cacheKey = `${config.model}|${context.audience}|${template.en}|${template.hi}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const parsed = (await generateJson(config, {
    systemInstruction: SYSTEM_INSTRUCTION,
    userText: JSON.stringify({ audience: context.audience, english: template.en, hindi: template.hi }),
    responseSchema: {
      type: "OBJECT",
      properties: { en: { type: "STRING" }, hi: { type: "STRING" } },
      required: ["en", "hi"],
    },
  })) as { en?: unknown; hi?: unknown } | null;
  if (!parsed || typeof parsed !== "object") return null;

  const output = { en: String(parsed.en ?? "").trim(), hi: String(parsed.hi ?? "").trim() };
  if (!isFaithful(output, template, context.aqi, [context.areaName])) {
    console.warn("Gemini draft failed the faithfulness check; using template");
    return null;
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, output);
  return output;
}
