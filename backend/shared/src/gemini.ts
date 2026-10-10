import {
  GetParameterCommand,
  ParameterNotFound,
  SSMClient,
} from "@aws-sdk/client-ssm";

/*
 * Minimal Gemini API client (free tier) for structured JSON output. The key
 * is read from an SSM SecureString parameter at runtime. Every failure —
 * no key, HTTP error, timeout, unparseable output — returns null, so callers
 * always have a deterministic fallback.
 */

const ssm = new SSMClient({});
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 6000;

export interface GeminiConfig {
  /** SSM parameter holding the API key. */
  keyParameter: string;
  model: string;
}

export function geminiConfigFromEnv(): GeminiConfig {
  return {
    keyParameter: process.env.GEMINI_API_KEY_PARAM || "/breathesafe/gemini-api-key",
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
  };
}

// undefined = not loaded yet; null = no key configured (AI disabled).
let apiKey: string | null | undefined;

async function getApiKey(parameterName: string): Promise<string | null> {
  if (apiKey !== undefined) return apiKey;
  try {
    const result = await ssm.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true })
    );
    apiKey = result.Parameter?.Value?.trim() || null;
  } catch (err) {
    if (err instanceof ParameterNotFound) {
      console.warn(`Gemini key parameter ${parameterName} not found; AI features disabled`);
      apiKey = null;
    } else {
      // Transient failure: don't cache, try again on the next request.
      console.warn("Could not read Gemini key from SSM:", (err as Error).name);
      return null;
    }
  }
  return apiKey;
}

/**
 * Sends one prompt and returns the model's JSON output (parsed), or null.
 * `responseSchema` uses Gemini's schema format (type: "OBJECT", ...).
 */
export async function generateJson(
  config: GeminiConfig,
  request: {
    systemInstruction: string;
    userText: string;
    responseSchema: Record<string, unknown>;
    temperature?: number;
    maxOutputTokens?: number;
  }
): Promise<unknown | null> {
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
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: request.userText }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.3,
            maxOutputTokens: request.maxOutputTokens ?? 1024,
            responseMimeType: "application/json",
            responseSchema: request.responseSchema,
          },
        }),
      }
    );

    if (!response.ok) {
      console.warn(`Gemini returned HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    return JSON.parse(text) as unknown;
  } catch (err) {
    console.warn("Gemini request failed:", (err as Error).name);
    return null;
  }
}
