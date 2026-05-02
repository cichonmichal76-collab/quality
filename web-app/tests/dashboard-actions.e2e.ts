import { expect, test } from "@playwright/test";

const shipmentQueuePayload = {
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
    { recommended_action: "MARK_READY_FOR_SHIPMENT", device_count: 1 },
  ],
  latest_shipment_gate_result_summary: [{ result: "PASS", device_count: 1 }],
  production_status_summary: [
    { production_status: "FINAL_TEST_PASSED", device_count: 1 },
  ],
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
      blocking_checks: [],
    },
  ],
};

const shipmentDetailsPayload = {
  ...shipmentQueuePayload.devices[0],
  bom_compliance: {
    device_serial_number: "SHIP-001",
    device_type: "DEMO-OPS",
    device_variant_code: "DEFAULT",
    production_status: "FINAL_TEST_PASSED",
    resolution_source: "BOUND_TEMPLATE",
    resolved_template_id: "BOM-01",
    resolved_variant_code: "DEFAULT",
    resolved_version: "1.2",
    resolved_status: "ACTIVE",
    resolved_is_active: true,
    resolved_is_effective_now: true,
    is_bom_resolved: true,
    passes_bom_gate: true,
    installed_component_count: 1,
    missing_required_components: [],
    over_installed_components: [],
    unexpected_component_types: [],
    component_coverage: [
      {
        component_type: "CONTROL_PCB",
        substitution_group: null,
        allowed_component_types: null,
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
    ],
    blocking_reason: null,
  },
};

const shipmentDetailsWithDeviceNcrPayload = {
  ...shipmentDetailsPayload,
  has_critical_open_ncr: true,
  critical_open_ncr_ids: ["NCR-DEVICE-001"],
  recommended_action: "RESOLVE_CRITICAL_NCR",
  blocking_reasons: ["CRITICAL_OPEN_NCR"],
  primary_blocking_code: "CRITICAL_OPEN_NCR",
  primary_blocking_message: "Urządzenie ma otwartą krytyczną NCR",
  blocking_checks: [
    {
      code: "CRITICAL_OPEN_NCR",
      is_blocking: true,
      message: "Urządzenie ma otwartą krytyczną NCR",
      details: ["NCR-DEVICE-001"],
    },
  ],
};

const shipmentDetailsWithoutDeviceNcrPayload = {
  ...shipmentDetailsWithDeviceNcrPayload,
  has_critical_open_ncr: false,
  critical_open_ncr_ids: [],
  recommended_action: "MARK_READY_FOR_SHIPMENT",
  blocking_reasons: [],
  primary_blocking_code: null,
  primary_blocking_message: null,
  blocking_checks: [],
};

const componentDetailsPayload = {
  device_serial_number: "SHIP-001",
  device_type: "DEMO-OPS",
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
  components: [
    {
      component_serial_number: "CTRL-100",
      component_type: "CONTROL_PCB",
      child_barcode_value: "BC-CTRL-100",
      installed_at: "2026-05-01T08:30:00Z",
      installed_by: "OP-01",
      workstation_id: "WS-01",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: true,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      blocks_shipment: false,
      quality_status: "PASS",
    },
  ],
};

const shipmentReadyQueuePayload = {
  ...shipmentQueuePayload,
  production_status_summary: [
    { production_status: "READY_FOR_SHIPMENT", device_count: 1 },
  ],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      production_status: "READY_FOR_SHIPMENT",
      device_updated_at: "2026-05-01T10:15:00Z",
    },
  ],
};

const shipmentShippedQueuePayload = {
  ...shipmentQueuePayload,
  production_status_summary: [{ production_status: "SHIPPED", device_count: 1 }],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      production_status: "SHIPPED",
      device_updated_at: "2026-05-01T11:00:00Z",
    },
  ],
};

test("dashboard marks device ready for shipment from the details drawer", async ({
  page,
}) => {
  let markedReady = false;
  let patchRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          markedReady
            ? shipmentReadyQueuePayload
            : shipmentQueuePayload,
        ),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...shipmentDetailsPayload,
          production_status: markedReady ? "READY_FOR_SHIPMENT" : "FINAL_TEST_PASSED",
          device_updated_at: markedReady
            ? "2026-05-01T10:15:00Z"
            : "2026-05-01T09:00:00Z",
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_PASSED",
            result: "PASS",
            message: markedReady ? "Shipment gate passed" : "Ready",
            recommended_action: "MARK_READY_FOR_SHIPMENT",
            created_at: markedReady
              ? "2026-05-01T10:15:00Z"
              : "2026-05-01T09:05:00Z",
          },
        }),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/component-quality") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(componentDetailsPayload),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/shipment-gate-history") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          markedReady
            ? [
                {
                  id: "AUD-3",
                  event_type: "SHIPMENT_GATE_PASSED",
                  entity_type: "DEVICE",
                  entity_id: "SHIP-001",
                  work_session_id: "WS-12",
                  operator_id: "OP-12",
                  workstation_id: "ST-12",
                  machine_id: null,
                  result: "PASS",
                  message: "Shipment gate passed",
                  payload: { requested_status: "READY_FOR_SHIPMENT" },
                  created_at: "2026-05-01T10:15:00Z",
                },
              ]
            : [],
        ),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/status" && request.method() === "PATCH") {
      patchRequests += 1;
      expect(request.postDataJSON()).toEqual({
        production_status: "READY_FOR_SHIPMENT",
      });
      markedReady = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "DEV-001",
          device_serial_number: "SHIP-001",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          hardware_version: null,
          firmware_version: null,
          bootloader_version: null,
          created_by: null,
          production_status: "READY_FOR_SHIPMENT",
          created_at: "2026-05-01T08:00:00Z",
          updated_at: "2026-05-01T10:15:00Z",
        }),
      });
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "SHIP-001" }).click();

  const drawer = page.getByRole("dialog");
  const actionButton = drawer.getByRole("button", {
    name: "Oznacz gotowe do wysyłki",
  });
  await expect(actionButton).toBeVisible();

  await actionButton.click();

  await expect(
    drawer.getByText("Urządzenie oznaczone jako gotowe do wysyłki."),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Oznacz gotowe do wysyłki" }),
  ).toHaveCount(0);
  expect(patchRequests).toBe(1);
});

