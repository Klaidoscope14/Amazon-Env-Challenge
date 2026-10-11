import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test("see the AQI, check a plan, share on WhatsApp, sign in, publish an alert and record a decision", async ({ page }) => {
  const api = await mockApi(page);

  // See: the dashboard shows the area's reading and recommendation.
  await page.goto("/");
  await expect(page.getByText("268").first()).toBeVisible();
  await expect(page.getByText(/Avoid prolonged outdoor activity/).first()).toBeVisible();

  // My plans today: a run in Poor air gets "Avoid".
  await page.getByLabel("Activity").selectOption("run");
  await page.getByRole("button", { name: "Add plan" }).click();
  await expect(page.getByText("Work out indoors or reschedule.")).toBeVisible();
  await expect(page.getByText("Avoid", { exact: true })).toBeVisible();

  // Without an account: one tap forwards the Hindi + English advice to WhatsApp.
  const whatsApp = page.getByRole("link", { name: "Send to family on WhatsApp" });
  await expect(whatsApp).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  const shared = decodeURIComponent((await whatsApp.getAttribute("href"))!.split("text=")[1]);
  expect(shared).toMatch(/^प्रिय परिवारजनों/);
  expect(shared).toContain("Dear family");
  expect(shared).toContain("/notice?area=city-delhi");

  // Sign in from the recommendation card and come back to the dashboard.
  await page.getByRole("link", { name: "Sign in to post an alert for your area" }).click();
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/$/);
  // SRP: Cognito got a proof, never the password.
  expect(api.srpProofReceived).toBe(true);
  expect(api.srpPasswordSent).toBe(false);

  // Act: publish a bilingual alert for the family.
  await page.getByRole("button", { name: "Post an alert for your area" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Message (English)")).toHaveValue(/Dear family/);
  await dialog.getByRole("button", { name: "Post alert" }).click();
  await expect(page.getByText("Posted on your area's notice page")).toBeVisible();

  expect(api.createdAlert?.body).toMatchObject({ campus: "city-delhi", audience: "family" });
  expect(api.createdAlert?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

  // Record: log what was decided.
  await page.getByRole("button", { name: "Moved plans indoors" }).click();
  await expect(page.getByText("Decision recorded")).toBeVisible();
  expect(api.decision).toMatchObject({ decision: "Moved plans indoors" });

  // Notices: an old /alerts link lands on the merged page, with the alert as the latest one.
  await page.goto("/alerts?area=city-delhi");
  await expect(page).toHaveURL(/\/notice\?area=city-delhi$/);
  await expect(page.getByText("Latest alert")).toBeVisible();
  await expect(page.getByText(/Dear family/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Notices" })).toBeVisible();
});
