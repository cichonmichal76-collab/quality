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

test("dashboard paginates shipment and component queues", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  const shipmentTextFields = page.locator(".filters-card input");
  const shipmentLimitField = page.locator('.filters-card input[type="number"]');

  await shipmentTextFields.first().fill("DEMO-E2E");
  await shipmentLimitField.fill("2");

  const shipmentTable = page.locator(".table-card");

  await expect(page.getByText(/1-2 z 6/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(2);
  await expect(shipmentTable.getByText(/DN-E2E-/)).toBeVisible();
  await expect(shipmentTable.getByText(/CN-E2E-/)).toBeVisible();

  await page.locator(".pagination-bar .primary-button").click();

  await expect(page.getByText(/3-4 z 6/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(2);
  await expect(shipmentTable.getByText(/CQ-E2E-/)).toBeVisible();
  await expect(shipmentTable.getByText(/TEST-E2E-/)).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  const componentTextFields = page.locator(".filters-card input");
  const componentLimitField = page.locator('.filters-card input[type="number"]');

  await componentTextFields.first().fill("DEMO-E2E");
  await componentLimitField.fill("1");

  const componentTable = page.locator(".table-card");

  await expect(page.getByText(/1-1 z 2/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(componentTable.getByText(/CQ-E2E-/)).toBeVisible();

  await page.locator(".pagination-bar .primary-button").click();

  await expect(page.getByText(/2-2 z 2/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(componentTable.getByText(/CN-E2E-/)).toBeVisible();
});

test("dashboard clamps limit filters before calling the API", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  const shipmentTextFields = page.locator(".filters-card input");
  const shipmentLimitField = page.locator('.filters-card input[type="number"]');

  await shipmentTextFields.first().fill("DEMO-E2E");
  await shipmentLimitField.fill("999");

  await expect(shipmentLimitField).toHaveValue("500");
  await expect(page.getByText(/1-6 z 6/)).toBeVisible();
  await expect(page.locator(".error-banner")).toHaveCount(0);

  await page.getByRole("button", { name: "Komponenty" }).click();
  const componentTextFields = page.locator(".filters-card input");
  const componentLimitField = page.locator('.filters-card input[type="number"]');

  await componentTextFields.first().fill("DEMO-E2E");
  await componentLimitField.fill("0");

  await expect(componentLimitField).toHaveValue("1");
  await expect(page.getByText(/1-1 z 2/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(page.locator(".error-banner")).toHaveCount(0);
});
