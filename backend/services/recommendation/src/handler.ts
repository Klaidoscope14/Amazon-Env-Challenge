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
import { evaluatePlan } from "../../../shared/src/plans.js";
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
