# VayuSaathi — Architecture (as built)

Serverless on AWS, defined entirely in [infrastructure/template.yaml](infrastructure/template.yaml)
(AWS SAM). Region `ap-south-1`. Two stacks from the same template: `breathesafe-campus` (prod) and
`breathesafe-campus-dev` (dev), configured in `infrastructure/samconfig.toml`. (Stack and table names
keep the original "campus" naming so existing resources are never replaced.)

## 1. Components

| Layer | What | Notes |
|---|---|---|
| Frontend | Next.js (App Router, static export), TypeScript, Tailwind, TanStack Query | Static pages, client-side data fetching. Hosted in a private S3 bucket behind CloudFront (Origin Access Control, HTTPS, HTTP/3, security headers incl. CSP/HSTS). A CloudFront Function maps clean URLs to the exported files. `/api/*` on the same address is routed to API Gateway (uncached), so the site and API share an origin. Published with `npm run deploy:web`. |
| API | Amazon API Gateway (REST) | Throttling 20 rps / burst 40; Cognito authorizer on write routes; CORS on gateway errors; X-Ray. |
| Compute | 8 AWS Lambda functions (Node.js 22, arm64, esbuild bundles) | One per service, see §2. Timeouts ≤ 25 s (API Gateway limit 29 s). |
| Data | Amazon DynamoDB, on-demand | `aqi-readings` (TTL 8 days), `alerts-decisions` (deletion protection, PITR), `rules-config` (PITR). All with Retain policy. |
| Events | Amazon EventBridge | Custom bus `breathesafe-<stage>`, 30-day archive, rule → CloudWatch event log. |
| Identity | Amazon Cognito user pool | Email sign-up; users may only write `email` and `name`. Optional TOTP MFA. Optional SES sender (`SesFromEmail`). Deletion protection on. |
| Messaging | Amazon SNS | `alerts` topic (alert emails), `ops` topic (alarm emails). |
| Speech | Amazon Polly | Neural voice *Kajal*, `en-IN` and `hi-IN`. |
| Secrets | SSM Parameter Store (SecureString) | Google Air Quality key (functions that look up air quality) and Gemini key (notices, explain). |
| Observability | CloudWatch Logs (14 days), 7 CloudWatch alarms, AWS X-Ray | Logs in `/breathesafe/<stage>/<function>`; events in `/aws/events/breathesafe-<stage>`. |
| Validation | Zod | Every API input and the Google Air Quality response (`backend/shared/src/schemas.ts`, `google-aq.ts`). |
| CI | GitHub Actions | Typecheck, Vitest, ESLint, Next build, `sam validate --lint`, `sam build`. Deploys stay manual. |

## 2. Services and routes

