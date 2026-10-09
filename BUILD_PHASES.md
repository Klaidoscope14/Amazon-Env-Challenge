# BreatheSafe Campus — Phased Build Plan

Each phase produces something **demoable**. If time runs out after any phase, you still have a working product to submit.

---

## Phase 1: AWS Backend Skeleton
**Goal:** API endpoints running on real AWS infrastructure.  
**Estimated time:** ~3 hours  
**Demoable after this?** Yes (via curl/Postman — not pretty, but proves AWS works)

### Tasks
1. **Set up AWS infrastructure**
   - Create DynamoDB tables: `AQISnapshots`, `AlertsDecisions`
   - Create 3 Lambda functions: `fetchAQI`, `getRecommendation`, `alertsCRUD`
   - Create API Gateway REST API with routes wired to Lambdas
   - Set up CloudWatch logging (automatic with Lambda)
   - Configure IAM roles with least-privilege

2. **Implement `fetchAQI` Lambda**
   - Call CPCB/OpenAQ API for Delhi AQI data
   - Validate response: check for required fields (AQI, pollutant, timestamp)
   - Handle missing/malformed data gracefully
   - Write validated snapshot to DynamoDB `AQISnapshots` table
   - Support `DATA_MODE=demo` env var → return labelled demo fixtures instead
   - Return: `{ aqi, dominantPollutant, source, timestamp, staleAfterMinutes, dataMode }`

3. **Implement `getRecommendation` Lambda**
   - Read latest snapshot from DynamoDB
   - Apply CPCB threshold rules (6 categories: Good → Hazardous)
   - Return: `{ status, action, evidence, rule, disclaimer, dataQuality }`
   - Handle stale data (>2 hrs) → return warning + last known reading
   - Handle no data → return "Data unavailable" status

4. **Implement `alertsCRUD` Lambda**
   - `POST /alerts` → create alert record in DynamoDB
   - `GET /alerts` → return alert history sorted by time
   - `PATCH /alerts/{id}/decision` → update record with admin's decision
   - Each alert record stores: `{ id, timestamp, aqiAtTime, recommendation, audience, message, status, decision, adminName }`

5. **Verify end-to-end**
   - Hit each endpoint via curl
   - Confirm DynamoDB records are written and readable
   - Confirm CloudWatch logs capture each invocation

### Deliverable
Four working API endpoints on AWS. Data flows from source → Lambda → DynamoDB → API response. CloudWatch logs every call.

---

## Phase 2: Frontend — Dashboard + Recommendation
**Goal:** A user can open a web page and see AQI status + recommendation.  
**Estimated time:** ~3 hours  
**Demoable after this?** Yes — a working dashboard showing real/demo AQI with explanations

### Tasks
1. **Project scaffolding**
   - Initialize Next.js or React app
   - Set up API client to call the API Gateway endpoints
   - Environment config for API URL

2. **Dashboard page (the hero)**
   - Campus header: "DTU Delhi" with location
   - AQI hero card:
     - Large AQI number with color-coded status badge
     - Dominant pollutant name
     - Source name (e.g., "CPCB Delhi — ITO Station")
     - "Last updated: X minutes ago" with freshness indicator
   - Data mode badge: "Live" / "Cached" / "Demo data — not a live reading"
   - Recommendation card below:
     - Action headline: "Review outdoor activities"
     - "See why" expandable section with: rule, threshold, pollutant value, source, timestamp
     - Disclaimer footer: "Decision support, not medical advice"
   - Stale/error states:
     - Data >2 hours old → amber warning banner
     - No data → "Data unavailable" card with link to CPCB
   - "Issue Alert" button → links to Phase 3

