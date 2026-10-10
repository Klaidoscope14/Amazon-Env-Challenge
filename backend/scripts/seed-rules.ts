/*
 * Seeds the RulesConfig table with the built-in CPCB ruleset.
 *
 *   npm run seed:rules -- --stage dev            # only writes bands that don't exist yet
 *   npm run seed:rules -- --stage prod --force   # overwrite edited bands with the defaults
 *
 * Uses your AWS CLI credentials and region. Until the table is seeded, every
 * function uses the same built-in rules, so seeding is safe at any time.
 */
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { CPCB_THRESHOLDS, DEFAULT_RULESET_ID } from "../shared/src/aqi-categories.js";
import { parseThresholds, rulesetItems } from "../shared/src/rules.js";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const stage = option("stage");
if (stage !== "dev" && stage !== "prod") {
  console.error("Usage: npm run seed:rules -- --stage dev|prod [--force] [--region ap-south-1]");
  process.exit(1);
}
const table = `breathesafe-rules-config-${stage}`;
const force = args.includes("--force");

const parsed = parseThresholds(CPCB_THRESHOLDS);
if (!parsed.ok) {
  console.error(`Built-in ruleset is invalid: ${parsed.error}`);
  process.exit(1);
}

const dynamodb = new DynamoDBClient({ region: option("region") ?? process.env.AWS_REGION ?? "ap-south-1" });
let written = 0;
for (const item of rulesetItems(DEFAULT_RULESET_ID, parsed.thresholds)) {
  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: table,
        Item: marshall({ ...item, updatedAt: new Date().toISOString() }),
        ...(force ? {} : { ConditionExpression: "attribute_not_exists(PK)" }),
      })
    );
    written++;
    console.log(`  wrote ${item.SK} (${item.status})`);
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      console.log(`  kept  ${item.SK} (${item.status}) — already exists; use --force to overwrite`);
    } else {
      throw err;
    }
  }
}
console.log(`${table}: ${written} band(s) written for ruleset ${DEFAULT_RULESET_ID}.`);
