# BreatheSafe — Architecture (as built)

Serverless on AWS, defined entirely in [infrastructure/template.yaml](infrastructure/template.yaml)
(AWS SAM). Region `ap-south-1`. Two stacks from the same template: `breathesafe-campus` (prod) and
`breathesafe-campus-dev` (dev), configured in `infrastructure/samconfig.toml`. (Stack and table names
keep the original "campus" naming so existing resources are never replaced.)

## 1. Components

| Layer | What | Notes |
|---|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind, TanStack Query | Static pages, client-side data fetching. Runs locally or on any static host. |
| API | Amazon API Gateway (REST) | Throttling 20 rps / burst 40; Cognito authorizer on write routes; CORS on gateway errors; X-Ray. |
| Compute | 8 AWS Lambda functions (Node.js 22, arm64, esbuild bundles) | One per service, see §2. Timeouts ≤ 25 s (API Gateway limit 29 s). |
| Data | Amazon DynamoDB, on-demand | `aqi-readings` (TTL 8 days), `alerts-decisions` (deletion protection, PITR), `rules-config` (PITR). All with Retain policy. |
| Events | Amazon EventBridge | Custom bus `breathesafe-<stage>`, 30-day archive, rule → CloudWatch event log; scheduled rule for the CPCB refresh. |
| Identity | Amazon Cognito user pool | Email sign-up; users may only write `email` and `name`. Deletion protection on. |
| Messaging | Amazon SNS | `alerts` topic (alert emails), `ops` topic (alarm emails). |
| Speech | Amazon Polly | Neural voice *Kajal*, `en-IN` and `hi-IN`. |
| Secrets | SSM Parameter Store (SecureString) | Gemini API key; read at runtime by the notices and explain functions only. |
| Observability | CloudWatch Logs (14 days), 7 CloudWatch alarms, AWS X-Ray | Logs in `/breathesafe/<stage>/<function>`; events in `/aws/events/breathesafe-<stage>`. |
| Validation | Zod | Every API input and the Open-Meteo response (`backend/shared/src/schemas.ts`, `open-meteo.ts`). |
| CI | GitHub Actions | Typecheck, Vitest, ESLint, Next build, `sam validate --lint`, `sam build`. Deploys stay manual. |

## 2. Services and routes

| Function | Routes | Auth |
|---|---|---|
| `fetch-aqi` | `GET /api/v1/aqi/current?campus=<area>`, `GET /api/v1/areas`, `GET /api/v1/areas/nearest?lat&lon` | public |
| `recommendation` | `GET /api/v1/recommendations/current?campus=<area>` · `GET /api/v1/rules` · `POST /api/v1/plans/evaluate` | public |
| `explain` | `GET /api/v1/explain?campus=<area>&lang=en\|hi` | public (cached, rate-limited) |
| `trends` | `GET /api/v1/trends?campus=<area>&hours=<1..168>` | public |
| `alerts` | `GET /api/v1/alerts?campus=<area>&limit&cursor` · `POST /api/v1/alerts` (optional `Idempotency-Key`) · `PATCH /api/v1/alerts/{id}/decision` | GET public; POST/PATCH Cognito + `custom:role=admin` (granted to every verified account) |
| `notices` | `GET /api/v1/notices/draft` (Cognito) · `GET /api/v1/notices/audio` (public, issued alerts only) | mixed |
| `auth` | `POST /api/v1/auth/{signup,confirm,signin,refresh,forgot-password,reset-password,resend-code,signout}`, `GET /api/v1/auth/profile` | public (Cognito client APIs; sign-out revokes the refresh token) |
| `stations-refresh` | EventBridge schedule (no route) | — |

All read routes accept an optional `scenario=<good|…|severe>` (presenter/demo mode). The query
parameter is still called `campus` for compatibility; its value is an area id.

## 3. Areas — the unit everything is keyed by

- `st-<station>` — a CPCB monitoring station (only when its data is current),
- `geo-<lat×10>-<lon×10>` — a ~11 km grid cell around the user's location (any point in India),
- `city-<city>` — a city from the built-in table (area picker, demo mode).

The browser rounds coordinates to 2 decimals (~1 km) and calls `/areas/nearest` once; the result is
remembered in `localStorage`. Coordinates are never stored or logged server-side. Shared notice links
carry `?area=<id>`.

## 4. Data-source selection

