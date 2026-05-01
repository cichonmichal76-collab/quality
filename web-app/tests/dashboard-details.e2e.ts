import { expect, test } from "@playwright/test";

test("dashboard opens device details from component queue", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");

  await page.getByRole("button", { name: /CQ-E2E-/ }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: /CQ-E2E-/ })).toBeVisible();
  await expect(drawer.getByText(/Bramka wysy/i)).toBeVisible();
  await expect(drawer.getByText(/Kontrola jako/i)).toBeVisible();
  await expect(drawer.getByText(/Fan Module/).first()).toBeVisible();

  await drawer.getByRole("button", { name: "Zamknij" }).click();
  await expect(drawer).toHaveCount(0);
});
