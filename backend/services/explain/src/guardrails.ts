/*
 * Output guardrails for AI explanations. The model only rewords evidence the
 * server built from the reading; these checks reject anything that goes
 * beyond it, and the caller then serves the deterministic explanation.
 */

export type GuardrailResult =
  | { ok: true; text: string }
  | { ok: false; reason: GuardrailReason };

export type GuardrailReason =
  | "not_text"
  | "length"
  | "too_many_sentences"
  | "markup_or_link"
  | "medical_or_safety_claim"
  | "invented_number"
  | "missing_aqi"
  | "missing_category"
  | "missing_place"
  | "wrong_language";

export interface GuardrailContext {
  lang: "en" | "hi";
  aqi: number;
  /** Every number that appears in the evidence (as written there). */
  allowedNumbers: Set<string>;
  /** Accepted ways to name the category, e.g. ["Poor", "खराब"]. */
  categoryNames: string[];
  /** Place name that must appear verbatim (checked in English only). */
  place?: string;
}

export const NUMBER_PATTERN = /\d+(?:[.:]\d+)?/g;

const MIN_CHARS = 40;
const MAX_CHARS = 600;
const MAX_SENTENCES = 5;

const MARKUP = /https?:|www\.|[*#`_]{2}|^\s*[-*•]\s|\[[^\]]*\]\(|<[a-z/][^>]*>|@[a-z0-9-]+\./im;

// Medical advice, treatments and safety guarantees are out of scope for an
// explanation of a reading, in either language.
const MEDICAL_EN =
  /\b(diagnos\w*|cur(e|es|ed|ing)|treat(s|ed|ing|ment|ments)?|prescri\w*|medicat\w*|medicines?|dos(e|es|age)|inhalers?|antibiotics?|steroids?|supplements?|guarantee\w*|risk[- ]free|harmless)\b|\b(completely|perfectly|totally|absolutely|100%) safe\b|\bno (health )?risks?\b|\b(will not|won't|cannot|can't) harm\b/i;
const MEDICAL_HI = /इलाज|उपचार|दवा|दवाई|निदान|खुराक|गारंटी|पूरी तरह सुरक्षित|बिल्कुल सुरक्षित|कोई (खतरा|ख़तरा) नहीं/;

const DEVANAGARI = /[ऀ-ॿ]/g;
const LATIN = /[A-Za-z]/g;

export function numbersIn(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

export function checkExplanation(output: unknown, ctx: GuardrailContext): GuardrailResult {
  if (typeof output !== "string") return { ok: false, reason: "not_text" };
  const text = output.replace(/\s+/g, " ").trim();

  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return { ok: false, reason: "length" };
  if (MARKUP.test(text)) return { ok: false, reason: "markup_or_link" };
  if (MEDICAL_EN.test(text) || MEDICAL_HI.test(text)) {
    return { ok: false, reason: "medical_or_safety_claim" };
  }
  // Sentence ends are punctuation followed by a space or the end, so "PM2.5" is one word.
  const sentences = text.split(/[.!?।](?:\s|$)/).filter((part) => part.trim().length > 0);
  if (sentences.length > MAX_SENTENCES) return { ok: false, reason: "too_many_sentences" };

  const numbers = numbersIn(text);
  if (numbers.some((n) => !ctx.allowedNumbers.has(n))) return { ok: false, reason: "invented_number" };
  if (!numbers.includes(String(ctx.aqi))) return { ok: false, reason: "missing_aqi" };

  const lower = text.toLowerCase();
  if (!ctx.categoryNames.some((name) => lower.includes(name.toLowerCase()))) {
    return { ok: false, reason: "missing_category" };
  }

  const devanagari = text.match(DEVANAGARI)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (ctx.lang === "en") {
    if (devanagari > 0) return { ok: false, reason: "wrong_language" };
    if (ctx.place && !text.includes(ctx.place)) return { ok: false, reason: "missing_place" };
  } else if (devanagari < latin) {
    // Hindi may keep names and terms like "AQI" or "PM2.5" in Latin script,
    // but most of the text must be Devanagari.
    return { ok: false, reason: "wrong_language" };
  }

  return { ok: true, text };
}
