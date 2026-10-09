# BreatheSafe Campus — Refined PRD v2

**Hackathon:** WeMakeDevs × AWS Environmental Hacks (Bharat Builds Tour)  
**Track:** Air  
**Date:** October 10, 2026  
**Status:** Hackathon MVP — scope-locked for Oct 8–11 build window

---

## 1. One-Line Pitch

> From AQI reading to campus action in under a minute — an explainable, auditable air-quality decision engine for school and college administrators.

---

## 2. Problem Statement

Every October–November, schools and colleges across Delhi-NCR face the same crisis: AQI spikes from stubble burning, vehicular pollution, and weather inversions. Administrators check AQI numbers online, but those numbers don't answer the questions they actually have:

- Should we cancel the outdoor assembly today?
- At what point do we send students home early?
- How do I notify 2,000 parents in 10 minutes?
- If a parent complains, can I show them why I made the call?

**The gap is not data. It's the bridge from data to action.** Every AQI dashboard shows you a number. None of them tell an administrator what to do, help them do it, or record that they did it.

BreatheSafe Campus closes that gap with a three-step workflow: **See → Act → Record.**

---

## 3. Target Users

| User | What they need |
|---|---|
| **Campus Administrator** (primary) | Quick status overview → evidence-backed recommendation → issue alert → log the decision taken |
| **Student / Staff** (secondary) | See the latest campus alert and understand it in plain language |
| **Hackathon Judge** (demo audience) | Understand the problem, see the workflow run end-to-end, see AWS doing real work |

---

## 4. Core User Stories

### Administrator
1. I open the dashboard and see a clear status (Good / Moderate / Poor / Severe) with the AQI number, pollutant, source, and timestamp — in under 3 seconds.
2. I see a recommendation ("Review outdoor activities") with the evidence and rule that produced it, so I can trust it.
3. I draft and issue an in-app alert to a defined audience (students, staff, parents) and see it marked as sent.
4. I record my decision ("Moved assembly indoors", "No action needed") for accountability.
5. I see the full alert + decision history so I can show it to anyone who asks.
6. When data is stale or unavailable, I see that clearly — not a stale number pretending to be live.

### Student / Staff
1. I see the current campus status and the latest alert in plain language.
2. I know whether what I'm looking at is a live reading, a cached value, or demo data.

---

## 5. Judging Criteria Alignment

| Criterion | How we score |
|---|---|
| **Idea & Impact** | Solves a real, seasonal, emotionally resonant problem (school safety during Delhi pollution season). Not another dashboard — it's a decision workflow. |
| **Built on AWS** | Lambda + API Gateway + DynamoDB + CloudWatch doing real work. Visible in the demo video via console footage. |
| **Design & Usability** | Glanceable status, one-click alert, plain-language recommendations. A non-technical administrator can use it without training. |
| **Execution** | One complete workflow that runs: See → Act → Record. No half-built features. |
| **Demo Video** | 3-minute recorded walkthrough showing the full scenario with real/labelled data. |

---

## 6. MVP Features (Scope-Locked)

### 6.1 Campus Dashboard
- One campus: DTU Delhi (or configurable).
- Hero card: AQI value, dominant pollutant, status badge (Good / Moderate / Poor / Severe / Hazardous), source name, last-updated timestamp.
- Staleness indicator: "Live", "Cached (X min ago)", or "Data unavailable — last reading at [time]".
- Data source badge: "Measured", "Cached", or "Demo data — not a live reading".
- Below the hero: the current recommendation with a one-line summary and a "See why" expand.

### 6.2 Recommendation Engine
- **Deterministic, rule-based.** No ML. No unvalidated forecasts.
- Thresholds based on India's National AQI categories (CPCB standard):
  - 0–50 Good → "No action needed"
  - 51–100 Moderate → "Sensitive groups: consider limiting prolonged outdoor exertion"
  - 101–200 Poor → "Review outdoor activities. Consider moving events indoors."
  - 201–300 Severe → "Avoid outdoor activities. Issue campus advisory."
  - 301–400 Very Severe → "Cancel outdoor activities. Notify all stakeholders."
  - 401–500 Hazardous → "Emergency protocol. Consider early dismissal."
- Every recommendation includes:
  - The AQI value and pollutant used
  - The threshold rule that triggered it
  - Source and timestamp
  - A data-quality note
  - Disclaimer: "This is decision support, not medical advice."
- If data is missing or stale (>2 hours old), the recommendation says so explicitly.

