import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test("see the AQI, check a plan, sign in, share an alert and record a decision", async ({ page }) => {
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

  // Sign in from the recommendation card and come back to the dashboard.
  await page.getByRole("link", { name: "Sign in to share an alert" }).click();
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Act: share a bilingual alert with the family.
  await page.getByRole("button", { name: "Share an alert" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Message (English)")).toHaveValue(/Dear family/);
  await dialog.getByRole("button", { name: "Share alert" }).click();
  await expect(page.getByText("In-app notice published")).toBeVisible();

  expect(api.createdAlert?.body).toMatchObject({ campus: "city-delhi", audience: "family" });
  expect(api.createdAlert?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

  // Record: log what was decided.
  await page.getByRole("button", { name: "Moved plans indoors" }).click();
  await expect(page.getByText("Decision recorded")).toBeVisible();
  expect(api.decision).toMatchObject({ decision: "Moved plans indoors" });
});
