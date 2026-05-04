import { expect, test } from "@playwright/test";
import {
  buildServiceSession,
  buildServiceSessionAuditEvent,
  fulfillDeviceDetailsRequests,
  fulfillJson,
  fulfillServiceSessionDetailRequests,
  fulfillServiceSessionsQueue,
} from "./dashboard.e2e-helpers";

const SEEDED_COMPONENT_SERIAL = /CQ-(?:LOCAL|E2E)-/;
const SEEDED_ASSEMBLY_SERIAL = /ASM-(?:LOCAL|E2E)-/;

test("dashboard opens device details from component queue", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");

  await page.getByRole("button", { name: SEEDED_COMPONENT_SERIAL }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const heading = drawer.getByRole("heading", { name: SEEDED_COMPONENT_SERIAL });
  await expect(heading).toBeVisible();
  await expect(drawer.getByText(/Bramka wysy/i)).toBeVisible();
  await expect(drawer.getByText(/Kontrola jako/i)).toBeVisible();
  await expect(drawer.getByText(/Fan Module/).first()).toBeVisible();

  await expect(page).toHaveURL(/view=components/);
  await expect(page).toHaveURL(/comp_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/device_serial=CQ-(?:LOCAL|E2E)-/);

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
  await page.getByRole("button", { name: SEEDED_COMPONENT_SERIAL }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: /strona/i }).click();

  await expect(page).toHaveURL(/\/devices\/CQ-(?:LOCAL|E2E)-/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: SEEDED_COMPONENT_SERIAL }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /dashboardu/i })).toBeVisible();

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

  await expect(page).toHaveURL(/\/devices\/CQ-(?:LOCAL|E2E)-.*#historia-gate$/);
  await expect(
    page.getByRole("heading", { name: SEEDED_COMPONENT_SERIAL }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Historia gate" })).toHaveClass(
    /is-active/,
  );

  await page.getByRole("link", { name: /dashboardu/i }).click();

  await expect(page).toHaveURL(/view=components/);
  await expect(page).toHaveURL(/comp_device_type=DEMO-E2E/);
  await expect(page).toHaveURL(/device_serial=CQ-(?:LOCAL|E2E)-/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("dashboard jumps from full device page to a filtered related queue", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.locator(".filters-card input").first().fill("DEMO-E2E");
  await page.getByRole("button", { name: SEEDED_COMPONENT_SERIAL }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: "Pełna strona" }).click();

  await expect(page).toHaveURL(/\/devices\/CQ-(?:LOCAL|E2E)-/);
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

test("dashboard shows commissioning sync history in device details", async ({
  page,
}) => {
  const serviceSession = buildServiceSession({
    session_id: "SVC-SESSION-001",
    device_serial_number: "SVC-001",
    technician_id: "TECH-001",
    result: "PASS",
    firmware_version: "1.2.4",
    bootloader_version: "0.9.8",
    upload_count: 2,
    client_attempt_id: "SYNC-TRY-0002",
    client_attempt_number: 2,
    client_trigger_source: "AUTO_NETWORK",
    upload_correlation_id: "SRV-UP-0002",
    uploaded_at: "2026-05-01T09:45:00Z",
    created_at: "2026-05-01T09:30:00Z",
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_devices: 1,
          shipment_ready: 0,
          blocked_devices: 1,
          returned_count: 1,
          offset: 0,
          limit: 100,
          has_more: false,
          next_offset: null,
          filters: {},
          blocking_summary: [],
          action_summary: [],
          latest_decision_summary: [],
          production_status_summary: [],
          devices: [
            {
              device_serial_number: "SVC-001",
              device_type: "DEMO-SVC",
              device_variant_code: "DEFAULT",
              production_status: "FINAL_TEST_FAILED",
              device_created_at: "2026-05-01T08:00:00Z",
              device_updated_at: "2026-05-01T09:00:00Z",
              final_test_passed: false,
              has_critical_open_ncr: false,
              primary_blocking_code: "FINAL_TEST_NOT_PASSED",
              primary_blocking_message: "Final test nie przeszedl.",
              recommended_action: "RUN_FINAL_TEST",
              latest_shipment_gate_decision: null,
              bom_compliance: {
                passes_bom_gate: true,
                resolution_source: "EXACT",
                resolved_status: "READY",
                component_coverage: [],
              },
            },
          ],
        }),
      });
      return;
    }

    if (
      await fulfillDeviceDetailsRequests(url.pathname, route, {
        deviceSerialNumber: "SVC-001",
        shipmentReadiness: {
          device_serial_number: "SVC-001",
          device_type: "DEMO-SVC",
          device_variant_code: "DEFAULT",
          production_status: "FINAL_TEST_FAILED",
          device_created_at: "2026-05-01T08:00:00Z",
          device_updated_at: "2026-05-01T09:00:00Z",
          final_test_passed: false,
          has_critical_open_ncr: false,
          critical_open_ncr_ids: [],
          bom_compliance: {
            passes_bom_gate: true,
            resolution_source: "EXACT",
            resolved_status: "READY",
            component_coverage: [],
          },
          blocking_reasons: ["Final test nie przeszedl."],
          blocking_checks: [],
          primary_blocking_code: "FINAL_TEST_NOT_PASSED",
          primary_blocking_message: "Final test nie przeszedl.",
          recommended_action: "RUN_FINAL_TEST",
          latest_shipment_gate_decision: null,
        },
        componentQuality: {
          device_serial_number: "SVC-001",
          device_type: "DEMO-SVC",
          device_variant_code: "DEFAULT",
          production_status: "FINAL_TEST_FAILED",
          device_created_at: "2026-05-01T08:00:00Z",
          device_updated_at: "2026-05-01T09:00:00Z",
          total_installed_components: 0,
          passing_components: 0,
          blocked_components: 0,
          passes_component_quality_gate: true,
          primary_quality_status: "PASS",
          primary_blocking_component_type: null,
          primary_blocking_component_serial_number: null,
          stale_bucket: "LT_24H",
          recommended_action: "NONE",
          components: [],
        },
        serviceSessions: [
          {
            id: "svc-db-1",
            ...serviceSession,
            package_path: "/tmp/service-package.zip",
            package_hash: "hash-svc-001",
          },
        ],
        auditEvents: {
          body: [
            {
              id: "AUD-SVC-2",
              event_type: "SERVICE_SESSION_PACKAGE_REUPLOADED",
              entity_type: "SERVICE_SESSION",
              entity_id: "SVC-SESSION-001",
              work_session_id: null,
              operator_id: "TECH-001",
              workstation_id: null,
              machine_id: null,
              result: "UPLOADED",
              message: "Service session package reuploaded",
              payload: {
                device_serial_number: "SVC-001",
                package_hash: "hash-svc-001",
                upload_correlation_id: "SRV-UP-0002",
                upload_count: 2,
                client_attempt_id: "SYNC-TRY-0002",
                client_attempt_number: 2,
                client_trigger_source: "AUTO_NETWORK",
              },
              created_at: "2026-05-01T09:45:00Z",
            },
          ],
        },
        shipmentGateHistory: [],
      })
    ) {
      return;
    }

    if (url.pathname === "/api/work-sessions" || url.pathname === "/api/operators") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.locator(".filters-card input").first().fill("DEMO-SVC");
  await page.getByRole("button", { name: "SVC-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByText("Historia uploadów i synchronizacji"),
  ).toBeVisible();
  await expect(
    drawer.locator("p", { hasText: "Service session package reuploaded" }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Pobierz paczkę z tej sesji" }),
  ).toHaveAttribute("href", /\/api\/service-sessions\/SVC-SESSION-001\/package$/);
});

test("dashboard opens commissioning session details from service queue", async ({
  page,
}) => {
  const serviceSession = buildServiceSession({
    session_id: "SVC-SESSION-001",
    device_serial_number: "SVC-DEVICE-001",
    technician_id: "TECH-001",
    result: "PASS",
    firmware_version: "1.0.9",
    bootloader_version: "0.9.9",
    upload_count: 3,
    client_attempt_id: "ATT-001",
    client_attempt_number: 3,
    client_trigger_source: "DEFERRED_WORKER",
    upload_correlation_id: "CORR-001",
    uploaded_at: "2026-05-03T08:00:00Z",
    created_at: "2026-05-03T07:30:00Z",
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
          recommended_action_summary: [],
          latest_shipment_gate_result_summary: [],
          production_status_summary: [],
          devices: [
            {
              device_serial_number: "SHIP-001",
              device_type: "DEMO-OPS",
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
              latest_shipment_gate_decision: null,
              primary_blocking_code: null,
              primary_blocking_message: null,
              recommended_action: "MARK_READY_FOR_SHIPMENT",
              blocking_reasons: [],
            },
          ],
        }),
      });
      return;
    }

    if (
      await fulfillServiceSessionDetailRequests(url.pathname, route, {
        sessionId: "SVC-SESSION-001",
        queueSessions: [
          {
            id: "svc-row-001",
            ...serviceSession,
            package_path: "/tmp/SVC-SESSION-001.zip",
            package_hash: "hash-001",
          },
        ],
        sessionDetails: {
          id: "svc-row-001",
          ...serviceSession,
          package_path: "/tmp/SVC-SESSION-001.zip",
          package_hash: "hash-001",
        },
        auditEvents: [
          {
            id: "AUD-SVC-001",
            event_type: "SERVICE_SESSION_PACKAGE_REUPLOADED",
            entity_type: "SERVICE_SESSION",
            entity_id: "SVC-SESSION-001",
            work_session_id: null,
            operator_id: "TECH-001",
            workstation_id: null,
            machine_id: null,
            result: "UPLOADED",
            message: "Service session package reuploaded",
            payload: {
              upload_count: 3,
              package_hash: "hash-001",
              upload_correlation_id: "CORR-001",
              client_attempt_id: "ATT-001",
              client_attempt_number: 3,
              client_trigger_source: "DEFERRED_WORKER",
            },
            created_at: "2026-05-03T08:05:00Z",
          },
        ],
      })
    ) {
      return;
    }

    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Commissioning i serwis" }).click();
  await page.getByRole("button", { name: "SVC-SESSION-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("heading", { name: "SVC-SESSION-001" }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Service session package reuploaded"),
  ).toBeVisible();
  await expect(
    drawer.locator('a[href$="/api/service-sessions/SVC-SESSION-001/package"]'),
  ).toHaveCount(1);
});

