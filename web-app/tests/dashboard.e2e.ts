import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const SEEDED_SERIAL_PATTERNS = {
  ready: /READY-(?:LOCAL|E2E)-/,
  assembly: /ASM-(?:LOCAL|E2E)-/,
  finalTest: /TEST-(?:LOCAL|E2E)-/,
  componentQc: /CQ-(?:LOCAL|E2E)-/,
  componentNcr: /CN-(?:LOCAL|E2E)-/,
  deviceNcr: /DN-(?:LOCAL|E2E)-/,
};

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
  await expect(shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.ready)).toBeVisible();
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.assembly),
  ).toBeVisible();
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.finalTest),
  ).toBeVisible();
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.componentQc),
  ).toBeVisible();
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.componentNcr),
  ).toBeVisible();
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.deviceNcr),
  ).toBeVisible();
  await expect(shipmentActions.getByText("Uruchom final test")).toBeVisible();
  await expect(shipmentActions.getByText("Zamknij krytyczne NCR")).toBeVisible();
  await expect(shipmentActions.getByText(/Doko/)).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  const componentTable = page.locator(".table-card");

  await expect(page.locator(".table-card tbody tr")).toHaveCount(2);
  await expect(
    componentTable.getByText(SEEDED_SERIAL_PATTERNS.componentQc),
  ).toBeVisible();
  await expect(
    componentTable.getByText(SEEDED_SERIAL_PATTERNS.componentNcr),
  ).toBeVisible();
  await expect(componentTable.getByText("QC niezaliczone")).toBeVisible();
  await expect(componentTable.getByText("Krytyczne NCR otwarte")).toBeVisible();
});

