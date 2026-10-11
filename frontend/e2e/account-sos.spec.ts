import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test("SOS works signed out, and reaches saved emergency contacts once signed in", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 28.6139, longitude: 77.209 });
  const api = await mockApi(page);
  await page.goto("/");

  // Signed out: emergency services are one tap away, with a prompt to add contacts.
  await page.getByRole("button", { name: "SOS" }).click();
  const sos = page.getByRole("dialog");
  await expect(sos.getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");
  await expect(sos.getByText(/to save emergency contacts/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sos).toBeHidden();

  // Sign in, then fill in the profile and an emergency contact.
  await page.goto("/login?redirect=/account");
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();

  await page.getByLabel("Phone", { exact: true }).fill("98765 43210");
  await page.getByLabel("Address line 1").fill("12 Lodhi Road");
  await page.getByLabel("Address line 2").fill("New Delhi 110003");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(api.savedProfile).toMatchObject({ name: "Asha Verma", addressLine1: "12 Lodhi Road" });

  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Name", { exact: true }).last().fill("Papa");
  await page.getByLabel("Phone", { exact: true }).last().fill("9123456789");
  await page.getByLabel(/Relation/).fill("Father");
  await page.getByRole("button", { name: "Save contacts" }).click();
  await expect(page.getByText("Emergency contacts saved.")).toBeVisible();

  // SOS now texts the contact, with the live location in the message.
  await page.getByRole("button", { name: "SOS" }).click();
  await expect(sos.getByText("Your current location is included.")).toBeVisible();
  const text = sos.getByRole("link", { name: "Text SOS to Papa" });
  await expect(text).toHaveAttribute("href", /^sms:\+919123456789\?body=/);
  const body = decodeURIComponent((await text.getAttribute("href"))!.split("body=")[1]);
  expect(body).toContain("SOS: Asha Verma needs help urgently.");
  expect(body).toContain("https://maps.google.com/?q=28.61390,77.20900");
  expect(body).toContain("Call me: +919876543210");
  await expect(sos.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/919123456789\?text=/);
});
