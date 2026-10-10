import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./mock-api";

async function enterPassword(page: Page) {
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
}

test("sign in with SRP and two-step verification", async ({ page }) => {
  const api = await mockApi(page, { mfa: true });
  await page.goto("/login?redirect=/account");

  // A wrong code ends the attempt (Cognito challenges are single-use).
  await enterPassword(page);
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText(/That code is incorrect/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

  // Second attempt with the right code.
  await enterPassword(page);
  await page.getByLabel("Authentication code").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Asha Verma · asha@example.com")).toBeVisible();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  expect(api.mfaCode).toBe("123456");
  expect(api.srpPasswordSent).toBe(false);
});
