import type { Metadata } from "next";
import RulesTable from "@/components/RulesTable";

export const metadata: Metadata = {
  title: "How it works",
  description: "How BreatheSafe turns air-quality data into decisions you can act on: rules, AI guardrails, data sources, limitations and privacy.",
};

const AWS_SERVICES: { name: string; role: string }[] = [
  { name: "Amazon API Gateway", role: "REST API with a Cognito authorizer on write routes and request throttling" },
  { name: "AWS Lambda", role: "Seven functions: AQI and areas, recommendations, rules and plans, explanations, trends, alerts and decisions, notices, and sign-in" },
  { name: "Amazon DynamoDB", role: "AQI readings, the alert/decision audit trail (deletion-protected, point-in-time recovery) and the RulesConfig table of recommendation bands" },
  { name: "Amazon EventBridge", role: "A domain-event bus (reading received, category crossed, alert created, decision recorded) with a 30-day replayable archive" },
  { name: "Amazon Cognito", role: "Sign-up and sign-in for people who share alerts" },
  { name: "Amazon SNS", role: "Email delivery of shared alerts, and operational alarm emails" },
  { name: "Amazon Polly", role: "Spoken English and Hindi versions of each notice" },
  { name: "AWS Systems Manager Parameter Store", role: "Encrypted storage of the Google Air Quality and Gemini API keys" },
  { name: "Amazon CloudWatch & AWS X-Ray", role: "Logs, the event log, alarms and request tracing" },
  { name: "Amazon S3 & Amazon CloudFront", role: "Host this website over HTTPS with security headers, and route its /api calls to API Gateway" },
  { name: "AWS SAM / CloudFormation", role: "The whole stack is defined as infrastructure as code" },
];

export default function AboutPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">How BreatheSafe works</h1>
        <p className="text-sm text-muted mt-1">
          See → Act → Record: from the air-quality reading where you are, to what you and the people
          around you do about it, with a record of it.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">The recommendation engine</h2>
        <p className="text-sm text-muted-strong">
          Recommendations come from a <strong>deterministic, rule-based engine</strong> using India&apos;s
          National Air Quality Index categories (CPCB) — not machine learning. Every recommendation shows
          the AQI value, the pollutant, the rule that fired and the time of the reading.
        </p>
        <RulesTable />
        <p className="text-sm text-muted-strong">
          The bands and actions live in a DynamoDB <strong>RulesConfig</strong> table, so the advice can be
          updated without a redeploy. Every change is validated — the six CPCB categories, in order, with
          no gaps — and if the stored rules are ever invalid, the engine falls back to the built-in ones.
        </p>
        <p className="text-sm text-muted-strong">
          Alert notices are drafted from reviewed English and Hindi templates for each category. An AI
          model (Google Gemini) may rephrase a draft for readability; drafts that change any number or
          drop the location are discarded and the template is used. You review every notice before it
          is shared.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">&ldquo;Explain in plain language&rdquo; and its guardrails</h2>
        <p className="text-sm text-muted-strong">
          The explanation is written from evidence the server builds from the reading on your screen —
          the AQI, category, main pollutant, source, time and recommended action. Nothing you type is
          sent to the AI model. Before an AI explanation is shown, it must pass automatic checks:
        </p>
        <ul className="text-sm text-muted-strong space-y-1.5 list-disc list-inside">
          <li>every number in it appears in the evidence, and the AQI value is stated;</li>
          <li>it names the category (and, in English, the place);</li>
          <li>no medical advice, treatments, medicines or promises that anyone is safe;</li>
          <li>no links or formatting, at most five sentences, and the requested language.</li>
        </ul>
        <p className="text-sm text-muted-strong">
          If any check fails, or the AI is unavailable, you get a fixed, reviewed explanation instead,
          and the page says so.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Data sources</h2>
        <ul className="text-sm text-muted-strong space-y-2 list-disc list-inside">
          <li>
            <strong>Google Air Quality API</strong> — real-time, hourly air quality for the area around
            your location, anywhere in India, reported on India&apos;s National Air Quality Index (the
            CPCB scale), with the dominant pollutant and pollutant concentrations. The trend chart uses
            its hourly history.
          </li>
          <li>
            Readings are refreshed at most every 30 minutes per area. If the source is briefly unavailable, the last reading from the past 3 hours is
            shown, labelled <em>Cached</em>; older data is never shown as current.
          </li>
          <li>
            <strong>Demo mode</strong> uses clearly labelled sample values (&ldquo;Demo data — not a
            live reading&rdquo;) for rehearsals and presentations.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">Limitations</h2>
        <ul className="text-sm text-amber-900 dark:text-amber-200 space-y-2 list-disc list-inside">
          <li>
            <strong>Not medical advice.</strong> This is decision support; it does not diagnose
            conditions or guarantee safety.
          </li>
          <li>
            <strong>Area-level, not street-level.</strong> Readings describe an area of roughly 10 km and may differ from conditions at a specific spot or from other apps.
          </li>
          <li>
            <strong>Outdoor air only.</strong> Outdoor AQI does not directly indicate indoor conditions.
          </li>
          <li>
            <strong>Does not replace official advisories.</strong> Always check{" "}
            <a href="https://cpcb.nic.in" target="_blank" rel="noopener noreferrer" className="underline font-medium">
              CPCB
            </a>{" "}
            and local health-authority guidance.
          </li>
          <li>
            <strong>No forecasting.</strong> Only current and recent data is shown.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Privacy</h2>
        <ul className="text-sm text-muted-strong space-y-2 list-disc list-inside">
          <li>
            <strong>Location:</strong> with your permission, your browser&apos;s location is rounded to
            about 1&nbsp;km and used once to find your area. Coordinates are not stored or logged; only
            the chosen area is remembered in your browser. You can pick an area manually instead.
          </li>
          <li>
            <strong>Accounts:</strong> you only need an account to share alerts. It holds your email and
            name (Amazon Cognito); alerts and decisions record your name so people know who shared them.
          </li>
          <li>
            <strong>No health data:</strong> we do not collect health information. Stored data is
            air-quality readings, shared alerts and the decisions recorded with them.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Built on AWS</h2>
        <ul className="text-sm text-muted-strong space-y-1.5">
          {AWS_SERVICES.map((service) => (
            <li key={service.name}>
              <strong>{service.name}</strong> — {service.role}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted text-center pb-4">
        BreatheSafe — built by team Waterpark Enthusiasts for the WeMakeDevs × AWS Environmental Hacks
        (Air track).
      </p>
    </div>
  );
}
