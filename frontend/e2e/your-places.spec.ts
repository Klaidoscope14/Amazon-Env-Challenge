import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test("signed in, save this area as Home and see it in Your places", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/");
  // Signed out: the card explains what an account adds.
  await expect(page.getByRole("link", { name: "Sign in to save places" })).toBeVisible();

  await page.goto("/login?redirect=/");
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Save Delhi" }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Save place" }).click();

  const places = page.getByRole("region", { name: "Your places" });
  await expect(places.getByRole("listitem").filter({ hasText: "Home" })).toHaveCount(1);
  await expect(places.getByRole("button", { name: /^\d+ Home/ })).toBeVisible(); // its AQI, then the label
  expect(api.savedProfile).toMatchObject({ places: [{ label: "Home", areaId: "city-delhi", name: "Delhi" }] });
});