3. **Styling and responsiveness**
   - Clean, high-contrast design
   - Status colors with text labels (don't rely on color alone)
   - Mobile-responsive layout
   - Avoid decorative charts — prioritize readability

### Deliverable
A web page that loads, fetches AQI from the API, shows status + recommendation with full evidence, handles errors gracefully.

---

## Phase 3: Alert Creation + Decision Log
**Goal:** Complete the See → Act → Record workflow end-to-end.  
**Estimated time:** ~2.5 hours  
**Demoable after this?** Yes — the FULL core workflow works. This is the minimum shippable product.

### Tasks
1. **Alert creation flow**
   - "Issue Alert" button on dashboard opens alert form
   - Audience selector: All / Students / Staff / Parents
   - Pre-filled message based on current recommendation (editable)
   - Current AQI context shown alongside the form
   - "Send Alert" button → POST to `/alerts` → show confirmation
   - Alert badge on dashboard: "Alert active: [summary]"

2. **Decision recording**
   - After sending (or declining to send), prompt: "Record your decision"
   - Quick-select options: "Moved activities indoors", "Cancelled outdoor events", "Sent advisory — monitoring", "No action needed", Custom text
   - PATCH to `/alerts/{id}/decision` → confirm saved

3. **Alert & Decision History page**
   - Chronological list of all alerts
   - Each row shows: timestamp, AQI at the time, recommendation given, alert sent (yes/no), audience, decision recorded
   - Expandable detail: full message text, evidence snapshot, admin name
   - Empty state: "No alerts issued yet"

4. **Student/staff view**
   - Simple read-only view of latest active alert
   - Shows: alert message, AQI status, time issued
   - "Issued by [admin]" attribution

### Deliverable
The complete workflow: Admin sees AQI → reads recommendation → issues alert → records decision → decision appears in history. This is the product's core value.

---

## Phase 4: Transparency, About Page + Polish
**Goal:** Build trust, handle edge cases, polish for demo recording.  
**Estimated time:** ~2 hours  
**Demoable after this?** Yes — this is the ideal submission state.

### Tasks
1. **About & Transparency page**
   - "How BreatheSafe Campus works" explainer
   - Rule table: AQI range → Status → Recommended action
   - Data source details: CPCB, update frequency, coverage area
   - Limitations section:
     - Not medical advice
     - Station-level data, not street-level
     - Does not replace official government advisories
     - Does not measure indoor air quality
   - Link to official CPCB website
   - Privacy: "We do not collect student health data"

2. **Error state polish**
   - Test and polish: API timeout, CPCB down, DynamoDB error
   - Consistent error UI across all pages
   - Demo mode toggle works cleanly with `DATA_MODE` env var

3. **UI polish**
   - Navigation between Dashboard ↔ Alerts ↔ About
   - Loading states (skeleton screens, not blank)
   - Consistent typography and spacing
   - Favicon and page titles
   - Keyboard navigation for core flows

4. **Demo rehearsal**
   - Run through the full scenario twice
   - Test with demo fixtures (in case live API fails during recording)
   - Verify AWS Console shows real Lambda invocations, DynamoDB records, CloudWatch logs
   - Time the scenario — must fit in 3 minutes

### Deliverable
A polished, trustworthy product ready for demo recording. All edge cases handled. The "About" page preemptively answers judge skepticism.

---

## Phase 5: Stretch Goals (Only If Phases 1–4 Are Solid)
**Goal:** Extra credit. Do NOT start these until the demo video is recorded with Phases 1–4.  
**Estimated time:** Variable

### 5A. Amazon Bedrock Plain-Language Explanation (~2 hours)
- Add a "Explain in plain language" button on the recommendation
- Lambda calls Bedrock (Claude or Titan) with structured evidence as input
- Constrained prompt: "Explain this AQI reading and recommendation in 2 sentences for a school administrator. Do not invent data, cite sources, or give medical advice."
- Display the generated text with a "Generated by AI" badge
- Retain the deterministic recommendation as source of truth
- This adds a second meaningful AWS service to the architecture

### 5B. Auto-Refresh with EventBridge (~1 hour)
- EventBridge rule triggers `fetchAQI` Lambda every 30 minutes
- Dashboard shows "Auto-refreshing" indicator
- Removes the need for manual refresh
- Adds a third AWS service

### 5C. Recent Trend Sparkline (~1.5 hours)
- Store last 24 hours of readings in DynamoDB (already partially done)
- Small sparkline chart on dashboard showing AQI over time
- No forecast — just observed history
- Label: "Last 24 hours (where data was available)"

### 5D. Campus Zone View (~2 hours)
- List of 3–4 named zones (Main Gate, Sports Ground, Library, Hostel Block)
- If real station data available for nearby stations → show with source
- If not → label as "Estimated" or "Demo data"
- No map (adds complexity without adding trust)

### 5E. SNS Notification (~1.5 hours)
- Wire up Amazon SNS to send an actual email/SMS when an alert is issued
- Only attempt if SNS sandbox setup is quick
- Demo with a verified email address
- Label in UI: "Email sent" vs "In-app only"

---

## Phase Summary

| Phase | What you get | AWS services active | Minimum viable? |
|---|---|---|---|
| **Phase 1** | Working API on AWS | Lambda, API Gateway, DynamoDB, CloudWatch | Technically yes (API-only) |
| **Phase 2** | Visible dashboard | + Amplify/S3+CloudFront | Almost (no action workflow) |
| **Phase 3** | Complete See → Act → Record workflow | Same | **YES — submit here if out of time** |
| **Phase 4** | Polished, trustworthy, demo-ready | Same | **Ideal submission state** |
| **Phase 5** | Stretch — extra AWS services, AI, trends | + Bedrock, EventBridge, SNS | Bonus points |

---

## Decision Rule

> **Record the demo video as soon as Phase 4 is done.** Then — and only then — start Phase 5. A recorded demo of a working Phase 4 product beats an unrecorded demo of a half-broken Phase 5 product every time.
