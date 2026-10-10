import type { Metadata } from "next";
import { STATUS_CONFIG } from "@/lib/constants";
import type { AQIStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "How it works",
  description: "How BreatheSafe Campus turns air-quality data into campus decisions: rules, data sources, limitations and privacy.",
};

// Mirrors the rules engine in backend/shared/src/aqi-categories.ts word for
// word, so this page describes exactly what the recommendation says.
const RULES: { range: string; status: AQIStatus; action: string }[] = [
  { range: "0–50", status: "Good", action: "No action needed. Air quality is satisfactory." },
  { range: "51–100", status: "Satisfactory", action: "Sensitive individuals: consider limiting prolonged outdoor exertion." },
  { range: "101–200", status: "Moderate", action: "Review outdoor activities. Consider moving prolonged events indoors." },
  { range: "201–300", status: "Poor", action: "Avoid prolonged outdoor activities. Issue campus advisory to all stakeholders." },
  { range: "301–400", status: "Very Poor", action: "Cancel all outdoor activities. Notify all stakeholders immediately. Consider early dismissal for sensitive groups." },
  { range: "401–500", status: "Severe", action: "Emergency protocol. Cancel all outdoor activities. Consider campus-wide early dismissal. Notify parents and guardians." },
];

const AWS_SERVICES: { name: string; role: string }[] = [
  { name: "Amazon API Gateway", role: "REST API with a Cognito authorizer on write routes and request throttling" },
  { name: "AWS Lambda", role: "Seven functions: AQI and areas, recommendations, trends, alerts and decisions, notices, sign-in, and the scheduled CPCB refresh" },
  { name: "Amazon DynamoDB", role: "AQI readings and the alert/decision audit trail (deletion-protected, point-in-time recovery)" },
  { name: "Amazon Cognito", role: "Administrator sign-up and sign-in" },
  { name: "Amazon SNS", role: "Email delivery of issued alerts, and operational alarm emails" },
  { name: "Amazon Polly", role: "Spoken English and Hindi versions of each notice (PA announcements)" },
  { name: "Amazon EventBridge", role: "Refreshes CPCB station data every 30 minutes" },
  { name: "AWS Systems Manager Parameter Store", role: "Encrypted storage of third-party API keys" },
  { name: "Amazon CloudWatch & AWS X-Ray", role: "Logs, alarms and request tracing" },
  { name: "AWS SAM / CloudFormation", role: "The whole stack is defined as infrastructure as code" },
];

export default function AboutPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">How BreatheSafe Campus Works</h1>
        <p className="text-sm text-muted mt-1">
          See → Act → Record: from an air-quality reading to a campus decision, with an audit trail.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">The recommendation engine</h2>
        <p className="text-sm text-muted-strong">
          Recommendations come from a <strong>deterministic, rule-based engine</strong> using India&apos;s
          National Air Quality Index categories (CPCB) — not machine learning. Every recommendation shows
          the AQI value, the pollutant, the rule that fired and the time of the reading.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left py-2 px-3 text-muted font-medium">AQI range</th>
                <th scope="col" className="text-left py-2 px-3 text-muted font-medium">Category</th>
                <th scope="col" className="text-left py-2 px-3 text-muted font-medium">Recommended action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RULES.map((rule) => (
                <tr key={rule.status}>
                  <td className="py-2 px-3 tabular-nums whitespace-nowrap">{rule.range}</td>
                  <td className="py-2 px-3">
                    <span className={`font-medium ${STATUS_CONFIG[rule.status].color}`}>{rule.status}</span>
                  </td>
                  <td className="py-2 px-3 text-foreground">{rule.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-strong">
          Alert notices are drafted from reviewed English and Hindi templates for each category. An AI
          model (Google Gemini) may rephrase a draft for readability; drafts that change any number or
          drop the location are discarded and the template is used. An administrator reviews every
          notice before it is sent.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Data sources</h2>
        <ul className="text-sm text-muted-strong space-y-2 list-disc list-inside">
          <li>
            <strong>CPCB monitoring stations</strong> (via data.gov.in) — used when a station near you
            has reported within the last 3 hours.
          </li>
          <li>
            <strong>Open-Meteo air-quality data</strong> (Copernicus CAMS) for your area otherwise, so
            every location in India has a reading. The Indian AQI is calculated with CPCB&apos;s method:
            24-hour averages for PM2.5, PM10, NO₂ and SO₂, 8-hour averages for O₃ and CO, and the
            highest pollutant sub-index.
          </li>
          <li>
            If the current source is briefly unavailable, the last reading from the past 3 hours is
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
            <strong>Not medical advice.</strong> This is decision support for administrators; it does
            not diagnose conditions or guarantee safety.
          </li>
          <li>
            <strong>Area-level, not street-level.</strong> Readings describe a station or an area of
            roughly 10 km and may differ from conditions at a specific spot or from other apps.
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
            <strong>Accounts:</strong> administrators sign in with an email and name (Amazon Cognito).
            Alerts and decisions record the signed-in administrator&apos;s name for accountability.
          </li>
          <li>
            <strong>No health data:</strong> we do not collect student health information. Stored data
            is air-quality readings, alerts and administrator decisions.
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
        BreatheSafe Campus — built for the WeMakeDevs × AWS Environmental Hacks (Air track).
      </p>
    </div>
  );
}