For a live request (`DATA_MODE=live`), `getAreaReading` (backend/shared/src/area-readings.ts):

1. **CPCB measured** — if a CPCB station for the area (or within 15 km of a grid cell) reported within
   3 hours. The station snapshot is one gzip-compressed DynamoDB item written by `stations-refresh`
   from the data.gov.in feed.
2. **Open-Meteo** — otherwise, hourly concentrations for the area's coordinates (response validated
   with Zod); Indian AQI computed with CPCB breakpoints (24 h averages for PM10/PM2.5/NO₂/SO₂/NH₃, 8 h
   for O₃/CO). One retry, 30-minute cache per area.
3. **Cached** — if both fail, the area's last stored reading from the past 3 hours, labelled `cached`.
4. Otherwise **unavailable** (HTTP 503) — no stale value is shown as current.

Demo/presenter requests return labelled fixtures named after the area and never write to the database.
New live readings are stored once per source timestamp (`READING#<timestamp>`) and announced as events (§7).

## 5. Data model (DynamoDB)

| Table | PK | SK | Item |
|---|---|---|---|
| `aqi-readings` | `CAMPUS#<area>` | `READING#<source timestamp>` | reading (AQI, pollutants, source, dataMode, TTL) |
| `aqi-readings` | `STATIONS` | `LATEST` | gzip snapshot of all CPCB stations |
| `alerts-decisions` | `CAMPUS#<area>` | `ALERT#<createdAt>#<alertId>` | alert: message (+Hindi), audience, snapshot, recommendation, delivery, decision, decisionBy, adminName (the sender) |
| `alerts-decisions` | `IDEMPOTENCY#<user sub>` | `KEY#<Idempotency-Key>` | request hash, status, created alert's key; TTL 24 h |
| `rules-config` | `RULESET#<id>` | `THRESHOLD#<level>` | one band: minAqi, maxAqi, status, statusLevel, action, color |

Decisions are written with a condition (`attribute_not_exists(decision)`), so they can't be overwritten
(HTTP 409). `adminName` / `decisionBy` come from the verified Cognito token claims, never the request body.
Audiences are `family`, `neighbours`, `group`, `all`; alerts created before the product opened to
everyone may carry `students`, `staff` or `parents`, which are still displayed.

## 6. Rules engine (RulesConfig)

- `backend/shared/src/aqi-categories.ts` — the built-in ruleset `cpcb-india-v1` (CPCB bands + actions); invalid AQI → `Unavailable`, never a band.
- `backend/shared/src/rules.ts` — `getActiveRuleset()` reads `RULESET#cpcb-india-v1` from the RulesConfig
  table, validates it with Zod (six CPCB categories in order, contiguous from 0, reaching 500, non-empty
  actions) and caches it for 5 minutes per container. Empty table, invalid edit or read error → the
  built-in ruleset (logged as `rules_config_empty` / `rules_config_invalid` / `rules_config_unavailable`).
- `backend/shared/src/evaluate.ts` — recommendation with evidence, rule (incl. ruleset id and whether it
  came from the table), data quality and disclaimer.
- Seeding: `npm run seed:rules` (prod) / `npm run seed:rules:dev` — conditional writes, `--force` to reset edits.
- `GET /api/v1/rules` serves the active ruleset; the About page renders it live.

## 7. Domain events (EventBridge)

Published by `backend/shared/src/events.ts` to the `breathesafe-<stage>` bus. Best-effort: short
timeouts, failures logged (`event_publish_failed`) and never surfaced to the API caller.

| Source | Detail type | When | Detail |
|---|---|---|---|
| `breathesafe.aqi` | `aqi.reading.received` | a new live reading is stored | area, areaName, aqi, status, dominantPollutant, source, timestamp |
| `breathesafe.aqi` | `aqi.threshold.crossed` | its category differs from the area's previous stored reading | + previousStatus, previousAqi, previousTimestamp, direction (`worse`/`better`) |
| `breathesafe.alerts` | `alert.created` | an alert is shared | alertId, area, audience, aqi, status, dataMode, emailDelivery, createdAt |
| `breathesafe.alerts` | `alert.decision.recorded` | a decision is recorded | alertId, area, decisionTimestamp |

Consumers today: an **archive** (all `breathesafe.*` events, 30 days, replayable) and a rule that writes
every event to the CloudWatch log group `/aws/events/breathesafe-<stage>`. Events carry no message text,
names or coordinates. New consumers (e.g. push notifications on `aqi.threshold.crossed`) subscribe
with a rule, without changing producers.