| Function | Routes | Auth |
|---|---|---|
| `fetch-aqi` | `GET /api/v1/aqi/current?campus=<area>`, `GET /api/v1/areas`, `GET /api/v1/areas/nearest?lat&lon` | public |
| `recommendation` | `GET /api/v1/recommendations/current?campus=<area>` · `GET /api/v1/rules` · `GET /api/v1/catalog` (audiences, plan activities, demo scenarios with labels) · `POST /api/v1/plans/evaluate` | public |
| `explain` | `GET /api/v1/explain?campus=<area>&lang=en\|hi` | public (cached, rate-limited) |
| `trends` | `GET /api/v1/trends?campus=<area>&hours=<1..168>` | public |
| `alerts` | `GET /api/v1/alerts?campus=<area>&limit&cursor` · `POST /api/v1/alerts` (optional `Idempotency-Key`) · `PATCH /api/v1/alerts/{id}/decision` | GET public; POST/PATCH Cognito + `custom:role=admin` (granted to every verified account) |
| `notices` | `GET /api/v1/notices/draft` (Cognito) · `GET /api/v1/notices/audio` (public, issued alerts only) | mixed |
| `auth` | `POST /api/v1/auth/{signup,confirm,refresh,forgot-password,reset-password,resend-code,signout}`, `POST /api/v1/auth/mfa/{setup,enable,disable}`, `GET /api/v1/auth/profile` | public (Cognito client APIs; MFA setup uses the caller's access token; sign-out revokes the refresh token) |
| `pre-token` | Cognito Pre Token Generation trigger (no route) | — |
| *(browser)* | Sign-in: SRP (`USER_SRP_AUTH`) and the TOTP challenge, straight to Cognito (`frontend/src/lib/cognito.ts`) | — |

All read routes accept an optional `scenario=<good|…|severe>` (presenter/demo mode). The query
parameter is still called `campus` for compatibility; its value is an area id.

## 3. Areas — the unit everything is keyed by

- `geo-<lat×10>-<lon×10>` — a ~11 km grid cell around the user's location (any point in India),
- `city-<city>` — a city from the built-in table (area picker, demo mode).

The browser rounds coordinates to 2 decimals (~1 km) and calls `/areas/nearest` once; the result is
remembered in `localStorage`. Coordinates are never stored or logged server-side. Shared notice links
carry `?area=<id>`.

## 4. Data-source selection

For a live request (`DATA_MODE=live`), `getAreaReading` (backend/shared/src/area-readings.ts):

1. **Recent stored reading** — if the area has a Google reading fetched in the last 30 minutes (in
   DynamoDB), it is reused, so API calls stay low across Lambda containers.
2. **Google Air Quality API** — `POST currentConditions:lookup` for the area's coordinates with
   `customLocalAqis: [{regionCode: "IN", aqi: "ind_cpcb"}]`, `LOCAL_AQI` and `POLLUTANT_CONCENTRATION`.
   The AQI, category and dominant pollutant come from the `ind_cpcb` index (India's National AQI, CPCB
   scale); gas concentrations are converted from ppb to µg/m³ (CO to mg/m³). Response validated with
   Zod; one retry; 30-minute in-memory cache per area. The key is read from SSM.
3. **Cached** — if that fails, the area's last stored reading from the past 3 hours, labelled `cached`.
4. Otherwise **unavailable** (HTTP 503) — no stale value is shown as current.

Trends use `POST history:lookup` (168 hourly records, fetched once per area per hour and sliced for each
window); if it fails, stored readings are used.

Demo/presenter requests return labelled fixtures named after the area and never write to the database.
New live readings are stored once per source timestamp (`READING#<timestamp>`) and announced as events (§7).

## 5. Data model (DynamoDB)

| Table | PK | SK | Item |
|---|---|---|---|
| `aqi-readings` | `CAMPUS#<area>` | `READING#<source timestamp>` | reading (AQI, pollutants, source, dataMode, TTL) |
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
- `GET /api/v1/rules` serves the active ruleset. The frontend keeps no copy: the gauge, scale strip,
  trend chart (whose points carry their `status`) and About page all draw from it.

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

- Sign-in uses SRP from the browser: the password is never sent to Cognito or to the API (the app
  client allows only `USER_SRP_AUTH` and refresh). Optional TOTP MFA.
- Cognito authorizer on POST alert, PATCH decision and notice drafts; frontend sends the ID token and
  refreshes once on 401. The write routes also require the `custom:role` claim, which the
  `pre-token` trigger adds to every ID token (stored role if an admin set one, otherwise `admin` —
  i.e. every verified account; change `DEFAULT_ROLE` to restrict).
- Least-privilege IAM: explicit DynamoDB actions per function (RulesConfig: `Query` only);
  `events:PutEvents` only on the stack's bus; SNS publish only on the alerts topic; `ssm:GetParameter`
  only on the specific key each function needs (Google Air Quality, Gemini); the auth and pre-token
  functions have no AWS permissions.
- Zod validation and length limits on every input; malformed JSON → 400; Cognito errors mapped to
  stable codes without raw messages.
- API keys (Google Air Quality, Gemini) live in SSM SecureString parameters, readable only by the functions that need them. Tables and user pool are retained on stack deletion.

## 11. Observability and cost controls

- Alarms → `ops` SNS email: API 5XX ≥ 5/5 min, any Lambda throttle, errors in aqi / recommendation /
  alerts / notices / explain ≥ 3/5 min.
- X-Ray on API Gateway and all functions; 14-day log retention; structured JSON log events
  (`backend/shared/src/observability.ts`).
- Business metrics via CloudWatch Embedded Metric Format, namespace `BreatheSafe` (the app's earlier name, kept so existing metrics continue), dimension `Stage`:
  `AlertsCreated`, `DecisionsRecorded`, `ExplanationsAI`, `ExplanationsFallback`, `ReadingsUnavailable`
  (5 names × 2 stages = the 10 free custom metrics).
- Caching (30 min Google reading per area — also reused from DynamoDB across containers — 60 min
  history per area sliced for every trend window, 5 min ruleset in memory, 30 min
  explanations), stage throttling, AI rate limit, and an AWS Budget alert on the account.

## 12. Testing

- Vitest (backend): unit tests plus handler-level tests with mocked AWS clients and `fetch`.
- Playwright (`frontend/e2e`): dashboard → plan verdict → sign in → share alert → record decision,
  against a production build with the API mocked in the browser.

## 13. Not built (roadmap)

- Continuous deployment (GitHub Actions with OIDC) and a custom domain.
- httpOnly-cookie sessions (needs the frontend hosted on the API's site).
- Push/SMS notifications (e.g. an `aqi.threshold.crossed` consumer) and subscriptions per area.
- An admin UI for editing RulesConfig (today: DynamoDB console + validation).
- Forecasting (e.g. SageMaker) — the MVP shows only current and recent data.