### 6.3 Alert & Decision Log
- **Create alert:** Admin selects audience (All, Students, Staff, Parents), writes/edits a pre-filled message based on the recommendation, and issues it.
- **In-app delivery only** for MVP. Alert appears on the student/staff view. No SMS/email.
- **Record decision:** After issuing (or choosing not to), the admin logs the action taken: "Moved indoors", "Cancelled event", "Monitored — no action", or custom text.
- **History view:** Chronological list of all alerts and decisions with timestamp, AQI at the time, recommendation given, alert sent (yes/no), decision recorded, and admin name.

### 6.4 Data Transparency & About
- "How this works" section: explains the rule-based engine, data source, update frequency, and limitations.
- Links to official CPCB guidance.
- Limitations stated: not medical advice, not street-level precise, not a replacement for official government alerts.
- Privacy: no student health data collected.

### 6.5 Error & Edge Case States
- External API down → show last cached reading with "Cached" badge and timestamp.
- No data at all → "Data unavailable" state with a prompt to check official sources.
- Stale data (>2 hours) → warning banner: "This reading is over 2 hours old. Check [CPCB link] for the latest."
- Demo mode → every data point shows "Demo data" badge. Cannot be mistaken for live.

---

## 7. Explicitly Out of Scope

- Zone-level maps or micro-location data (no reliable spatial data to back it).
- ML forecasting or trend prediction.
- Medical advice, health risk scores, or individual exposure estimates.
- SMS/email/push notification delivery.
- Role-based access control or authentication.
- Mobile app or wearable integration.
- Multi-campus support.
- Downloadable PDF reports.

---

## 8. Data Source Strategy

**Primary: CPCB Real-Time AQI**
- Source: Central Pollution Control Board, India.
- Coverage: Station-level AQI for Delhi (multiple stations).
- Data: AQI, PM2.5, PM10, NO2, SO2, CO, O3.
- Update frequency: Typically hourly.
- Access: Verify API availability. If no public API, scrape the published data with attribution, or use OpenAQ as a relay.

**Fallback: OpenAQ**
- Aggregates CPCB and other sources.
- REST API with documented access.
- May have slight delay from CPCB source.

**Demo Fixtures**
- Pre-built JSON snapshots for each AQI category (Good through Hazardous).
- Every fixture clearly labelled "Demo data".
- Used when: live API is down, or for demo rehearsal.
- Toggle: single environment variable `DATA_MODE=live|demo`.

---

## 9. AWS Architecture

```
                        ┌─────────────────────────┐
                        │   React / Next.js App    │
                        │  (Amplify Hosting / S3   │
                        │   + CloudFront)          │
                        └───────────┬─────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────┐
                        │    Amazon API Gateway    │
                        │   (REST API endpoints)   │
                        └───────────┬─────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌──────────┐    ┌──────────┐    ┌──────────┐
            │ Lambda:  │    │ Lambda:  │    │ Lambda:  │
            │ fetchAQI │    │ getReco  │    │ alerts   │
            │          │    │ mmend    │    │ CRUD     │
            └────┬─────┘    └────┬─────┘    └────┬─────┘
                 │               │               │
                 ▼               ▼               ▼
            ┌─────────────────────────────────────────┐
            │          Amazon DynamoDB                 │
            │                                         │
            │  Table: AQISnapshots                    │
            │    - Latest reading per station          │
            │    - Source, timestamp, pollutants       │
            │                                         │
            │  Table: AlertsDecisions                 │
            │    - Alert records + admin decisions     │
            │    - AQI context at time of alert        │
            └─────────────────────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │  Amazon CloudWatch   │
                    │  (Logs + Errors)     │
                    └─────────────────────┘
```

### Services and Their Real Jobs

| Service | What it actually does |
|---|---|
| **API Gateway** | Exposes 4 REST endpoints: `GET /aqi`, `GET /recommendation`, `POST /alerts`, `GET /alerts` |
| **Lambda (fetchAQI)** | Calls CPCB/OpenAQ, validates response, writes to DynamoDB, returns latest reading |
| **Lambda (getRecommendation)** | Reads latest AQI from DynamoDB, applies threshold rules, returns recommendation + evidence |
| **Lambda (alertsCRUD)** | Creates alert records, stores admin decisions, returns history |
| **DynamoDB** | Persistent storage for AQI snapshots and alert/decision log |
| **CloudWatch** | Logs every Lambda invocation, errors, and API latency |
| **Amplify / S3+CloudFront** | Hosts the frontend (pick one based on setup speed) |

### What we are NOT adding
- EventBridge (scheduled refresh is nice-to-have; manual refresh is fine for MVP)
- SNS/SES (no external notifications in MVP)
- Bedrock (Phase 5 stretch goal only)
- SageMaker (no ML in MVP)

---

## 10. API Endpoints