test("dashboard opens full commissioning session page and returns to queue context", async ({
  page,
}) => {
  const serviceSession = buildServiceSession({
    session_id: "SVC-SESSION-001",
    device_serial_number: "SVC-DEVICE-001",
    technician_id: "TECH-001",
    result: "PASS",
    firmware_version: "1.0.9",
    bootloader_version: "0.9.9",
    upload_count: 3,
    client_attempt_id: "ATT-001",
    client_attempt_number: 3,
    client_trigger_source: "DEFERRED_WORKER",
    upload_correlation_id: "CORR-001",
    uploaded_at: "2026-05-03T08:00:00Z",
    created_at: "2026-05-03T07:30:00Z",
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
          recommended_action_summary: [],
          latest_shipment_gate_result_summary: [],
          production_status_summary: [],
          devices: [
            {
              device_serial_number: "SHIP-001",
              device_type: "DEMO-OPS",
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
              latest_shipment_gate_decision: null,
              primary_blocking_code: null,
              primary_blocking_message: null,
              recommended_action: "MARK_READY_FOR_SHIPMENT",
              blocking_reasons: [],
            },
          ],
        }),
      });
      return;
    }

    if (
      await fulfillServiceSessionDetailRequests(url.pathname, route, {
        sessionId: "SVC-SESSION-001",
        queueSessions: [
          {
            id: "svc-row-001",
            ...serviceSession,
            package_path: "/tmp/SVC-SESSION-001.zip",
            package_hash: "hash-001",
          },
        ],
        sessionDetails: {
          id: "svc-row-001",
          ...serviceSession,
          package_path: "/tmp/SVC-SESSION-001.zip",
          package_hash: "hash-001",
        },
        auditEvents: [
          buildServiceSessionAuditEvent({
            entity_id: "SVC-SESSION-001",
            operator_id: "TECH-001",
            payload: {
              upload_count: 3,
              package_hash: "hash-001",
              upload_correlation_id: "CORR-001",
              client_attempt_id: "ATT-001",
              client_attempt_number: 3,
              client_trigger_source: "DEFERRED_WORKER",
            },
          }),
        ],
      })
    ) {
      return;
    }

    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Commissioning i serwis" }).click();
  await page.getByRole("button", { name: "SVC-SESSION-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: "Pełna strona" }).click();

  await expect(page).toHaveURL(/\/service-sessions\/SVC-SESSION-001/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "SVC-SESSION-001" }),
  ).toBeVisible();
  await expect(
    page.getByText("Pełny widok sesji commissioning"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /dashboardu/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Pokaż urządzenie" }),
  ).toHaveAttribute("href", /\/devices\/SVC-DEVICE-001\?view=service/);
  await expect(
    page.getByRole("link", {
      name: /^Pokaz sesje z co najmniej tyloma uploadami 3\+ uploady/i,
    }),
  ).toHaveAttribute("href", /svc_min_upload_count=3/);

  await page.reload();

  await expect(page).toHaveURL(/\/service-sessions\/SVC-SESSION-001/);
  await expect(
    page.getByRole("heading", { name: "SVC-SESSION-001" }),
  ).toBeVisible();

  await page.getByRole("link", { name: /dashboardu/i }).click();

  await expect(page).toHaveURL(/view=service/);
  await expect(page).toHaveURL(/svc_session_id=SVC-SESSION-001/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("dashboard jumps from commissioning sync audit to a filtered service queue", async ({
  page,
}) => {
  const serviceSession = buildServiceSession({
    session_id: "SVC-SESSION-001",
    device_serial_number: "SVC-DEVICE-001",
    technician_id: "TECH-001",
    result: "PASS",
    firmware_version: "1.0.9",
    bootloader_version: "0.9.9",
    upload_count: 3,
    client_attempt_id: "ATT-001",
    client_attempt_number: 3,
    client_trigger_source: "DEFERRED_WORKER",
    upload_correlation_id: "CORR-001",
    uploaded_at: "2026-05-03T08:00:00Z",
    created_at: "2026-05-03T07:30:00Z",
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
          recommended_action_summary: [],
          latest_shipment_gate_result_summary: [],
          production_status_summary: [],
          devices: [
            {
              device_serial_number: "SHIP-001",
              device_type: "DEMO-OPS",
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
              latest_shipment_gate_decision: null,
              primary_blocking_code: null,
              primary_blocking_message: null,
              recommended_action: "MARK_READY_FOR_SHIPMENT",
              blocking_reasons: [],
            },
          ],
        }),
      });
      return;
    }

    if (
      await fulfillServiceSessionDetailRequests(url.pathname, route, {
        sessionId: "SVC-SESSION-001",
        queueSessions: [
          {
            id: "svc-row-001",
            ...serviceSession,
            package_path: "/tmp/SVC-SESSION-001.zip",
            package_hash: "hash-001",
          },
        ],
        sessionDetails: {
          id: "svc-row-001",
          ...serviceSession,
          package_path: "/tmp/SVC-SESSION-001.zip",
          package_hash: "hash-001",
        },
        auditEvents: [
          buildServiceSessionAuditEvent({
            entity_id: "SVC-SESSION-001",
            operator_id: "TECH-001",
            payload: {
              upload_count: 3,
              package_hash: "hash-001",
              upload_correlation_id: "CORR-001",
              client_attempt_id: "ATT-001",
              client_attempt_number: 3,
              client_trigger_source: "DEFERRED_WORKER",
            },
          }),
        ],
      })
    ) {
      return;
    }

    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Commissioning i serwis" }).click();
  await page.getByRole("button", { name: "SVC-SESSION-001" }).click();
  await page.getByRole("dialog").getByRole("link", { name: /strona/i }).click();

  await expect(page).toHaveURL(/\/service-sessions\/SVC-SESSION-001/);

  await page
    .getByRole("link", { name: /korelacja z audytu/i })
    .click();

  await expect(page).toHaveURL(/\/\?view=service/);
  await expect(page).toHaveURL(/svc_upload_correlation_id=CORR-001/);
  await expect(page).not.toHaveURL(/svc_session_id=/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Commissioning i serwis" }),
  ).toHaveClass(/is-active/);
  await expect(
    page.getByRole("textbox", { name: "Correlation ID uploadu" }),
  ).toHaveValue("CORR-001");
  await expect(
    page.getByRole("textbox", { name: "Attempt ID" }),
  ).toHaveValue("");
});

