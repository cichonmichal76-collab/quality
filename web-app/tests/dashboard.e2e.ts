import { expect, test } from "@playwright/test";

test("dashboard renders seeded shipment and component queues", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  const shipmentTable = page.locator(".table-card");
  const shipmentActions = page
    .locator(".summary-panel")
    .filter({ hasText: "Akcje operacyjne" })
    .first();

  await expect(page.locator(".table-card tbody tr")).toHaveCount(6);
  await expect(shipmentTable.getByText(/READY-E2E-/)).toBeVisible();
  await expect(shipmentTable.getByText(/ASM-E2E-/)).toBeVisible();
  await expect(shipmentTable.getByText(/TEST-E2E-/)).toBeVisible();
  await expect(shipmentTable.getByText(/CQ-E2E-/)).toBeVisible();
  await expect(shipmentTable.getByText(/CN-E2E-/)).toBeVisible();
  await expect(shipmentTable.getByText(/DN-E2E-/)).toBeVisible();
  await expect(shipmentActions.getByText("Uruchom final test")).toBeVisible();
  await expect(shipmentActions.getByText("Zamknij krytyczne NCR")).toBeVisible();
  await expect(shipmentActions.getByText(/Doko/)).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  const componentTable = page.locator(".table-card");

  await expect(page.locator(".table-card tbody tr")).toHaveCount(2);
  await expect(componentTable.getByText(/CQ-E2E-/)).toBeVisible();
  await expect(componentTable.getByText(/CN-E2E-/)).toBeVisible();
  await expect(componentTable.getByText("QC niezaliczone")).toBeVisible();
  await expect(componentTable.getByText("Krytyczne NCR otwarte")).toBeVisible();
});
