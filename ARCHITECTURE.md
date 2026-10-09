# BreatheSafe Campus — System Architecture

**Architecture style:** Event-driven microservices  
**Deployment model:** Serverless-first on AWS  
**Principle:** Each layer is independently deployable, scalable, and replaceable.

---

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND LAYER                                     │
│                                                                                 │
│   Next.js App (SSR + CSR)          │   Hosted on: AWS Amplify / S3+CloudFront  │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                                       │
│   │Dashboard │ │ Alerts & │ │  About & │                                       │
│   │  Page    │ │ Decision │ │Transpare-│                                       │
│   │          │ │   Log    │ │  ncy     │                                       │
│   └────┬─────┘ └────┬─────┘ └──────────┘                                       │
│        │             │                                                          │
│        └──────┬──────┘                                                          │
│               │  REST calls (HTTPS)                                             │
└───────────────┼─────────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (Unified Entry Point)                       │
│                                                                                   │
│   /api/v1/aqi/*          → AQI Data Service                                      │
│   /api/v1/recommendations/* → Recommendation Service                             │
│   /api/v1/alerts/*       → Alert & Decision Service                              │
│   /api/v1/explain/*      → AI Explanation Service                                │
│                                                                                   │
│   Features: Rate limiting, API keys, request validation, CORS, usage plans        │
└───────────┬──────────────┬──────────────┬──────────────┬─────────────────────────┘
            │              │              │              │
            ▼              ▼              ▼              ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND LAYER                                        │
│                           (4 Microservices)                                        │
│                                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  AQI Data   │  │Recommend-   │  │  Alert &    │  │    AI       │             │
│  │  Service    │  │ation Service│  │  Decision   │  │ Explanation │             │
│  │             │  │             │  │  Service    │  │  Service    │             │
│  │ - Fetch     │  │ - Rules     │  │ - CRUD      │  │ - Bedrock   │             │
│  │ - Validate  │  │   engine    │  │ - History   │  │ - Prompts   │             │
│  │ - Cache     │  │ - Threshold │  │ - Decisions │  │ - Validate  │             │
│  │ - Transform │  │   eval      │  │ - Notify    │  │ - Guard     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                │                      │
│         ▼                ▼                ▼                ▼                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ DynamoDB:   │  │ DynamoDB:   │  │ DynamoDB:   │  │  Bedrock    │             │
│  │ AQIReadings │  │ Rules-      │  │ Alerts-     │  │  Runtime    │             │
│  │             │  │ Config      │  │ Decisions   │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                                   │
│         ┌──────────────────────────────────────┐                                  │
│         │        Amazon EventBridge            │                                  │
│         │    (Async event bus between services) │                                  │
│         └──────────────────────────────────────┘                                  │
└───────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           INFRASTRUCTURE LAYER                                    │
│                                                                                   │
│   IaC: AWS SAM / CloudFormation                                                   │
│   Monitoring: CloudWatch (Logs + Metrics + Alarms)                                │
│   Storage: S3 (static assets, historical data, demo fixtures)                     │
│   Secrets: AWS Systems Manager Parameter Store                                    │
│   CDN: CloudFront                                                                 │
│   DNS: Route 53 (if custom domain)                                                │
│   CI/CD: GitHub Actions → SAM deploy                                              │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Frontend

### Tech Stack
| Component | Technology | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | SSR for SEO + fast initial load, API routes as BFF proxy, React ecosystem |
| Language | **TypeScript** | Type safety across API contracts |
| Styling | **Tailwind CSS** | Rapid prototyping, responsive out of the box, small bundle |
| State management | **React Query (TanStack Query)** | Server-state caching, auto-refetch, stale-while-revalidate |
| Charts (if Phase 5) | **Recharts** | Lightweight, React-native, good for sparklines |
| Hosting | **AWS Amplify Hosting** | Git-push deploys, built-in CDN, SSL, preview branches |

### Frontend Structure
```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Dashboard (hero page)
│   │   ├── alerts/
│   │   │   └── page.tsx        # Alerts & Decision Log
│   │   ├── about/
│   │   │   └── page.tsx        # Transparency & Limitations
│   │   └── layout.tsx          # Root layout with nav
│   ├── components/
│   │   ├── AqiHeroCard.tsx     # Big AQI number + status badge
│   │   ├── RecommendationCard.tsx
│   │   ├── AlertForm.tsx
│   │   ├── DecisionRecorder.tsx
│   │   ├── AlertHistory.tsx
│   │   ├── DataBadge.tsx       # "Live" / "Cached" / "Demo" badge
│   │   ├── StalenessWarning.tsx
│   │   └── StatusBadge.tsx     # Color + text status indicator
│   ├── lib/
│   │   ├── api.ts              # API client (wraps fetch to API Gateway)
│   │   ├── types.ts            # Shared TypeScript interfaces
│   │   └── constants.ts        # AQI thresholds, status labels
│   └── hooks/
│       ├── useAqi.ts           # React Query hook for AQI data
│       ├── useRecommendation.ts
│       └── useAlerts.ts
├── public/
├── tailwind.config.ts
├── next.config.js
└── package.json
```

### Frontend ↔ Backend Integration
- Frontend calls API Gateway endpoints via an API client (`lib/api.ts`)
- All requests go through API Gateway — frontend never calls Lambda or DynamoDB directly
- React Query handles caching, polling (every 60s for AQI), and error/loading states
- Environment variable `NEXT_PUBLIC_API_URL` points to API Gateway stage URL
- CORS configured on API Gateway to allow the Amplify domain

---

## Layer 2: Backend (Microservices)

### Design Principles
- **Database-per-service:** Each microservice owns its DynamoDB table. No shared tables.
- **Single responsibility:** Each Lambda does one thing well.
- **Event-driven communication:** Services talk to each other via EventBridge, not direct calls.
- **Stateless compute:** All state lives in DynamoDB. Lambdas are ephemeral.

### Tech Stack
| Component | Technology | Why |
|---|---|---|
| Runtime | **Node.js 20 (ES modules)** | Fast cold starts, shared language with frontend, rich AWS SDK |
| Language | **TypeScript** | Type safety, shared types with frontend via a `shared/` package |
| Framework | **Lightweight (no framework)** | Lambda functions don't need Express/Fastify overhead. Raw handler + utility functions. |
| Validation | **Zod** | Runtime schema validation for API inputs and external data |
| AWS SDK | **AWS SDK v3 (modular)** | Tree-shakeable, smaller bundles, faster cold starts |
| Testing | **Vitest** | Fast, TypeScript-native, compatible with Node.js |

---

### Microservice 1: AQI Data Service

**Responsibility:** Fetch, validate, cache, and serve air quality data.

```
backend/services/aqi-data/
├── src/
│   ├── handler.ts              # Lambda entry point
│   ├── providers/
│   │   ├── cpcb.ts             # CPCB data fetcher
│   │   ├── openaq.ts           # OpenAQ data fetcher (fallback)
│   │   └── demo.ts             # Demo fixture provider
│   ├── validator.ts            # Zod schema for AQI response
│   ├── transformer.ts          # Normalize data from different providers
│   └── types.ts
├── fixtures/
│   └── demo-readings.json      # Labelled demo data for each AQI category
└── template.yaml               # SAM template for this service
```

**API Endpoints:**
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/aqi/current?campus={id}` | Latest AQI reading for a campus |
| `GET` | `/api/v1/aqi/history?campus={id}&hours=24` | Recent readings (Phase 5) |

**DynamoDB Table: `AQIReadings`**
| Key | Type | Description |
|---|---|---|
| `PK` | String | `CAMPUS#dtu-delhi` |
| `SK` | String | `READING#2026-10-10T14:30:00Z` |
| `aqi` | Number | AQI value |
| `dominantPollutant` | String | `PM2.5`, `PM10`, etc. |
| `pollutants` | Map | `{ pm25: 180, pm10: 220, no2: 45 }` |
| `source` | String | `CPCB` / `OpenAQ` |
| `stationName` | String | `ITO, Delhi` |
| `timestamp` | String | ISO 8601 from source |
| `fetchedAt` | String | When we fetched it |
| `dataMode` | String | `live` / `cached` / `demo` |
| `TTL` | Number | Auto-expire after 48 hours |

**Events Published (to EventBridge):**
- `aqi.reading.received` — new reading fetched and stored
- `aqi.threshold.crossed` — AQI crossed a severity boundary (e.g., Moderate → Poor)
- `aqi.data.stale` — no new reading for >2 hours

---

### Microservice 2: Recommendation Service

**Responsibility:** Evaluate rules against AQI data, produce actionable recommendations.

```
backend/services/recommendation/
├── src/
│   ├── handler.ts              # Lambda entry point
│   ├── engine/
│   │   ├── rules.ts            # Threshold rules (CPCB categories)
│   │   ├── evaluator.ts        # Evaluate current data against rules
│   │   └── freshness.ts        # Data staleness checks
│   ├── templates/
│   │   └── actions.ts          # Action text templates per severity
│   └── types.ts
└── template.yaml
```

**API Endpoints:**
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/recommendations/current?campus={id}` | Current recommendation based on latest AQI |

**DynamoDB Table: `RulesConfig`**
| Key | Type | Description |
|---|---|---|
| `PK` | String | `RULESET#cpcb-india-v1` |
| `SK` | String | `THRESHOLD#poor` |
| `minAqi` | Number | 101 |
| `maxAqi` | Number | 200 |
| `status` | String | `Poor` |
| `action` | String | `Review outdoor activities...` |
| `severity` | Number | 3 (for sorting) |

Rules are stored in DynamoDB (not hardcoded) so they can be updated without redeploying. Seeded on first deploy.

**Events Consumed (from EventBridge):**
- `aqi.reading.received` → optionally pre-compute and cache the recommendation
- `aqi.threshold.crossed` → could trigger proactive admin notification (Phase 5)

**Response Shape:**
```json
{
  "status": "Poor",
  "statusLevel": 3,
  "action": "Review outdoor activities. Consider moving events indoors.",
  "evidence": {
    "aqi": 167,
    "dominantPollutant": "PM2.5",
    "pm25": 180,
    "source": "CPCB",
    "stationName": "ITO, Delhi",
    "timestamp": "2026-10-10T14:30:00Z",
    "dataAge": "12 minutes ago"
  },
  "rule": {
    "name": "CPCB AQI Category — Poor (101–200)",
    "threshold": "AQI > 100",
    "source": "Central Pollution Control Board, India"
  },
  "dataQuality": "live",
  "disclaimer": "This is decision support, not medical advice. Consult official guidance for health decisions."
}
```

---

### Microservice 3: Alert & Decision Service

**Responsibility:** Alert CRUD, decision recording, audit trail.

```
backend/services/alerts/
├── src/
│   ├── handler.ts              # Lambda entry point
│   ├── operations/
│   │   ├── createAlert.ts
│   │   ├── recordDecision.ts
│   │   ├── getAlerts.ts
│   │   └── getAlertById.ts
│   ├── validator.ts            # Zod schemas for alert input
│   └── types.ts
└── template.yaml
```

**API Endpoints:**
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/alerts` | Create and issue an alert |
| `GET` | `/api/v1/alerts?campus={id}` | List alert history |
| `GET` | `/api/v1/alerts/{id}` | Get single alert detail |
| `PATCH` | `/api/v1/alerts/{id}/decision` | Record admin's decision |

**DynamoDB Table: `AlertsDecisions`**
| Key | Type | Description |
|---|---|---|
| `PK` | String | `CAMPUS#dtu-delhi` |
| `SK` | String | `ALERT#2026-10-10T14:35:00Z#uuid` |
| `alertId` | String | UUID |
| `audience` | String | `all` / `students` / `staff` / `parents` |
| `message` | String | Alert text |
| `aqiSnapshot` | Map | Full AQI context at time of alert |
| `recommendation` | Map | Recommendation that prompted this alert |
| `status` | String | `sent` / `simulated` |
| `decision` | String | Admin's recorded action (nullable until recorded) |
| `decisionTimestamp` | String | When decision was recorded |
| `adminName` | String | Who issued it |
| `createdAt` | String | ISO 8601 |

**Events Published:**
- `alert.created` — new alert issued (consumed by notification service in Phase 5)
- `alert.decision.recorded` — admin logged their decision

---

### Microservice 4: AI Explanation Service (Phase 5)

**Responsibility:** Generate plain-language explanations grounded in structured evidence.

```
backend/services/ai-explain/
├── src/
│   ├── handler.ts              # Lambda entry point
│   ├── prompt/
│   │   ├── template.ts         # System prompt + evidence injection
│   │   └── guardrails.ts       # Output validation rules
│   ├── bedrock.ts              # Bedrock API client
│   └── types.ts
└── template.yaml
```

**API Endpoints:**
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/explain` | Generate plain-language explanation from structured evidence |

**Integration with Amazon Bedrock:**
- Model: `anthropic.claude-sonnet-4-20250514` (or latest available on Bedrock)
- System prompt is constrained: only explain the provided evidence, never invent data
- Input: structured JSON (AQI value, pollutant, rule, action)
- Output: 2–3 sentence plain-language explanation
- Guardrails: reject output if it contains medical advice, invented numbers, or ungrounded claims
- Fallback: if Bedrock fails or output fails validation, return the deterministic recommendation text

**Response Shape:**
```json
{
  "explanation": "The air quality at DTU Delhi is currently Poor, mainly due to high PM2.5 levels at 180 µg/m³. Based on CPCB guidelines, this means prolonged outdoor activity may cause discomfort, and it's advisable to review any scheduled outdoor events.",
  "generatedBy": "ai",
  "groundedIn": ["aqi:167", "pollutant:PM2.5", "rule:CPCB-Poor"],
  "disclaimer": "AI-generated summary based on measured data. Not medical advice."
}
```

---

## Layer 3: AI/ML Layer

### Current (MVP): Rules Engine
- Deterministic, transparent, debuggable
- Rules stored in DynamoDB `RulesConfig` table — configurable without code changes
- CPCB AQI categories as the authoritative basis
- No ML model, no unvalidated predictions

### Phase 5: Amazon Bedrock Integration
- Plain-language explanations only — not predictions
- Bedrock is a consumer of the rules engine output, not a replacement
- Constrained prompt template prevents hallucination
- Output validation rejects any text containing medical claims or invented data

### Future (Post-Hackathon): ML Forecasting
- Amazon SageMaker for time-series AQI forecasting
- Training data: historical CPCB readings (if available)
- Model: lightweight (Prophet, DeepAR, or similar)
- Output: 6–24 hour AQI forecast with confidence intervals
- Requirement: evaluation on held-out data before any forecast is shown to users
- Display: always show forecast uncertainty and "Forecast" badge

### AI/ML Layer Architecture
```
┌─────────────────────────────────────────────────────────┐
│                      AI/ML Layer                         │
│                                                          │
│  ┌─────────────────┐   ┌──────────────────────────────┐ │
│  │  Rules Engine    │   │  Bedrock Explanation (Ph 5)  │ │
│  │  (Deterministic) │   │                              │ │
│  │                  │   │  Constrained Prompt Template  │ │
│  │  CPCB Thresholds │──▶│  ┌──────────┐               │ │
│  │  Data Freshness  │   │  │ Evidence │ → Bedrock API  │ │
│  │  Staleness Rules │   │  │ Injection│   → Validate   │ │
│  │                  │   │  └──────────┘   → Return     │ │
│  └────────┬─────────┘   └──────────────────────────────┘ │
│           │                                               │
│           │              ┌──────────────────────────────┐ │
│           │              │  SageMaker Forecast (Future) │ │
│           │              │                              │ │
│           │              │  Time-series model           │ │
│           │              │  Confidence intervals        │ │
│           │              │  Evaluation metrics          │ │
│           │              └──────────────────────────────┘ │
│           │                                               │
│           ▼                                               │
│  Source of truth is ALWAYS the rules engine.              │
│  AI outputs are supplementary explanations only.          │
└──────────────────────────────────────────────────────────┘
```

---

## Layer 4: Infrastructure

### Tech Stack
| Component | Technology | Why |
|---|---|---|
| IaC | **AWS SAM (Serverless Application Model)** | Purpose-built for Lambda + API Gateway. YAML templates, local testing with `sam local`. |
| CI/CD | **GitHub Actions** | Free for public repos. Runs `sam build && sam deploy` on push. |
| Secrets | **AWS Systems Manager Parameter Store** | Free tier, encrypted, IAM-controlled. Stores API keys for CPCB/OpenAQ. |
| Monitoring | **Amazon CloudWatch** | Logs (every Lambda invocation), Metrics (latency, errors, cold starts), Alarms (error rate spike). |
| CDN | **Amazon CloudFront** | Caches API responses at edge, serves frontend static assets. |
| Storage | **Amazon S3** | Historical data exports, demo fixture files, frontend static assets (if not Amplify). |
| Event Bus | **Amazon EventBridge** | Decouples services. AQI service publishes events, others subscribe. |

### Infrastructure as Code Structure
```
infrastructure/
├── template.yaml               # Root SAM template (nested stacks)
├── stacks/
│   ├── aqi-data.yaml           # AQI service: Lambda + DynamoDB table + IAM
│   ├── recommendation.yaml     # Recommendation service
│   ├── alerts.yaml             # Alerts service
│   ├── ai-explain.yaml         # AI service (Phase 5)
│   ├── api-gateway.yaml        # Shared API Gateway + routes
│   ├── eventbridge.yaml        # Event bus + rules
│   └── monitoring.yaml         # CloudWatch dashboards + alarms
├── samconfig.toml              # Deploy configuration
└── buildspec.yml               # CI/CD build spec
```

### IAM — Least Privilege per Service
```
AQI Data Lambda:
  ✅ dynamodb:PutItem, GetItem, Query on AQIReadings table
  ✅ events:PutEvents on EventBridge bus
  ✅ ssm:GetParameter for API keys
  ❌ No access to AlertsDecisions table
  ❌ No access to Bedrock

Recommendation Lambda:
  ✅ dynamodb:GetItem, Query on AQIReadings table (read-only)
  ✅ dynamodb:GetItem, Query on RulesConfig table (read-only)
  ❌ No write access to AQIReadings
  ❌ No access to AlertsDecisions table

Alert Lambda:
  ✅ dynamodb:PutItem, GetItem, Query, UpdateItem on AlertsDecisions table
  ✅ dynamodb:GetItem on AQIReadings (to snapshot current AQI)
  ✅ events:PutEvents on EventBridge bus
  ❌ No write access to AQIReadings

AI Explain Lambda:
  ✅ bedrock:InvokeModel on specific model ARN
  ❌ No DynamoDB access (receives evidence as input from API)
```

---

## Integration Patterns

### 1. Synchronous: Frontend → API Gateway → Lambda

The primary request path. Used for all user-initiated actions.

```
User clicks "Refresh AQI"
  → Frontend calls GET /api/v1/aqi/current?campus=dtu-delhi
    → API Gateway routes to AQI Data Lambda
      → Lambda checks DynamoDB cache
        → If fresh (<5 min): return cached reading
        → If stale: fetch from CPCB, validate, store, return
      → Response: { aqi, pollutant, source, timestamp, dataMode }
    → Frontend renders AqiHeroCard
```

### 2. Asynchronous: EventBridge (Service-to-Service)

Decoupled communication between microservices. No service calls another directly.

```
AQI Data Service fetches a new reading
  → Stores in DynamoDB
  → Publishes event: "aqi.threshold.crossed" (if severity changed)
    → EventBridge routes to:
      → Recommendation Service: pre-computes and caches new recommendation
      → Alert Service (Phase 5): checks if auto-notification rules exist
```

**Event Schema:**
```json
{
  "source": "breathesafe.aqi-data",
  "detail-type": "aqi.threshold.crossed",
  "detail": {
    "campus": "dtu-delhi",
    "previousStatus": "Moderate",
    "currentStatus": "Poor",
    "aqi": 167,
    "dominantPollutant": "PM2.5",
    "timestamp": "2026-10-10T14:30:00Z"
  }
}
```

### 3. Data Flow: Alert Creation (Full Workflow)

```
1. Admin sees AQI = 312 (Severe) on Dashboard
   └─ GET /aqi/current + GET /recommendations/current

2. Admin clicks "Issue Alert"
   └─ Frontend shows AlertForm pre-filled with recommendation text

3. Admin selects audience = "All Students", edits message, clicks Send
   └─ POST /alerts
      Body: { campus, audience, message }
      └─ Alert Lambda:
         a. Fetches current AQI snapshot (reads AQIReadings table)
         b. Fetches current recommendation (calls rules engine internally)
         c. Creates alert record in AlertsDecisions table
         d. Publishes "alert.created" event to EventBridge
         e. Returns { alertId, status: "sent", timestamp }

4. Frontend shows confirmation + "Record your decision" prompt

5. Admin selects "Cancelled outdoor PT, moved to indoor activities"
   └─ PATCH /alerts/{alertId}/decision
      Body: { decision: "Cancelled outdoor PT..." }
      └─ Alert Lambda:
         a. Updates record in AlertsDecisions table
         b. Publishes "alert.decision.recorded" event
         e. Returns { alertId, decision, decisionTimestamp }

6. Admin views history
   └─ GET /alerts?campus=dtu-delhi
      └─ Returns sorted list with full audit trail
```

### 4. AI Explanation Flow (Phase 5)

```
Admin clicks "Explain in plain language" on recommendation card
  → Frontend calls POST /api/v1/explain
    Body: {
      aqi: 312,
      status: "Severe",
      pollutant: "PM2.5",
      action: "Avoid outdoor activities...",
      rule: "CPCB AQI > 300",
      source: "CPCB",
      timestamp: "..."
    }
  → AI Explain Lambda:
    a. Injects evidence into constrained prompt template
    b. Calls Bedrock InvokeModel
    c. Validates output (no medical claims, no invented data)
    d. If valid → return explanation
    e. If invalid → return fallback deterministic text
  → Frontend shows explanation with "AI-generated" badge
```

---

## Repository Structure

```
breathesafe-campus/
├── frontend/                   # Next.js application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── next.config.js
│
├── backend/
│   ├── services/
│   │   ├── aqi-data/           # Microservice 1
│   │   │   ├── src/
│   │   │   ├── fixtures/
│   │   │   └── package.json
│   │   ├── recommendation/     # Microservice 2
│   │   │   ├── src/
│   │   │   └── package.json
│   │   ├── alerts/             # Microservice 3
│   │   │   ├── src/
│   │   │   └── package.json
│   │   └── ai-explain/         # Microservice 4 (Phase 5)
│   │       ├── src/
│   │       └── package.json
│   └── shared/                 # Shared types, utils, constants
│       ├── types.ts            # TypeScript interfaces used by all services
│       ├── aqi-categories.ts   # CPCB threshold definitions
│       └── package.json
│
├── infrastructure/
│   ├── template.yaml           # Root SAM template
│   ├── stacks/                 # Per-service CloudFormation
│   └── samconfig.toml
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DEMO-SCRIPT.md
│
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
│
├── .env.example                # Template (never commit real values)
├── README.md
└── package.json                # Root workspace config
```

---

## Scalability Path

| Dimension | MVP (Hackathon) | Scale (Post-Hackathon) |
|---|---|---|
| **Campuses** | 1 (DTU Delhi) | Multi-campus via `campus` partition key in DynamoDB |
| **Data sources** | 1 provider (CPCB/OpenAQ) | Provider abstraction layer — add new sources without touching the engine |
| **Rules** | Stored in DynamoDB, seeded once | Admin UI to create/edit rules per campus |
| **Users** | No auth | Amazon Cognito for admin auth, role-based access |
| **Notifications** | In-app only | SNS (SMS/email), SES, or push notifications |
| **AI** | None (Phase 5: Bedrock) | SageMaker forecasting, multi-language explanations |
| **Compute** | Lambda (auto-scales to 0) | Already scales — Lambda handles 1 or 10,000 requests identically |
| **Data** | DynamoDB on-demand | Already scales — on-demand capacity adjusts automatically |
| **Frontend** | Single deployment | Multi-tenant with campus selector, Cognito-gated admin views |

The microservice architecture means each of these dimensions scales independently. Adding a new campus doesn't touch the AI service. Adding Bedrock doesn't touch the alert service. Adding SNS notifications only requires the Alert service to publish an event — the new Notification service subscribes to it.

---

## Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://xxxxxx.execute-api.ap-south-1.amazonaws.com/prod
NEXT_PUBLIC_DEFAULT_CAMPUS=dtu-delhi

# Backend (SSM Parameter Store — NOT in code)
/breathesafe/aqi/data-mode          # "live" or "demo"
/breathesafe/aqi/provider           # "cpcb" or "openaq"
/breathesafe/aqi/api-key            # API key (if required)
/breathesafe/aqi/stale-threshold    # Minutes before data is marked stale
/breathesafe/bedrock/model-id       # Bedrock model ARN (Phase 5)
```

---

## Quick Reference: What Talks to What

```
Frontend ──REST──▶ API Gateway ──route──▶ Lambda (per service)
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                               DynamoDB   EventBridge  Bedrock
                              (per-service   (async    (Phase 5
                                table)     events)     only)
                                    │
                                    ▼
                               CloudWatch
                              (all services)
```

No service calls another service's Lambda directly. All inter-service communication goes through EventBridge events or shared DynamoDB reads (read-only, across table boundaries only where documented above).
