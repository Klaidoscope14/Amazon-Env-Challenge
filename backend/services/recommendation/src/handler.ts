import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { evaluate, evaluateUnavailable } from "../../../shared/src/evaluate.js";
import { dataContextFromEnv, getAreaReading } from "../../../shared/src/area-readings.js";
import { getActiveRuleset } from "../../../shared/src/rules.js";
import {
  AreaQuerySchema,
  EvaluatePlansBodySchema,
  parse,
  ValidationError,
} from "../../../shared/src/schemas.js";
import { parseJsonBody, respond } from "../../../shared/src/http.js";
import { ACTIVITIES, ACTIVITY_IDS, evaluatePlan } from "../../../shared/src/plans.js";
import { AUDIENCE_LABELS, AUDIENCES } from "../../../shared/src/notice-templates.js";
import { DEFAULT_DEMO_SCENARIO, DEMO_SCENARIOS, demoScenarioAqi } from "../../../shared/src/demo.js";
import { getThresholdForAqi } from "../../../shared/src/aqi-categories.js";
import { Catalog, Ruleset } from "../../../shared/src/types.js";
import { errorFields, log } from "../../../shared/src/observability.js";

const dynamodb = new DynamoDBClient({});
const ctx = dataContextFromEnv();

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // GET /rules: the ruleset in force, so clients can show exactly what the
    // engine applies (including edits made in the RulesConfig table).
    if (event.path.endsWith("/rules")) {
      const ruleset = await getActiveRuleset(dynamodb);
      return respond(200, ruleset);
    }

    // GET /catalog: choices the API accepts (audiences, plan activities, demo
    // scenarios) with labels, so the frontend never keeps its own copies.
    if (event.path.endsWith("/catalog")) {
      return respond(200, catalog(await getActiveRuleset(dynamodb)));
    }

    // POST /plans/evaluate: Go / Modify / Avoid for each of today's plans.
    if (event.httpMethod === "POST" && event.path.endsWith("/plans/evaluate")) {
      const body = parse(EvaluatePlansBodySchema, parseJsonBody(event));
      const [{ reading }, ruleset] = await Promise.all([
        getAreaReading(dynamodb, ctx, body.campus, body.scenario),
        getActiveRuleset(dynamodb),
      ]);
      const recommendation = reading ? evaluate(reading, ruleset) : evaluateUnavailable();
      return respond(200, {
        status: recommendation.status,
        aqi: recommendation.evidence.aqi,
        dataQuality: recommendation.dataQuality,
        basedOn: reading?.timestamp ?? null,
        verdicts: body.plans.map((plan) =>
          evaluatePlan(plan, recommendation.status, recommendation.statusLevel)
        ),
        disclaimer:
          "Based on the current reading, not a forecast. Decision support, not medical advice.",
      });
    }

    const { campus: areaId, scenario } = parse(AreaQuerySchema, event.queryStringParameters ?? {});

    // Same resolution as GET /aqi/current, so the recommendation always
    // evaluates the reading the dashboard is showing.
    const [{ reading }, ruleset] = await Promise.all([
      getAreaReading(dynamodb, ctx, areaId, scenario),
      getActiveRuleset(dynamodb),
    ]);
    return respond(200, reading ? evaluate(reading, ruleset) : evaluateUnavailable());
  } catch (err) {
    if (err instanceof ValidationError) return respond(400, { error: err.message });
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
    return respond(500, { error: "Internal server error" });
  }
}

function catalog(ruleset: Ruleset): Catalog {
  return {
    audiences: AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABELS[value] })),
    audienceLabels: AUDIENCE_LABELS,
    activities: ACTIVITY_IDS.map((value) => ({ value, label: ACTIVITIES[value].label })),
    demoScenarios: DEMO_SCENARIOS.map((value) => {
      const band = getThresholdForAqi(demoScenarioAqi(value), ruleset.thresholds);
      return { value, label: band ? `${band.status} (${band.minAqi}–${band.maxAqi})` : value };
    }),
    defaultDemoScenario: DEFAULT_DEMO_SCENARIO,
  };
}
