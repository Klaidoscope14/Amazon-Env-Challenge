import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests run against a production build of the app with the API
 * mocked in the browser (see e2e/mock-api.ts) — including Cognito's SRP
 * sign-in — so they need no AWS account and never touch real data.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The app is a static export (out/), served like CloudFront serves it.
    command: `npx next build && npx serve out -l ${PORT} --no-request-logging`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_API_URL: "http://api.test",
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: "ap-south-1_E2eTestPool",
      NEXT_PUBLIC_COGNITO_CLIENT_ID: "e2etestclient",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