test("dashboard marks ready device as shipped from the details drawer", async ({
  page,
}) => {
  let shipped = false;
  let patchRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          shipped ? shipmentShippedQueuePayload : shipmentReadyQueuePayload,
        ),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...shipmentDetailsPayload,
          production_status: shipped ? "SHIPPED" : "READY_FOR_SHIPMENT",
          device_updated_at: shipped
            ? "2026-05-01T11:00:00Z"
            : "2026-05-01T10:15:00Z",
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_PASSED",
            result: "PASS",
            message: "Shipment gate passed",
            recommended_action: "MARK_READY_FOR_SHIPMENT",
            created_at: "2026-05-01T10:15:00Z",
          },
        }),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/component-quality") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(componentDetailsPayload),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/shipment-gate-history") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          shipped
            ? [
                {
                  id: "AUD-4",
                  event_type: "DEVICE_STATUS_UPDATED",
                  entity_type: "DEVICE",
                  entity_id: "SHIP-001",
                  work_session_id: null,
                  operator_id: null,
                  workstation_id: null,
                  machine_id: null,
                  result: "SHIPPED",
                  message: "Device marked as shipped",
                  payload: { requested_status: "SHIPPED" },
                  created_at: "2026-05-01T11:00:00Z",
                },
              ]
            : [
                {
                  id: "AUD-3",
                  event_type: "SHIPMENT_GATE_PASSED",
                  entity_type: "DEVICE",
                  entity_id: "SHIP-001",
                  work_session_id: "WS-12",
                  operator_id: "OP-12",
                  workstation_id: "ST-12",
                  machine_id: null,
                  result: "PASS",
                  message: "Shipment gate passed",
                  payload: { requested_status: "READY_FOR_SHIPMENT" },
                  created_at: "2026-05-01T10:15:00Z",
                },
              ],
        ),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/status" && request.method() === "PATCH") {
      patchRequests += 1;
      expect(request.postDataJSON()).toEqual({
        production_status: "SHIPPED",
      });
      shipped = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "DEV-001",
          device_serial_number: "SHIP-001",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          hardware_version: null,
          firmware_version: null,
          bootloader_version: null,
          created_by: null,
          production_status: "SHIPPED",
          created_at: "2026-05-01T08:00:00Z",
          updated_at: "2026-05-01T11:00:00Z",
        }),
      });
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "SHIP-001" }).click();

  const drawer = page.getByRole("dialog");
  const actionButton = drawer.getByRole("button", {
    name: "Oznacz jako wysłane",
  });
  await expect(actionButton).toBeVisible();

  await actionButton.click();

  await expect(drawer.getByText("Urządzenie oznaczone jako wysłane.")).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Oznacz jako wysłane" }),
  ).toHaveCount(0);
  expect(patchRequests).toBe(1);
});

test("dashboard closes device critical NCRs from the details drawer", async ({
  page,
}) => {
  let deviceNcrClosed = false;
  let patchRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(shipmentQueuePayload),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          deviceNcrClosed
            ? shipmentDetailsWithoutDeviceNcrPayload
            : shipmentDetailsWithDeviceNcrPayload,
        ),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/component-quality") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(componentDetailsPayload),
      });
      return;
    }

    if (path === "/api/devices/SHIP-001/shipment-gate-history") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (
      path === "/api/nonconformities/NCR-DEVICE-001" &&
      request.method() === "PATCH"
    ) {
      patchRequests += 1;
      expect(request.postDataJSON()).toEqual({
        status: "CLOSED",
        corrective_action: "Zamknięte z panelu operacyjnego dla SHIP-001.",
      });
      deviceNcrClosed = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "NCR-ROW-001",
          ncr_id: "NCR-DEVICE-001",
          device_serial_number: "SHIP-001",
          component_serial_number: null,
          process_stage: "FINAL_TEST",
          description: "Otwarte NCR urządzenia",
          severity: "CRITICAL",
          detected_by: "OP-10",
          corrective_action: "Zamknięte z panelu operacyjnego dla SHIP-001.",
          status: "CLOSED",
          detected_at: "2026-05-01T09:10:00Z",
          closed_at: "2026-05-01T09:45:00Z",
        }),
      });
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "SHIP-001" }).click();

  const drawer = page.getByRole("dialog");
  const actionButton = drawer.getByRole("button", {
    name: "Zamknij krytyczne NCR urządzenia",
  });
  await expect(actionButton).toBeVisible();

  await actionButton.click();

  await expect(
    drawer.getByText("Zamknięto 1 krytyczne NCR urządzenia."),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Zamknij krytyczne NCR urządzenia" }),
  ).toHaveCount(0);
  expect(patchRequests).toBe(1);
});
