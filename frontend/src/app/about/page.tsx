export default function AboutPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          How BreatheSafe Campus Works
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Transparency, limitations, and data sources
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          The Recommendation Engine
        </h2>
        <p className="text-sm text-gray-700">
          BreatheSafe Campus uses a <strong>deterministic, rule-based engine</strong> — not machine learning.
          Every recommendation is traceable to a specific AQI value, a documented threshold, and a rule.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-gray-500 font-medium">AQI Range</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 px-3">0–50</td>
                <td className="py-2 px-3"><span className="text-green-700 font-medium">Good</span></td>
                <td className="py-2 px-3">No action needed</td>
              </tr>
              <tr>
                <td className="py-2 px-3">51–100</td>
                <td className="py-2 px-3"><span className="text-lime-700 font-medium">Satisfactory</span></td>
                <td className="py-2 px-3">Sensitive individuals: limit prolonged outdoor exertion</td>
              </tr>
              <tr>
                <td className="py-2 px-3">101–200</td>
                <td className="py-2 px-3"><span className="text-yellow-700 font-medium">Moderate</span></td>
                <td className="py-2 px-3">Review outdoor activities. Consider moving events indoors.</td>
              </tr>
              <tr>
                <td className="py-2 px-3">201–300</td>
                <td className="py-2 px-3"><span className="text-orange-700 font-medium">Poor</span></td>
                <td className="py-2 px-3">Avoid outdoor activities. Issue campus advisory.</td>
              </tr>
              <tr>
                <td className="py-2 px-3">301–400</td>
                <td className="py-2 px-3"><span className="text-red-700 font-medium">Very Poor</span></td>
                <td className="py-2 px-3">Cancel outdoor activities. Notify all stakeholders.</td>
              </tr>
              <tr>
                <td className="py-2 px-3">401–500</td>
                <td className="py-2 px-3"><span className="text-red-900 font-medium">Severe</span></td>
                <td className="py-2 px-3">Emergency protocol. Consider campus-wide early dismissal.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          Thresholds based on India&apos;s National AQI categories by the Central Pollution Control Board (CPCB).
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Data Source</h2>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <strong>Primary:</strong> Central Pollution Control Board (CPCB), India —
            station-level AQI readings for Delhi.
          </p>
          <p>
            <strong>Fallback:</strong> OpenAQ — aggregates CPCB and other sources with a possible slight delay.
          </p>
          <p>
            <strong>Update frequency:</strong> Typically hourly from CPCB. Our system fetches and caches the latest reading
            and marks it as stale if older than 2 hours.
          </p>
          <p>
            <strong>Demo mode:</strong> When running in demo mode, all data is clearly labelled
            &quot;Demo data — not a live reading.&quot; Demo fixtures are pre-built for each AQI category.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-amber-900">Limitations</h2>
        <ul className="text-sm text-amber-800 space-y-2 list-disc list-inside">
          <li>
            <strong>Not medical advice.</strong> This tool provides decision support for campus administrators.
            It does not diagnose health conditions or guarantee safety.
          </li>
          <li>
            <strong>Station-level data, not street-level.</strong> AQI readings come from monitoring stations
            and may not reflect exact conditions at every point on campus.
          </li>
          <li>
            <strong>Does not measure indoor air quality.</strong> Outdoor AQI does not directly indicate
            indoor conditions.
          </li>
          <li>
            <strong>Does not replace official government advisories.</strong> Always check{" "}
            <a
              href="https://cpcb.nic.in"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              CPCB
            </a>{" "}
            and local health authority guidance for official decisions.
          </li>
          <li>
            <strong>No forecasting.</strong> The MVP shows current/recent data only. No predictions are made.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Privacy</h2>
        <p className="text-sm text-gray-700">
          BreatheSafe Campus does not collect student health data, personal information, or location tracking.
          The only data stored is: AQI readings (from public sources), alert records, and administrator decisions.
          All data is campus-level, not individual-level.
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">AWS Architecture</h2>
        <p className="text-sm text-gray-700">
          This application runs on real AWS infrastructure:
        </p>
        <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
          <li><strong>Amazon API Gateway</strong> — REST API endpoints</li>
          <li><strong>AWS Lambda</strong> — Data fetching, recommendation engine, alert management</li>
          <li><strong>Amazon DynamoDB</strong> — AQI reading cache and alert/decision audit trail</li>
          <li><strong>Amazon CloudWatch</strong> — Logging and error monitoring</li>
        </ul>
        <p className="text-xs text-gray-500 mt-2">
          Every API call, data store operation, and recommendation is handled by these services in real time.
        </p>
      </section>

      <p className="text-xs text-gray-400 text-center pb-4">
        BreatheSafe Campus — Built for the WeMakeDevs × AWS Environmental Hacks hackathon.
      </p>
    </div>
  );
}
