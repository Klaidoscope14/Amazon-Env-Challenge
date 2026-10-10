import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { z } from "zod";
import { AQIThreshold, Ruleset } from "./types.js";
import { BUILT_IN_RULESET, DEFAULT_RULESET_ID } from "./aqi-categories.js";

/*
 * RulesConfig table: the recommendation bands as data, so the action for each
 * category can be changed without a redeploy. One item per band:
 *   PK "RULESET#<id>"  SK "THRESHOLD#<level>"  minAqi maxAqi status statusLevel action color
 * A ruleset is used only if it passes validation (the six CPCB categories, in
 * order, contiguous from 0 to at least 500). Anything else — empty table,
 * invalid edit, read error — falls back to the built-in ruleset, so a bad
 * edit can never produce a wrong or missing category.
 */

const BANDS = ["Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe"] as const;
const CACHE_MS = 5 * 60 * 1000;

const ThresholdSchema = z.object({
  minAqi: z.number().int().min(0),
  maxAqi: z.number().int().min(0),
  status: z.enum(BANDS),
  statusLevel: z.number().int().min(1).max(BANDS.length),
  action: z.string().trim().min(10).max(400),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const ThresholdsSchema = z
  .array(ThresholdSchema)
  .length(BANDS.length)
  .superRefine((items, ctx) => {
    items.forEach((t, i) => {
      if (t.status !== BANDS[i] || t.statusLevel !== i + 1) {
        ctx.addIssue({ code: "custom", message: `band ${i + 1} must be ${BANDS[i]} (level ${i + 1})` });
      }
      if (t.maxAqi < t.minAqi) {
        ctx.addIssue({ code: "custom", message: `${t.status}: maxAqi is below minAqi` });
      }
      const expectedMin = i === 0 ? 0 : items[i - 1].maxAqi + 1;
      if (t.minAqi !== expectedMin) {
        ctx.addIssue({ code: "custom", message: `${t.status}: minAqi must be ${expectedMin} (bands must be contiguous)` });
      }
    });
    const last = items[items.length - 1];
    if (last && last.maxAqi < 500) {
      ctx.addIssue({ code: "custom", message: "the last band must reach AQI 500" });
    }
  });

export const rulesetKey = (id: string) => `RULESET#${id}`;

/** Validates stored band items; returns the error message when they are unusable. */
export function parseThresholds(
  items: unknown[]
): { ok: true; thresholds: AQIThreshold[] } | { ok: false; error: string } {
  const sorted = [...items].sort(
    (a, b) => Number((a as AQIThreshold)?.statusLevel) - Number((b as AQIThreshold)?.statusLevel)
  );
  const result = ThresholdsSchema.safeParse(sorted);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, thresholds: result.data };
}

/** DynamoDB items for a ruleset (used by the seed script). */
export function rulesetItems(id: string, thresholds: AQIThreshold[]) {
  return thresholds.map((t) => ({
    PK: rulesetKey(id),
    SK: `THRESHOLD#${t.statusLevel}`,
    ...t,
  }));
}

export interface RulesConfig {
  table?: string;
  rulesetId?: string;
}

export function rulesConfigFromEnv(): RulesConfig {
  return {
    table: process.env.RULES_TABLE_NAME || undefined,
    rulesetId: process.env.RULESET_ID || DEFAULT_RULESET_ID,
  };
}

let cached: { key: string; ruleset: Ruleset; at: number } | null = null;

/** Clears the in-memory ruleset cache (tests). */
export function resetRulesCache(): void {
  cached = null;
}

/**
 * The ruleset in force: the validated RulesConfig item set, cached for five
 * minutes per container, or the built-in defaults.
 */
export async function getActiveRuleset(
  dynamodb: DynamoDBClient,
  config: RulesConfig = rulesConfigFromEnv()
): Promise<Ruleset> {
  const id = config.rulesetId || DEFAULT_RULESET_ID;
  if (!config.table) return BUILT_IN_RULESET;

  const key = `${config.table}|${id}`;
  if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) {
    return cached.ruleset;
  }

  try {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: marshall({ ":pk": rulesetKey(id), ":prefix": "THRESHOLD#" }),
      })
    );
    const items = (result.Items ?? []).map((item) => {
      const { PK, SK, ...band } = unmarshall(item);
      return band;
    });

    let ruleset: Ruleset = BUILT_IN_RULESET;
    if (items.length === 0) {
      console.warn(JSON.stringify({ event: "rules_config_empty", rulesetId: id }));
    } else {
      const parsed = parseThresholds(items);
      if (parsed.ok) {
        ruleset = { id, thresholds: parsed.thresholds, source: "dynamodb" };
      } else {
        console.error(JSON.stringify({ event: "rules_config_invalid", rulesetId: id, error: parsed.error }));
      }
    }
    cached = { key, ruleset, at: Date.now() };
    return ruleset;
  } catch (err) {
    // Not cached: the next request tries the table again.
    console.error(JSON.stringify({ event: "rules_config_unavailable", error: (err as Error).name }));
    return cached?.key === key ? cached.ruleset : BUILT_IN_RULESET;
  }
}