test("dashboard jumps from commissioning sync audit to reuploaded service queue", async ({
  page,
}) => {
  const serviceSession = buildServiceSession({
    session_id: "SVC-SESSION-001",
    device_serial_number: "SVC-DEVICE-001",
    technician_id: "TECH-001",
    result: "PASS",
    firmware_version: "1.0.9",
    bootloader_version: "0.9.9",
    upload_count: 3,
    client_attempt_id: "ATT-001",
    client_attempt_number: 3,
    client_trigger_source: "DEFERRED_WORKER",
    upload_correlation_id: "CORR-001",
    uploaded_at: "2026-05-03T08:00:00Z",
    created_at: "2026-05-03T07:30:00Z",
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
          recommended_action_summary: [],
          latest_shipment_gate_result_summary: [],
          production_status_summary: [],
          devices: [
            {
              device_serial_number: "SHIP-001",
              device_type: "DEMO-OPS",
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
              latest_shipment_gate_decision: null,
              primary_blocking_code: null,
              primary_blocking_message: null,
              recommended_action: "MARK_READY_FOR_SHIPMENT",
              blocking_reasons: [],
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/service-sessions/queue") {
      const onlyReuploaded =
        url.searchParams.get("only_reuploaded") === "true";
      const sessions = [
        {
          id: "svc-row-001",
          ...serviceSession,
          package_path: "/tmp/SVC-SESSION-001.zip",
          package_hash: "hash-001",
        },
      ];

      await fulfillServiceSessionsQueue(
        route,
        sessions,
        onlyReuploaded ? { only_reuploaded: true } : {},
      );
      return;
    }

    if (
      await fulfillServiceSessionDetailRequests(url.pathname, route, {
        sessionId: "SVC-SESSION-001",
        sessionDetails: {
          id: "svc-row-001",
          ...serviceSession,
          package_path: "/tmp/SVC-SESSION-001.zip",
          package_hash: "hash-001",
        },
        auditEvents: [
          buildServiceSessionAuditEvent({
            entity_id: "SVC-SESSION-001",
            operator_id: "TECH-001",
            payload: {
              upload_count: 3,
              package_hash: "hash-001",
              upload_correlation_id: "CORR-001",
              client_attempt_id: "ATT-001",
              client_attempt_number: 3,
              client_trigger_source: "DEFERRED_WORKER",
            },
          }),
        ],
      })
    ) {
      return;
    }

    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Commissioning i serwis" }).click();
  await page.getByRole("button", { name: "SVC-SESSION-001" }).click();
  await page.getByRole("dialog").getByRole("link", { name: /strona/i }).click();

  await expect(page).toHaveURL(/\/service-sessions\/SVC-SESSION-001/);

  await page
    .getByRole("link", { name: /reuploadowane sesje z audytu/i })
    .click();

  await expect(page).toHaveURL(/\/\?view=service/);
  await expect(page).toHaveURL(/svc_only_reuploaded=true/);
  await expect(page).not.toHaveURL(/svc_session_id=/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Commissioning i serwis" }),
  ).toHaveClass(/is-active/);
  await expect(
    page.getByRole("checkbox", { name: "Tylko reuploadowane" }),
  ).toBeChecked();
});

test("dashboard jumps from BOM details to a filtered shipment queue", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByLabel("Typ urządzenia").fill("DEMO-E2E");
  await page.getByRole("button", { name: SEEDED_ASSEMBLY_SERIAL }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: "Pełna strona" }).click();

  await expect(page).toHaveURL(/\/devices\/ASM-(?:LOCAL|E2E)-/);
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

test("dashboard shows commissioning sessions in device details", async ({
  page,
}) => {
  const serviceSession = buildServiceSession({
    session_id: "SVC-9001",
    device_serial_number: "SVC-001",
    technician_id: "TECH-001",
    result: "PASS",
    firmware_version: "1.2.4",
    bootloader_version: "0.9.8",
    upload_count: 2,
    client_attempt_id: "SYNC-UPLOAD-0002",
    client_attempt_number: 2,
    client_trigger_source: "AUTO_NETWORK",
    upload_correlation_id: "SRV-UP-SVC001",
    uploaded_at: "2026-05-01T10:30:00Z",
    created_at: "2026-05-01T10:00:00Z",
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_devices: 1,
          ready_count: 0,
          blocked_count: 1,
          returned_count: 1,
          offset: 0,
          limit: 100,
          has_more: false,
          next_offset: null,
          filters: {},
          blocking_summary: [],
          primary_blocking_summary: [],
          recommended_action_summary: [],
          latest_shipment_gate_result_summary: [],
          production_status_summary: [],
          devices: [
            {
              device_serial_number: "SVC-001",
              device_type: "DEMO-SVC",
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
              can_transition_to_ready_for_shipment: false,
              latest_shipment_gate_decision: null,
              primary_blocking_code: null,
              primary_blocking_message: null,
              recommended_action: "RESOLVE_COMPONENT_QUALITY",
              blocking_reasons: [],
            },
          ],
        }),
      });
      return;
    }

    if (
      await fulfillDeviceDetailsRequests(url.pathname, route, {
        deviceSerialNumber: "SVC-001",
        shipmentReadiness: {
          device_serial_number: "SVC-001",
          device_type: "DEMO-SVC",
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
            component_coverage: [],
            blocking_reason: null,
          },
          can_transition_to_ready_for_shipment: false,
          latest_shipment_gate_decision: null,
          primary_blocking_code: null,
          primary_blocking_message: null,
          recommended_action: "RESOLVE_COMPONENT_QUALITY",
          blocking_reasons: [],
          blocking_checks: [],
        },
        componentQuality: {
          device_serial_number: "SVC-001",
          device_type: "DEMO-SVC",
          device_variant_code: "DEFAULT",
          production_status: "FINAL_TEST_PASSED",
          device_created_at: "2026-05-01T08:00:00Z",
          device_updated_at: "2026-05-01T09:00:00Z",
          stale_bucket: "LT_24H",
          total_installed_components: 1,
          passing_components: 1,
          blocked_components: 0,
          passes_component_quality_gate: true,
          primary_quality_status: "PASS",
          primary_blocking_component_type: null,
          primary_blocking_component_serial_number: null,
          recommended_action: "NO_ACTION",
          components: [],
        },
        serviceSessions: [
          {
            id: "svc-db-1",
            ...serviceSession,
            package_path: "/tmp/service-package.zip",
            package_hash: "hash-svc-001",
          },
        ],
        auditEvents: {
          body: [],
        },
        shipmentGateHistory: [],
      })
    ) {
      return;
    }

    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "SVC-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("heading", { name: "Commissioning i serwis" }),
  ).toBeVisible();
  await expect(drawer.getByText("SVC-9001")).toBeVisible();
  await expect(drawer.getByText(/Uploadów: 2/)).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Pobierz paczkę ZIP" }),
  ).toHaveAttribute("href", "/api/service-sessions/SVC-9001/package");
});
