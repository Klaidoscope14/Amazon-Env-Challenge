import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test("search for any locality and see its air quality", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Delhi" })).toBeVisible();

  await page.getByRole("button", { name: "Change location" }).or(page.getByRole("link", { name: "Change location" })).click();
  await page.getByLabel("Or search for your area").fill("Lajpat");
  await page.getByRole("button", { name: /^Lajpat Nagar II/ }).click();

  await expect(page.getByRole("heading", { name: "Lajpat Nagar II" })).toBeVisible();
  await expect(page.getByText("268").first()).toBeVisible();
});
