# BreatheSafe Campus — Architecture (as built)

Serverless on AWS, defined entirely in [infrastructure/template.yaml](infrastructure/template.yaml)
(AWS SAM). Region `ap-south-1`. Two stacks from the same template: `breathesafe-campus` (prod) and
`breathesafe-campus-dev` (dev), configured in `infrastructure/samconfig.toml`.

## 1. Components

| Layer | What | Notes |
|---|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind, TanStack Query | Static pages, client-side data fetching. Runs locally or on any static host. |
| API | Amazon API Gateway (REST) | Throttling 20 rps / burst 40; Cognito authorizer on write routes; CORS on gateway errors; X-Ray. |
| Compute | 7 AWS Lambda functions (Node.js 22, arm64, esbuild bundles) | One per service, see §2. Timeouts ≤ 25 s (API Gateway limit 29 s). |
| Data | Amazon DynamoDB, on-demand | `aqi-readings` (TTL 8 days), `alerts-decisions` (deletion protection, point-in-time recovery, Retain policy). |
| Identity | Amazon Cognito user pool | Email sign-up; users may only write `email`, `name`, `custom:institution`. Deletion protection on. |
| Messaging | Amazon SNS | `alerts` topic (alert emails), `ops` topic (alarm emails). |
| Speech | Amazon Polly | Neural voice *Kajal*, `en-IN` and `hi-IN`. |
| Scheduling | Amazon EventBridge scheduled rule | CPCB refresh every 30 minutes. |
| Secrets | SSM Parameter Store (SecureString) | Gemini API key; read at runtime by the notices function only. |
| Observability | CloudWatch Logs (14 days), 6 CloudWatch alarms, AWS X-Ray | Logs in `/breathesafe/<stage>/<function>`. |

## 2. Services and routes

| Function | Routes | Auth |
|---|---|---|
| `fetch-aqi` | `GET /api/v1/aqi/current?campus=<area>`, `GET /api/v1/areas`, `GET /api/v1/areas/nearest?lat&lon` | public |
| `recommendation` | `GET /api/v1/recommendations/current?campus=<area>` | public |
| `trends` | `GET /api/v1/trends?campus=<area>&hours=<1..168>` | public |
| `alerts` | `GET /api/v1/alerts?campus=<area>` · `POST /api/v1/alerts` · `PATCH /api/v1/alerts/{id}/decision` | GET public; POST/PATCH Cognito |
| `notices` | `GET /api/v1/notices/draft` (Cognito) · `GET /api/v1/notices/audio` (public, issued alerts only) | mixed |
| `auth` | `POST /api/v1/auth/{signup,confirm,signin,refresh}`, `GET /api/v1/auth/profile` | public (Cognito client APIs) |
| `stations-refresh` | EventBridge schedule (no route) | — |

All read routes accept an optional `scenario=<good|…|severe>` (presenter/demo mode).

## 3. Areas — the unit everything is keyed by

`campus` in the API is an **area id**:

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
   from the data.gov.in feed (one row per pollutant; `pollutant_avg` is a sub-index; AQI = max with ≥3
   pollutants incl. PM; IST `dd-mm-yyyy` parsed explicitly).
2. **Open-Meteo** — otherwise, hourly concentrations for the area's coordinates; Indian AQI computed
   with CPCB breakpoints (24 h averages for PM10/PM2.5/NO₂/SO₂/NH₃, 8 h for O₃/CO; CO converted to
   mg/m³). One retry, 30-minute cache per area.
3. **Cached** — if both fail, the area's last stored reading from the past 3 hours, labelled `cached`.
4. Otherwise **unavailable** (HTTP 503) — no stale value is shown as current.

Demo/presenter requests return labelled fixtures named after the area and never write to the database.
Readings are stored once per source timestamp (`READING#<timestamp>`) for the trend chart; areas
served by Open-Meteo build their trend from its hourly history.

## 5. Data model (DynamoDB)

| Table | PK | SK | Item |
|---|---|---|---|
| `aqi-readings` | `CAMPUS#<area>` | `READING#<source timestamp>` | reading (AQI, pollutants, source, dataMode, TTL) |
| `aqi-readings` | `STATIONS` | `LATEST` | gzip snapshot of all CPCB stations |
| `alerts-decisions` | `CAMPUS#<area>` | `ALERT#<createdAt>#<alertId>` | alert: message (+Hindi), audience, snapshot, recommendation, delivery, decision, decisionBy, adminName |

Decisions are written with a condition (`attribute_not_exists(decision)`), so they can't be overwritten
(HTTP 409). `adminName` / `decisionBy` come from the verified Cognito token claims, never the request body.

## 6. Recommendation engine and notices

- `backend/shared/src/aqi-categories.ts` — CPCB bands and actions; invalid input → `Unavailable`, never a band.
- `backend/shared/src/evaluate.ts` — recommendation with evidence, rule, data quality and disclaimer.
- `backend/shared/src/notice-templates.ts` — reviewed English + Hindi notices per band and audience.
- `backend/services/notices/src/ai.ts` — optional Gemini rephrasing; rejected unless every number is
  unchanged, the location is kept and the Hindi is in Devanagari; any error → template.

## 7. Security

- Cognito authorizer on POST alert, PATCH decision and notice drafts; frontend sends the ID token and
  refreshes once on 401.
- Least-privilege IAM: explicit DynamoDB actions per function; SNS publish only on the alerts topic;
  `ssm:GetParameter` only on the Gemini key; the auth function has no AWS permissions.
- Input validation and length limits; malformed JSON → 400; Cognito errors mapped to stable codes
  without raw messages.
- `CpcbApiKey` is a `NoEcho` parameter. Tables and user pool are retained on stack deletion.

## 8. Observability and cost controls

- Alarms → `ops` SNS email: API 5XX ≥ 5/5 min, any Lambda throttle, errors in aqi / recommendation /
  alerts / notices ≥ 3/5 min.
- X-Ray on API Gateway and all functions; 14-day log retention.
- Caching (30 min Open-Meteo per area, 5 min station snapshot in memory), stage throttling, and an AWS
  Budget alert on the account.

## 9. Not built (roadmap)

- Hosting the frontend on AWS (S3 + CloudFront or Amplify) and CI/CD (GitHub Actions with OIDC).
- SMS / push notifications; multi-campus administration and role-based access.
- Forecasting (e.g. SageMaker) — the MVP shows only current and recent data.
- Moving remaining third-party keys to SSM; pagination for very long alert histories.
