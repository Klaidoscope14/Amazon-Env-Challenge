# Draft — AWS Builder Center blog

**Title:** From AQI number to campus decision: building BreatheSafe Campus on AWS serverless

_(Draft for the team to edit. Keep the final post in your own voice; add screenshots of the dashboard,
the alert form, the public notice page and the AWS console.)_

## The problem

Every October, schools across north India wake up to "Poor" or "Severe" air. An administrator can
open any app and see a number — but then what? Cancel the assembly? Tell 2,000 parents, many of whom
prefer Hindi? And if someone asks a week later why outdoor sports were cancelled, where is the record?

We built **BreatheSafe Campus** around that gap: **See → Act → Record**.

## What it does

- **See**: AQI for your location anywhere in India, with a rule-based recommendation that shows its
  evidence (value, pollutant, CPCB category, source, time).
- **Act**: issue a bilingual alert — public notice page, email, WhatsApp share, and a spoken PA
  announcement generated with Amazon Polly.
- **Record**: log the decision taken; every alert snapshots the reading it was based on.

## The stack

_Insert the architecture diagram from the README._

- **API Gateway + 7 Lambda functions** (Node.js 22 on Graviton/arm64), all defined in one **AWS SAM** template.
- **DynamoDB** for readings and an append-only decision log (conditional writes stop overwrites).
- **Cognito** for administrator sign-in, enforced by an API Gateway authorizer — the name on an alert
  comes from the verified token, not the request.
- **SNS** for email delivery, **Polly** for English/Hindi audio, **EventBridge** for scheduled data refresh,
  **SSM Parameter Store** for keys, **CloudWatch + X-Ray** for alarms and tracing.

## Challenges (and what we learned)

1. **Our primary data source went down mid-hackathon.** CPCB's public feed on data.gov.in started
   refusing connections — from our laptops, from AWS Mumbai, from everywhere. Because the data layer
   was built around "areas" with a source-selection step, we added Open-Meteo as a fallback: we fetch
   hourly pollutant concentrations and compute the Indian AQI ourselves with CPCB's breakpoints and
   averaging windows. CPCB data is used automatically again whenever a nearby station is current.
2. **Honest data beats impressive data.** We made "unavailable" a first-class state: if no source
   responds, the app shows the last reading from the past 3 hours labelled *Cached*, or says data is
   unavailable — it never presents stale or sample values as live.
3. **Using AI without letting it make things up.** Notices start from reviewed English and Hindi
   templates. An LLM may rephrase them, but a guard rejects any draft that changes a number, drops the
   location or isn't in Devanagari — then the template is used.
4. **Small bugs, big consequences.** Our audit found that fractional AQI values fell between category
   bands and defaulted to "Severe". We rewrote the rules engine to match bands by upper bound and added
   unit tests for every boundary.
5. **Working within the AWS Free plan.** Some services weren't available on our account, so we chose
   services that were (Polly, SNS, DynamoDB on-demand) and capped cost with throttling, caching and a
   budget alert.

## What's next

Hosting the frontend on AWS, SMS/push delivery, multi-campus administration, and — once validated —
short-term forecasts.

_Links: GitHub repo · demo video · live demo_
