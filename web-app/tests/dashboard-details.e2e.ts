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
  await expect(
    page.getByRole("link", { name: "Wróć do dashboardu" }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Przejdź do blokującego komponentu" })
    .click();
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
  await expect(
    page.getByRole("textbox", { name: "Typ urządzenia" }),
  ).toHaveValue("DEMO-E2E");
  await expect(
    page.getByRole("textbox", { name: "Typ blokującego komponentu" }),
  ).toHaveValue("FAN_MODULE");
});

test("dashboard jumps from BOM details to a filtered shipment queue", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByLabel("Typ urządzenia").fill("DEMO-E2E");
  await page.getByRole("button", { name: /ASM-E2E-/ }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: "Pełna strona" }).click();

  await expect(page).toHaveURL(/\/devices\/ASM-E2E-/);
  await page.getByRole("link", { name: /Pokaż braki BOM dla/i }).click();

  await expect(page).toHaveURL(/\/\?view=shipment/);
  await expect(page).toHaveURL(/ship_device_type=DEMO-E2E/);
  await expect(
    page,
  ).toHaveURL(/ship_primary_blocking_code=BOM_REQUIRED_COMPONENTS_MISSING/);
  await expect(page).toHaveURL(/ship_missing_component_type=CONTROL_PCB/);
  await expect(page).not.toHaveURL(/device_serial=/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wysyłka" })).toHaveClass(
    /is-active/,
  );
  await expect(
    page.getByRole("textbox", { name: "Typ urządzenia" }),
  ).toHaveValue("DEMO-E2E");
  await expect(
    page.getByRole("textbox", { name: "Brakujący typ BOM" }),
  ).toHaveValue("CONTROL_PCB");
});

test("dashboard jumps from shipment gate history to a filtered shipment queue", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (
      url.pathname === "/api/component-quality" &&
      url.searchParams.get("device_type") === "DEMO-OPS"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_devices: 1,
          devices_with_issues: 1,
          returned_count: 1,
          offset: 0,
          limit: 100,
          has_more: false,
          next_offset: null,
          filters: {},
          quality_status_summary: [],
          variant_code_summary: [],
          production_status_summary: [],
          primary_quality_status_summary: [],
          component_quality_gate_summary: [],
          staleness_summary: [],
          component_type_summary: [],
          blocking_component_type_summary: [],
          primary_blocking_component_type_summary: [],
          recommended_action_summary: [],
          devices: [
            {
              device_serial_number: "COMP-001",
              device_type: "DEMO-OPS",
              device_variant_code: "DEFAULT",
              production_status: "FINAL_TEST_PASSED",
              device_created_at: "2026-05-01T08:00:00Z",
              device_updated_at: "2026-05-01T09:00:00Z",
              stale_bucket: "LT_24H",
              total_installed_components: 2,
              passing_components: 1,
              blocked_components: 1,
              passes_component_quality_gate: false,
              primary_quality_status: "QC_NOT_PASSED",
              primary_blocking_component_type: "FAN_MODULE",
              primary_blocking_component_serial_number: "FAN-001",
              recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/devices/COMP-001/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          device_serial_number: "COMP-001",
          device_type: "DEMO-OPS",
          device_variant_code: "DEFAULT",
          production_status: "FINAL_TEST_PASSED",
          device_created_at: "2026-05-01T08:00:00Z",
          device_updated_at: "2026-05-01T09:05:00Z",
          final_test_passed: true,
          has_critical_open_ncr: false,
          critical_open_ncr_ids: [],
          bom_compliance: {
            passes_bom_gate: true,
            installed_component_count: 2,
            missing_required_components: [],
            over_installed_components: [],
            unexpected_component_types: [],
            component_coverage: [],
            blocking_reason: null,
          },
          can_transition_to_ready_for_shipment: false,
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_BLOCKED",
            result: "BLOCKED",
            message: "Installed component lacks QC_PASSED",
            recommended_action: "RESOLVE_COMPONENT_QUALITY",
            created_at: "2026-05-01T09:20:00Z",
          },
          primary_blocking_code: "COMPONENT_QC_NOT_PASSED",
          primary_blocking_message: "Installed component lacks QC_PASSED",
          recommended_action: "RESOLVE_COMPONENT_QUALITY",
          blocking_reasons: ["Installed component lacks QC_PASSED"],
          blocking_checks: [],
        }),
      });
      return;
    }

    if (url.pathname === "/api/devices/COMP-001/component-quality") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          device_serial_number: "COMP-001",
          device_type: "DEMO-OPS",
          device_variant_code: "DEFAULT",
          production_status: "FINAL_TEST_PASSED",
          device_created_at: "2026-05-01T08:00:00Z",
          device_updated_at: "2026-05-01T09:05:00Z",
          stale_bucket: "LT_24H",
          total_installed_components: 2,
          passing_components: 1,
          blocked_components: 1,
          passes_component_quality_gate: false,
          primary_quality_status: "QC_NOT_PASSED",
          primary_blocking_component_type: "FAN_MODULE",
          primary_blocking_component_serial_number: "FAN-001",
          recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
          components: [],
        }),
      });
      return;
    }

    if (url.pathname === "/api/devices/COMP-001/shipment-gate-history") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "AUD-1",
            event_type: "SHIPMENT_GATE_BLOCKED",
            entity_type: "DEVICE",
            entity_id: "COMP-001",
            work_session_id: "WS-10",
            operator_id: "OP-10",
            workstation_id: "ST-10",
            machine_id: null,
            result: "BLOCKED",
            message: "Gate zablokowany przez brak QC",
            payload: { requested_status: "READY_FOR_SHIPMENT" },
            created_at: "2026-05-01T09:20:00Z",
          },
          {
            id: "AUD-2",
            event_type: "SHIPMENT_GATE_PASSED",
            entity_type: "DEVICE",
            entity_id: "COMP-001",
            work_session_id: "WS-11",
            operator_id: "OP-11",
            workstation_id: "ST-11",
            machine_id: null,
            result: "PASS",
            message: "Gate przeszedł po naprawie",
            payload: { requested_status: "READY_FOR_SHIPMENT" },
            created_at: "2026-05-01T10:00:00Z",
          },
        ]),
      });
      return;
    }

    await route.continue();
  });

  await page.goto(
    "/devices/COMP-001?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT#historia-gate",
  );

  await expect(
    page.getByRole("heading", { name: "COMP-001" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Pokaż urządzenia z tym samym wynikiem gate/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/\?view=shipment/);
  await expect(page).toHaveURL(/ship_device_type=DEMO-OPS/);
  await expect(page).toHaveURL(/ship_latest_gate_result=BLOCKED/);
  await expect(page).not.toHaveURL(/device_serial=/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wysyłka" })).toHaveClass(
    /is-active/,
  );
  await expect(
    page.getByRole("textbox", { name: "Typ urządzenia" }),
  ).toHaveValue("DEMO-OPS");
});
