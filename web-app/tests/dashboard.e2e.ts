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

test("dashboard applies summary filters from shipment and component actions", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  const shipmentActions = page
    .locator(".summary-panel")
    .filter({ hasText: "Akcje operacyjne" })
    .first();

  await shipmentActions
    .getByRole("button", { name: /Uruchom final test/i })
    .click();

  await expect(page).toHaveURL(/ship_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/ship_recommended_action=RUN_FINAL_TEST/);
  await expect(page).toHaveURL(/ship_only_blocked=true/);
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(page.locator(".table-card")).toContainText(/TEST-E2E-/);

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  const componentActions = page
    .locator(".summary-panel")
    .filter({ hasText: "Akcje operacyjne" })
    .first();

  await componentActions
    .getByRole("button", { name: /Uruchom QC komponentu \/ rework/i })
    .click();

  await expect(page).toHaveURL(/comp_device_type=DEMO-E2E/);
  await expect(
    page,
  ).toHaveURL(/comp_recommended_action=RUN_COMPONENT_QC_OR_REWORK/);
  await expect(page).toHaveURL(/comp_only_blocking=true/);
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(page.locator(".table-card")).toContainText(/CQ-E2E-/);
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

test("dashboard restores active tab and filters after reload", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  const componentTextFields = page.locator(".filters-card input");
  const componentLimitField = page.locator('.filters-card input[type="number"]');

  await componentTextFields.first().fill("DEMO-E2E");
  await componentLimitField.fill("1");
  await page.locator(".pagination-bar .primary-button").click();

  const componentTable = page.locator(".table-card");
  await expect(page.getByText(/2-2 z 2/)).toBeVisible();
  await expect(componentTable.getByText(/CN-E2E-/)).toBeVisible();

  await page.reload();

  await expect(page.getByRole("button", { name: "Komponenty" })).toHaveClass(
    /is-active/,
  );
  await expect(componentTextFields.first()).toHaveValue("DEMO-E2E");
  await expect(componentLimitField).toHaveValue("1");
  await expect(page.getByText(/2-2 z 2/)).toBeVisible();
  await expect(componentTable.getByText(/CN-E2E-/)).toBeVisible();
});

test("dashboard clears saved state back to defaults", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  const componentTextFields = page.locator(".filters-card input");
  const componentLimitField = page.locator('.filters-card input[type="number"]');

  await componentTextFields.first().fill("DEMO-E2E");
  await componentLimitField.fill("1");
  await page.locator(".pagination-bar .primary-button").click();

  await expect(page.getByText(/2-2 z 2/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Komponenty" })).toHaveClass(
    /is-active/,
  );

  const apiControls = page.getByRole("region", { name: /API/i });
  await apiControls
    .getByRole("button", { name: "Wyczyść zapisany stan" })
    .click();

  const shipmentTextFields = page.locator(".filters-card input");
  const shipmentLimitField = page.locator('.filters-card input[type="number"]');
  await expect(page.getByRole("button", { name: "Wysyłka" })).toHaveClass(
    /is-active/,
  );
  await expect(page.getByRole("button", { name: "Komponenty" })).not.toHaveClass(
    /is-active/,
  );
  await expect(shipmentTextFields.first()).toHaveValue("");
  await expect(shipmentLimitField).toHaveValue("100");

  await page.reload();

  await expect(page.getByRole("button", { name: "Wysyłka" })).toHaveClass(
    /is-active/,
  );
  await expect(shipmentTextFields.first()).toHaveValue("");
  await expect(shipmentLimitField).toHaveValue("100");
});