test("dashboard renders mocked commissioning queue and applies trigger preset", async ({
  page,
}) => {
  const baseSessions = [
    {
      session_id: "SVC-001",
      device_serial_number: "SVC-DEVICE-001",
      device_type: "DEMO-SVC",
      technician_id: "TECH-001",
      result: "PASS",
      upload_status: "UPLOADED",
      upload_count: 1,
      firmware_version: "1.2.3",
      bootloader_version: "0.9.0",
      client_attempt_id: "ATTEMPT-001",
      client_attempt_number: 1,
      client_trigger_source: "MANUAL",
      upload_correlation_id: "CORR-001",
      uploaded_at: "2026-05-03T08:10:00Z",
      created_at: "2026-05-03T08:00:00Z",
    },
    {
      session_id: "SVC-002",
      device_serial_number: "SVC-DEVICE-002",
      device_type: "DEMO-SVC",
      technician_id: "TECH-002",
      result: "HOLD",
      upload_status: "UPLOADED",
      upload_count: 2,
      firmware_version: "1.2.4",
      bootloader_version: "0.9.1",
      client_attempt_id: "ATTEMPT-002",
      client_attempt_number: 2,
      client_trigger_source: "AUTO_NETWORK",
      upload_correlation_id: "CORR-002",
      uploaded_at: "2026-05-03T09:10:00Z",
      created_at: "2026-05-03T09:00:00Z",
    },
  ];

  await page.route("**/api/service-sessions/queue**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const triggerSource = requestUrl.searchParams.get("client_trigger_source");
    const sessions =
      triggerSource === "AUTO_NETWORK"
        ? baseSessions.filter(
            (session) => session.client_trigger_source === "AUTO_NETWORK",
          )
        : baseSessions;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_sessions: sessions.length,
        reuploaded_sessions: sessions.filter((session) => session.upload_count > 1)
          .length,
        returned_count: sessions.length,
        offset: 0,
        limit: 100,
        has_more: false,
        next_offset: null,
        filters: triggerSource ? { client_trigger_source: triggerSource } : {},
        upload_status_summary: [{ upload_status: "UPLOADED", session_count: sessions.length }],
        result_summary: [
          { result: "PASS", session_count: sessions.filter((session) => session.result === "PASS").length },
          { result: "HOLD", session_count: sessions.filter((session) => session.result === "HOLD").length },
        ].filter((item) => item.session_count > 0),
        device_type_summary: [
          { device_type: "DEMO-SVC", session_count: sessions.length },
        ],
        technician_summary: sessions.map((session) => ({
          technician_id: session.technician_id,
          session_count: 1,
        })),
        trigger_source_summary: [
          {
            client_trigger_source: "MANUAL",
            session_count: sessions.filter(
              (session) => session.client_trigger_source === "MANUAL",
            ).length,
          },
          {
            client_trigger_source: "AUTO_NETWORK",
            session_count: sessions.filter(
              (session) => session.client_trigger_source === "AUTO_NETWORK",
            ).length,
          },
        ].filter((item) => item.session_count > 0),
        sessions,
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Commissioning i serwis" }).click();

  const serviceTable = page.locator(".table-card");
  await expect(page.locator(".table-card tbody tr")).toHaveCount(2);
  await expect(serviceTable.getByText("SVC-001")).toBeVisible();
  await expect(serviceTable.getByText("SVC-DEVICE-001")).toBeVisible();
  await expect(serviceTable.getByText("SVC-002")).toBeVisible();

  const triggerPanel = page
    .locator(".summary-panel")
    .filter({ hasText: "Trigger synchronizacji" })
    .first();
  await triggerPanel.getByRole("button", { name: /Auto po sieci/i }).click();

  await expect(page).toHaveURL(/view=service/);
  await expect(page).toHaveURL(/svc_client_trigger_source=AUTO_NETWORK/);
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(serviceTable.getByText("SVC-002")).toBeVisible();
});

test("dashboard restores selected commissioning session after reload", async ({
  page,
}) => {
  await page.route("**/api/service-sessions/queue**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_sessions: 1,
        reuploaded_sessions: 1,
        returned_count: 1,
        offset: 0,
        limit: 100,
        has_more: false,
        next_offset: null,
        filters: {},
        upload_status_summary: [{ upload_status: "UPLOADED", session_count: 1 }],
        result_summary: [{ result: "PASS", session_count: 1 }],
        device_type_summary: [{ device_type: "DEMO-SVC", session_count: 1 }],
        technician_summary: [{ technician_id: "TECH-001", session_count: 1 }],
        trigger_source_summary: [
          { client_trigger_source: "MANUAL", session_count: 1 },
        ],
        sessions: [
          {
            session_id: "SVC-001",
            device_serial_number: "SVC-DEVICE-001",
            device_type: "DEMO-SVC",
            technician_id: "TECH-001",
            result: "PASS",
            upload_status: "UPLOADED",
            upload_count: 1,
            firmware_version: "1.2.3",
            bootloader_version: "0.9.0",
            client_attempt_id: "ATTEMPT-001",
            client_attempt_number: 1,
            client_trigger_source: "MANUAL",
            upload_correlation_id: "CORR-001",
            uploaded_at: "2026-05-03T08:10:00Z",
            created_at: "2026-05-03T08:00:00Z",
          },
        ],
      }),
    });
  });

  await page.route("**/api/service-sessions/SVC-001", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "svc-row-001",
        session_id: "SVC-001",
        device_serial_number: "SVC-DEVICE-001",
        device_type: "DEMO-SVC",
        technician_id: "TECH-001",
        result: "PASS",
        upload_status: "UPLOADED",
        upload_count: 1,
        firmware_version: "1.2.3",
        bootloader_version: "0.9.0",
        client_attempt_id: "ATTEMPT-001",
        client_attempt_number: 1,
        client_trigger_source: "MANUAL",
        upload_correlation_id: "CORR-001",
        uploaded_at: "2026-05-03T08:10:00Z",
        package_path: "/tmp/SVC-001.zip",
        package_hash: "HASH-001",
      }),
    });
  });

  await page.route("**/api/audit-events**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (
      requestUrl.searchParams.get("entity_type") === "SERVICE_SESSION" &&
      requestUrl.searchParams.get("entity_id") === "SVC-001"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "AUD-SVC-001",
            event_type: "SERVICE_SESSION_PACKAGE_REUPLOADED",
            entity_type: "SERVICE_SESSION",
            entity_id: "SVC-001",
            work_session_id: null,
            result: "UPLOADED",
            created_at: "2026-05-03T08:10:00Z",
            message: "Service session package reuploaded",
            payload: {
              client_trigger_source: "MANUAL",
              upload_count: 1,
              upload_correlation_id: "CORR-001",
            },
          },
        ]),
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Commissioning i serwis" }).click();
  await page.getByRole("button", { name: "SVC-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "SVC-001" })).toBeVisible();
  await expect(page).toHaveURL(/view=service/);
  await expect(page).toHaveURL(/svc_session_id=SVC-001/);

  await page.reload();

  await expect(
    page.getByRole("button", { name: "Commissioning i serwis" }),
  ).toHaveClass(/is-active/);
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "SVC-001" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/svc_session_id=SVC-001/);
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
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.deviceNcr),
  ).toBeVisible();
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.componentNcr),
  ).toBeVisible();

  await page.locator(".pagination-bar .primary-button").click();

  await expect(page.getByText(/3-4 z 6/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(2);
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.componentQc),
  ).toBeVisible();
  await expect(
    shipmentTable.getByText(SEEDED_SERIAL_PATTERNS.finalTest),
  ).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  const componentTextFields = page.locator(".filters-card input");
  const componentLimitField = page.locator('.filters-card input[type="number"]');

  await componentTextFields.first().fill("DEMO-E2E");
  await componentLimitField.fill("1");

  const componentTable = page.locator(".table-card");

  await expect(page.getByText(/1-1 z 2/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(
    componentTable.getByText(SEEDED_SERIAL_PATTERNS.componentQc),
  ).toBeVisible();

  await page.locator(".pagination-bar .primary-button").click();

  await expect(page.getByText(/2-2 z 2/)).toBeVisible();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(
    componentTable.getByText(SEEDED_SERIAL_PATTERNS.componentNcr),
  ).toBeVisible();
});