## 8. Notices and explanations (AI with guardrails)

- `backend/shared/src/notice-templates.ts` — reviewed English + Hindi notices per band and audience, signed with the sender's name.
- `backend/services/notices/src/ai.ts` — optional Gemini rephrasing; rejected unless every number is
  unchanged, the location is kept and the Hindi is in Devanagari; any error → template.
- `backend/services/explain/` — `GET /explain`:
  - **Input side:** the evidence (place, AQI, category and range, main pollutant, source, time, action,
    data quality) is built on the server from the same reading the dashboard shows; no client text
    reaches the model.
  - **Output guardrails** (`guardrails.ts`): 40–600 characters, ≤ 5 sentences, no links/markup, no
    medical advice/treatments/medicines/safety promises (English and Hindi patterns), every number must
    appear in the evidence, the AQI and category must be stated, the place must be named (English),
    and the language must match.
  - **Fallback:** a deterministic explanation (`explanation.ts`) when AI is disabled, unavailable,
    rate-limited (10 calls/min per container) or rejected; the response says which (`generatedBy`,
    `fallbackReason`). Results are cached per reading for 30 minutes.
- Gemini client: `backend/shared/src/gemini.ts` (key from SSM, 6 s timeout, JSON output).

## 9. Plans, idempotency and pagination

- **Plans** (`backend/shared/src/plans.ts`): verdict = matrix[CPCB level][activity exertion]; from Moderate air,
  a plan over 60 minutes or one involving someone more sensitive moves one step stricter. Plans are kept
  in the browser (localStorage); the API only evaluates them.
- **Idempotency**: the first request with a key claims it with a conditional put; a retry with the same
  key and body returns the stored alert (`200`, `Idempotent-Replayed: true`), a different body → `422`,
  a request still in flight → `409`. A failed create releases the key.
- **Pagination**: `GET /alerts` returns `nextCursor` (opaque, bound to the area's partition); trend
  queries follow `LastEvaluatedKey`.

## 10. Security

- Cognito authorizer on POST alert, PATCH decision and notice drafts; frontend sends the ID token and
  refreshes once on 401.
- Least-privilege IAM: explicit DynamoDB actions per function (RulesConfig: `Query` only);
  `events:PutEvents` only on the stack's bus; SNS publish only on the alerts topic; `ssm:GetParameter`
  only on the Gemini key; the auth function has no AWS permissions.
- Zod validation and length limits on every input; malformed JSON → 400; Cognito errors mapped to
  stable codes without raw messages.
- `CpcbApiKey` is a `NoEcho` parameter. Tables and user pool are retained on stack deletion.

## 11. Observability and cost controls

- Alarms → `ops` SNS email: API 5XX ≥ 5/5 min, any Lambda throttle, errors in aqi / recommendation /
  alerts / notices / explain ≥ 3/5 min.
- X-Ray on API Gateway and all functions; 14-day log retention; structured JSON log events
  (`backend/shared/src/observability.ts`).
- Business metrics via CloudWatch Embedded Metric Format, namespace `BreatheSafe`, dimension `Stage`:
  `AlertsCreated`, `DecisionsRecorded`, `ExplanationsAI`, `ExplanationsFallback`, `ReadingsUnavailable`
  (5 names × 2 stages = the 10 free custom metrics).
- Caching (30 min Open-Meteo per area, 5 min station snapshot and ruleset in memory, 30 min
  explanations), stage throttling, AI rate limit, and an AWS Budget alert on the account.

## 12. Testing

- Vitest (backend): unit tests plus handler-level tests with mocked AWS clients and `fetch`.
- Playwright (`frontend/e2e`): dashboard → plan verdict → sign in → share alert → record decision,
  against a production build with the API mocked in the browser.

## 13. Not built (roadmap)

- Hosting the frontend on AWS (S3 + CloudFront or Amplify) and continuous deployment (GitHub Actions with OIDC).
- SRP sign-in instead of USER_PASSWORD_AUTH, MFA, SES for Cognito email, httpOnly-cookie sessions.
- Push/SMS notifications (e.g. an `aqi.threshold.crossed` consumer) and subscriptions per area.
- An admin UI for editing RulesConfig (today: DynamoDB console + validation).
- Forecasting (e.g. SageMaker) — the MVP shows only current and recent data.
