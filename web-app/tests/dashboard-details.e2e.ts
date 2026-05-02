import { expect, test } from "@playwright/test";

test("dashboard opens device details from component queue", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");

  await page.getByRole("button", { name: /CQ-E2E-/ }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const heading = drawer.getByRole("heading", { name: /CQ-E2E-/ });
  await expect(heading).toBeVisible();
  await expect(drawer.getByText(/Bramka wysy/i)).toBeVisible();
  await expect(drawer.getByText(/Kontrola jako/i)).toBeVisible();
  await expect(drawer.getByText(/Fan Module/).first()).toBeVisible();

  await expect(page).toHaveURL(/view=components/);
  await expect(page).toHaveURL(/comp_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/device_serial=CQ-E2E-/);

  await page.reload();

  await expect(page.getByRole("button", { name: "Komponenty" })).toHaveClass(
    /is-active/,
  );
  await expect(page.locator(".filters-card input").first()).toHaveValue(
    "DEMO-E2E",
  );
  await expect(drawer).toBeVisible();
  await expect(heading).toBeVisible();

  await drawer.getByRole("button", { name: "Zamknij" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/device_serial=/);
});

test("dashboard opens full device details page and returns to queue context", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  await page.getByRole("button", { name: /CQ-E2E-/ }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: "Pełna strona" }).click();

  await expect(page).toHaveURL(/\/devices\/CQ-E2E-/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /CQ-E2E-/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Wróć do dashboardu" })).toBeVisible();

  await page.getByRole("link", { name: "Przejdź do blokującego komponentu" }).click();
  await expect(page).toHaveURL(/#komponent-/);
  await expect(
    page.getByRole("link", { name: "Jakość komponentów" }),
  ).toHaveClass(/is-active/);

  await page.getByRole("link", { name: "Historia gate" }).click();
  await expect(page).toHaveURL(/#historia-gate$/);
  await expect(page.getByRole("link", { name: "Historia gate" })).toHaveClass(
    /is-active/,
  );

  await page.reload();

  await expect(page).toHaveURL(/\/devices\/CQ-E2E-.*#historia-gate$/);
  await expect(
    page.getByRole("heading", { name: /CQ-E2E-/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Historia gate" })).toHaveClass(
    /is-active/,
  );

  await page.getByRole("link", { name: "Wróć do dashboardu" }).click();

  await expect(page).toHaveURL(/view=components/);
  await expect(page).toHaveURL(/comp_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/device_serial=CQ-E2E-/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("dashboard jumps from full device page to a filtered related queue", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  await page.getByRole("button", { name: /CQ-E2E-/ }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: "Pełna strona" }).click();

  await expect(page).toHaveURL(/\/devices\/CQ-E2E-/);
  await page
    .getByRole("link", { name: /Pokaż podobne blokady w kolejce komponentów/ })
    .click();

  await expect(page).toHaveURL(/\/\?view=components/);
  await expect(page).toHaveURL(/comp_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/comp_blocking_component_type=FAN_MODULE/);
  await expect(page).not.toHaveURL(/device_serial=/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Komponenty" })).toHaveClass(
    /is-active/,
  );
  await expect(page.getByLabel("Typ urządzenia")).toHaveValue("DEMO-E2E");
  await expect(
    page.getByRole("textbox", { name: "Typ blokującego komponentu" }),
  ).toHaveValue("FAN_MODULE");
});
