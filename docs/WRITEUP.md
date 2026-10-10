# BreatheSafe Campus — Submission writeup

**Track:** Air · **Team:** _add names_ · **Repo:** _add public GitHub URL_ · **Demo video:** _add YouTube link_

## The problem

Every autumn, AQI across north India climbs into the Poor–Severe range. School and college
administrators can look up a number, but the number doesn't answer their real questions: *Should we
cancel the outdoor assembly? How do we tell 2,000 parents quickly, in a language they read? If a parent
asks later, can we show why we decided what we did?* The gap isn't data — it's the step from data to a
recorded, communicated decision.

## What we built

BreatheSafe Campus is an air-quality **decision workflow** — **See → Act → Record**:

- **See** — the AQI for the administrator's own location anywhere in India (browser location rounded to
  ~1 km, never stored), computed with CPCB's method, with a deterministic, explainable recommendation:
  the rule, value, pollutant, source and time behind it.
- **Act** — a bilingual (English + Hindi) alert drafted from reviewed templates, sent as an in-app
  public notice, an email, a WhatsApp share and a spoken PA announcement.
- **Record** — the administrator logs the decision taken; each alert stores a snapshot of the exact
  reading it was based on, and decisions can't be overwritten.

Data is labelled honestly throughout: live, cached (≤3 h), stale, unavailable, or demo — never a stale
or sample value presented as current.

## Where AWS fits

The whole backend is serverless on AWS, defined as code with AWS SAM:

- **API Gateway** — REST API with a **Cognito** authorizer on write routes and request throttling.
- **Lambda** (7 functions, Node.js 22) — AQI and areas, recommendations, trends, alerts and decisions,
  notices, sign-in, and a scheduled CPCB refresh.
- **DynamoDB** — readings and the alert/decision audit trail (deletion protection, point-in-time recovery).
- **SNS** — alert emails and operational alarm emails. **Polly** — English/Hindi audio notices.
- **EventBridge** — scheduled CPCB station refresh. **SSM Parameter Store** — encrypted API keys.
- **CloudWatch + X-Ray** — logs, six alarms and tracing.

Air-quality data comes from CPCB stations (data.gov.in) when a nearby station has reported recently,
otherwise from Open-Meteo's air-quality data for the user's area.

## AI tools used

- **Claude Code (Anthropic)** — development assistant: codebase/infrastructure audits, implementation,
  and unit tests.
- **Google Gemini API** (free tier) — at runtime, optionally rephrases notice drafts. A faithfulness check
  rejects any draft that changes a number or drops the location; the reviewed template is the fallback.
- _Add any other AI tools the team used._

## Limitations

Decision support, not medical advice; area-level rather than street-level readings; no forecasting.
CPCB's public feed has been unavailable since 7 October 2026, so the live demo uses the Open-Meteo path.
