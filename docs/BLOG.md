# Draft — AWS Builder Center blog

**Title:** From an AQI number to a decision you can share: building BreatheSafe on AWS serverless

**By team Waterpark Enthusiasts** — Chaitanya Saagar, Parul Garg, Nakshatra Kanchan, Divyansh Gupta

_(Draft for the team to edit. Keep the final post in your own voice; add screenshots of the dashboard,
the "Explain in plain language" panel, the alert form, the public notice page and the AWS console —
the EventBridge archive and the RulesConfig table make good ones.)_

## The problem

Every October, people across north India wake up to "Poor" or "Severe" air. Any app will show a
number — but then what? Is the evening walk a bad idea? Should the kids play outside? How do you warn
your parents, who prefer Hindi, or your society's WhatsApp group? And next week, what did you decide?

We built **BreatheSafe** around that gap: **See → Act → Record**.

## What it does

- **See**: AQI for your location anywhere in India, with a rule-based recommendation that shows its
  evidence (value, pollutant, CPCB category, source, time) and a one-tap plain-language explanation in
  English or Hindi.
- **Act**: share a bilingual alert with your family, neighbourhood or group — public notice page,
  email, WhatsApp share, and a spoken version generated with Amazon Polly.
- **Record**: note the decision you took; every alert snapshots the reading it was based on.

## The stack

_Insert the architecture diagram from the README._

- **API Gateway + 7 Lambda functions** (Node.js 22 on Graviton/arm64), all defined in one **AWS SAM** template.
- **DynamoDB** for readings, an append-only decision log, and a **RulesConfig** table that holds the
  recommendation rules as data.
- **EventBridge** as a domain-event bus: readings, category changes, alerts and decisions are published
  once; an archive keeps them for 30 days and a rule writes them to CloudWatch Logs.
- **Cognito** for sign-in, enforced by an API Gateway authorizer — the name on an alert comes from the
  verified token, not the request.
- **SNS** for email, **Polly** for English/Hindi audio, **SSM Parameter Store** for keys,
  **CloudWatch + X-Ray** for alarms and tracing. **Zod** validates every input, **Vitest** tests it,
  **GitHub Actions** checks every push.

## Challenges (and what we learned)

1. **Our first data source went down mid-hackathon.** CPCB's public feed on data.gov.in started
   refusing connections — from our laptops, from AWS Mumbai, from everywhere. Because the data layer
   was built around "areas" with a single source-selection step, we could swap the source without
   touching the rest of the app: BreatheSafe now uses the Google Air Quality API, which reports
   India's National AQI (the CPCB scale) for any location, with hourly history for trends. To keep
   costs down, each area is looked up at most every 30 minutes and recent readings are reused.
2. **Honest data beats impressive data.** "Unavailable" is a first-class state: if no source responds,
   the app shows the last reading from the past 3 hours labelled *Cached*, or says data is unavailable.
3. **Using AI without letting it make things up.** The explanation model only sees evidence our server
   builds, and its answer is shown only if guardrails confirm every number comes from that evidence,
   the category is right, and there is no medical advice or promise of safety. Otherwise you get the
   reviewed explanation — and the UI tells you.
4. **Rules as data, safely.** Moving the recommendation bands into DynamoDB means advice can change
   without a deploy — and also that a typo could break it. So every load is validated (six categories,
   in order, no gaps), and anything invalid falls back to the built-in rules.
5. **Working within the AWS Free plan.** We chose services that were available on our account
   (Polly, SNS, DynamoDB on-demand, EventBridge) and capped cost with throttling, caching, an AI rate
   limit and a budget alert.

## What's next

Push notifications when your area's category gets worse (a new consumer of `aqi.threshold.crossed`),
hosting the frontend on AWS, and — once validated — short-term forecasts.

_Links: GitHub repo · demo video · live demo_
