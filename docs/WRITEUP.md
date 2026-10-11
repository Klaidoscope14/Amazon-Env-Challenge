# VayuSaathi — Submission writeup

**Track:** Air · **Team:** Waterpark Enthusiasts — Chaitanya Saagar, Parul Garg, Nakshatra Kanchan, Divyansh Gupta
**Repo:** _add public GitHub URL_ · **Demo video:** _add YouTube link_

## The problem

Every autumn, AQI across north India climbs into the Poor–Severe range. Anyone can look up a number,
but the number doesn't answer the questions people actually have: *Is it OK to go for the evening
walk? Should the kids play outside? How do I tell my parents, who read Hindi, or my housing society's
WhatsApp group? And what did we decide last time?* The gap isn't data — it's the step from data to a
decision that is understood, shared and remembered.

## What we built

VayuSaathi is an air-quality **decision workflow for anyone in India** — **See → Act → Record**:

- **See** — the AQI where you are, anywhere in India (browser location rounded to ~1 km, never
  stored), on India's National AQI (CPCB scale), with a deterministic recommendation, the evidence behind it,
  and an **"Explain in plain language"** button in English or Hindi.
- **Act** — share a bilingual (English + Hindi) alert with your family, neighbourhood, team or
  everyone: a public notice page, an email, a WhatsApp message and a spoken version.
- **Record** — note what you decided; each alert stores a snapshot of the exact reading it was based
  on, and decisions can't be overwritten.

Data is labelled honestly throughout: live, cached (≤3 h), stale, unavailable, or demo — never a stale
or sample value presented as current.

## Where AWS fits

The whole backend is serverless on AWS, defined as code with AWS SAM:

- **API Gateway** — REST API with a **Cognito** authorizer on write routes and request throttling.
- **Lambda** (7 functions, Node.js 22) — AQI and areas, recommendations, rules and plans,
  explanations, trends, alerts and decisions, notices, and sign-in.
- **DynamoDB** — readings, the alert/decision audit trail (deletion protection, point-in-time
  recovery) and a **RulesConfig** table: the recommendation bands are data, validated on load, editable
  without a redeploy, with built-in rules as a safe fallback.
- **EventBridge** — a custom bus for domain events (reading received, category crossed, alert created,
  decision recorded) with a 30-day replayable archive and an event log.
- **SNS** — alert emails and operational alarm emails. **Polly** — English/Hindi audio notices.
- **SSM Parameter Store** — encrypted API keys. **CloudWatch + X-Ray** — logs, seven alarms, tracing.

Real-time air-quality data comes from the Google Air Quality API, which reports India's National AQI
(CPCB scale) for any location in India, plus hourly history for the trend chart.

## Responsible AI

AI is used in two places, and in both the deterministic output stays the source of truth:

- **Alert drafts** — Gemini may rephrase a reviewed template; a faithfulness check rejects any draft
  that changes a number, drops the location or isn't in Devanagari.
- **Explanations** — the server builds the evidence itself (no user text reaches the model), and the
  output must pass guardrails: every number must come from the evidence, the AQI and category must be
  stated, no medical advice or safety promises, no links, correct language and length. Otherwise a
  reviewed explanation is shown, and the UI says so. Calls are cached and rate-limited.

## Engineering quality

Zod validation on every API input and on third-party data; 130+ Vitest tests, including handler-level
tests with mocked AWS clients; GitHub Actions CI (typecheck, tests, lint, build, SAM validate + build).

## AI tools used

- **Claude Code (Anthropic)** — development assistant: codebase/infrastructure audits, implementation,
  and tests.
- **Google Gemini API** (free tier) — at runtime, optionally rephrases alert drafts and writes
  plain-language explanations, both behind automatic checks with reviewed text as the fallback.

## Limitations

Decision support, not medical advice; area-level rather than street-level readings; no forecasting.
Readings are hourly and area-level (about 10 km), so they can differ from a specific street or app.