| Method | Path | Lambda | Description |
|---|---|---|---|
| `GET` | `/aqi?campus=dtu` | fetchAQI | Returns latest AQI reading with source, timestamp, staleness |
| `GET` | `/recommendation?campus=dtu` | getRecommendation | Returns status, action, evidence, rule, disclaimer |
| `POST` | `/alerts` | alertsCRUD | Creates a new alert record |
| `GET` | `/alerts?campus=dtu` | alertsCRUD | Returns alert + decision history |
| `PATCH` | `/alerts/{id}/decision` | alertsCRUD | Records admin's decision on an alert |

---

## 11. Frontend Pages

### Page 1: Dashboard (the hero page)
- Campus name and location
- AQI hero card: big number, status badge, pollutant, source, timestamp
- Data freshness indicator
- Recommendation card: action summary + "See evidence" expand
- "Issue Alert" button (opens alert flow)
- Link to alert history

### Page 2: Alerts & Decisions
- "New Alert" form: audience selector, pre-filled message from recommendation, edit + send
- Alert history table: time, AQI, recommendation, alert sent, decision, admin
- Each row expandable to see the full evidence snapshot

### Page 3: About & Transparency
- How the engine works (rules, thresholds, CPCB categories)
- Data source, update frequency, limitations
- "Not medical advice" disclaimer
- Link to CPCB official site
- Privacy statement

---

## 12. Demo Video Script (3 minutes)

| Time | Segment | What to show |
|---|---|---|
| 0:00–0:20 | **The problem** | "It's October in Delhi. The AQI just crossed 300. A school administrator is staring at a number — but what should they actually *do*?" |
| 0:20–0:50 | **The dashboard** | Open BreatheSafe Campus. Show the AQI reading, source (CPCB), timestamp, status badge (Severe). Point out the data freshness indicator. State clearly if this is live or demo data. |
| 0:50–1:20 | **The recommendation** | Expand the recommendation. Show: "Avoid outdoor activities. Issue campus advisory." Show the evidence: AQI 312, PM2.5 dominant, CPCB threshold rule, "Decision support — not medical advice." |
| 1:20–1:50 | **Issue an alert** | Click "Issue Alert". Show audience = All Students. Show the pre-filled message. Send. Show the alert marked as "Sent" with timestamp. |
| 1:50–2:15 | **Record the decision** | Admin records: "Cancelled outdoor PT, moved to indoor activities." Show the decision saved in the log. Show the history table with the complete audit trail. |
| 2:15–2:40 | **AWS under the hood** | Quick cut to AWS Console: show the Lambda function, the DynamoDB table with real records, CloudWatch logs. "Every reading, every recommendation, every decision is stored and logged on AWS." |
| 2:40–3:00 | **Impact & next steps** | "One campus today. Any campus tomorrow. The engine is the same: data in, action out, decision recorded. What's missing from every AQI dashboard is accountability — and that's what we built." |

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CPCB API unavailable or undocumented | Use OpenAQ as relay; have demo fixtures ready; label data source honestly |
| Looks like another AQI dashboard | The workflow IS the product. Dashboard is just the entry point. Demo leads with the alert + decision flow. |
| AWS feels cosmetic | Every API call hits Lambda → DynamoDB → CloudWatch. Show console footage in the video. |
| Scope creep kills execution | This PRD is scope-locked. Anything not in Section 6 does not get built until Phase 4+. |
| External API outage during recording | `DATA_MODE=demo` switch with labelled fixtures. Record the demo with this fallback ready. |
| Over-claiming accuracy or safety | Disclaimer on every recommendation. "Decision support, not medical advice." |

---

## 14. Submission Checklist

- [ ] Working deployed application OR reproducible local demo
- [ ] At least one AWS service doing real work (Lambda + DynamoDB minimum)
- [ ] Demo video uploaded to YouTube (public/unlisted), under 3 minutes
- [ ] Video shows: problem, product workflow, AWS integration
- [ ] Public GitHub repository
- [ ] Writeup: problem, build, AWS usage, AI tools used
- [ ] Source names, timestamps, data status visible in UI
- [ ] Measured vs. demo data clearly distinguished
- [ ] Complete See → Act → Record workflow working
- [ ] Error and stale-data states tested
- [ ] No credentials in source control
- [ ] README with setup, architecture, data sources, limitations
- [ ] Impact claims supported and not overstated

---

## 15. What Winning Looks Like

The judge watches the 3-minute video and thinks:

1. "Oh, this is a real problem — I've seen schools close for pollution in Delhi."
2. "They didn't just show me a number. They showed me what to DO with it."
3. "The alert and decision log is clever — accountability is the missing piece."
4. "AWS is actually doing the work, not just mentioned on a slide."
5. "They were honest about what's real data and what's demo. I trust this team."

That's the bar. Everything in this PRD exists to make those five thoughts happen.