test("dashboard copies the current link with active filters", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  await page.getByRole("button", { name: "Gotowe", exact: true }).click();

  await page.getByRole("button", { name: "Kopiuj link dashboardu" }).click();
  await expect(page.getByRole("status")).toContainText("Link skopiowany.");

  const copiedLink = await page.evaluate(async () => navigator.clipboard.readText());
  expect(copiedLink).toContain("ship_device_type=DEMO-E2E");
  expect(copiedLink).toContain("ship_only_ready=true");
});

test("dashboard downloads CSV for the active shipment queue", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  await page.locator('.filters-card input[type="number"]').fill("1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksport CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^servicetrace-wysylka-\d{8}-\d{6}\.csv$/,
  );

  const exportPath = testInfo.outputPath("shipment-queue-export.csv");
  await download.saveAs(exportPath);
  const exportContent = await readFile(exportPath, "utf8");

  expect(exportContent).toContain("device_serial_number");
  expect(exportContent).toMatch(SEEDED_SERIAL_PATTERNS.ready);
  expect(exportContent).toMatch(SEEDED_SERIAL_PATTERNS.deviceNcr);
  expect(exportContent).toContain("DEMO-E2E");
});

test("dashboard auto-refreshes the active queue", async ({ page }) => {
  let shipmentRequestCount = 0;
  const baseShipmentPayload = {
    total_devices: 1,
    ready_count: 1,
    blocked_count: 0,
    returned_count: 1,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    filters: {},
    blocking_summary: [],
    primary_blocking_summary: [],
    recommended_action_summary: [
      {
        recommended_action: "MARK_READY_FOR_SHIPMENT",
        device_count: 1,
      },
    ],
    latest_shipment_gate_result_summary: [
      {
        result: "PASS",
        device_count: 1,
      },
    ],
    production_status_summary: [
      {
        production_status: "FINAL_TEST_PASSED",
        device_count: 1,
      },
    ],
  };

  await page.route("**/api/shipment-readiness**", async (route) => {
    shipmentRequestCount += 1;
    const serialNumber =
      shipmentRequestCount <= 2 ? "SHIP-AUTO-001" : "SHIP-AUTO-002";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...baseShipmentPayload,
        devices: [
          {
            device_serial_number: serialNumber,
            device_type: "DEMO-AUTO",
            device_variant_code: "DEFAULT",
            production_status: "FINAL_TEST_PASSED",
            device_created_at: "2026-05-01T08:00:00Z",
            device_updated_at: "2026-05-01T09:00:00Z",
            final_test_passed: true,
            has_critical_open_ncr: false,
            critical_open_ncr_ids: [],
            bom_compliance: {
              passes_bom_gate: true,
              installed_component_count: 1,
              missing_required_components: [],
              over_installed_components: [],
              unexpected_component_types: [],
              blocking_reason: null,
            },
            can_transition_to_ready_for_shipment: true,
            latest_shipment_gate_decision: {
              event_type: "SHIPMENT_GATE_PASSED",
              result: "PASS",
              message: "Ready",
              recommended_action: "MARK_READY_FOR_SHIPMENT",
              created_at: "2026-05-01T09:05:00Z",
            },
            primary_blocking_code: null,
            primary_blocking_message: null,
            recommended_action: "MARK_READY_FOR_SHIPMENT",
            blocking_reasons: [],
          },
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await expect(page.locator(".table-card")).toContainText("SHIP-AUTO-001");

  await page.getByLabel("Auto-odświeżanie").check();
  await page.getByLabel("Interwał auto-odświeżania").selectOption("5000");
  await expect(page.getByText("Auto: co 5 s")).toBeVisible();

  await page.waitForTimeout(5200);

  await expect(page.locator(".table-card")).toContainText("SHIP-AUTO-002");
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
  await expect(page.locator(".table-card")).toContainText(
    SEEDED_SERIAL_PATTERNS.finalTest,
  );

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
  await expect(page.locator(".table-card")).toContainText(
    SEEDED_SERIAL_PATTERNS.componentQc,
  );
});

test("dashboard applies metric filters from shipment and component cards", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.locator(".filters-card input").first().fill("DEMO-E2E");

  await page.getByRole("button", { name: "Gotowe", exact: true }).click();

  await expect(page).toHaveURL(/ship_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/ship_only_ready=true/);
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(page.locator(".table-card")).toContainText(
    SEEDED_SERIAL_PATTERNS.ready,
  );

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");

  await page.getByRole("button", { name: /Przechodzą gate/i }).click();

  await expect(page).toHaveURL(/comp_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/comp_passes_component_quality_gate=true/);
  await expect(page.locator(".table-card tbody tr")).toHaveCount(4);
  await expect(page.locator(".table-card")).toContainText(
    SEEDED_SERIAL_PATTERNS.ready,
  );
});

test("dashboard shows removable active shipment filter chips", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  await page.getByRole("button", { name: "Gotowe", exact: true }).click();

  const activeFilters = page.getByRole("group", {
    name: "Aktywne filtry wysyłki",
  });
  await expect(activeFilters).toContainText("Typ urządzenia: DEMO-E2E");
  await expect(activeFilters).toContainText("Tylko gotowe");

  await activeFilters
    .getByRole("button", { name: /Usuń filtr: Tylko gotowe/i })
    .click();

  await expect.poll(() => page.url()).not.toMatch(/ship_only_ready=true/);
  await expect(activeFilters).not.toContainText("Tylko gotowe");
  await expect(page.locator(".table-card tbody tr")).toHaveCount(6);
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
  await expect(
    componentTable.getByText(SEEDED_SERIAL_PATTERNS.componentNcr),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByRole("button", { name: "Komponenty" })).toHaveClass(
    /is-active/,
  );
  await expect(componentTextFields.first()).toHaveValue("DEMO-E2E");
  await expect(componentLimitField).toHaveValue("1");
  await expect(page.getByText(/2-2 z 2/)).toBeVisible();
  await expect(
    componentTable.getByText(SEEDED_SERIAL_PATTERNS.componentNcr),
  ).toBeVisible();
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
