import { expect, test } from "@playwright/test";

import { fulfillJson } from "./dashboard.e2e-helpers";

const mockedShipmentQueue = {
  total_devices: 0,
  ready_count: 0,
  blocked_count: 0,
  returned_count: 0,
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
  devices: [],
};

const mockedComponentQueue = {
  total_devices: 2,
  devices_with_issues: 2,
  returned_count: 2,
  offset: 0,
  limit: 100,
  has_more: false,
  next_offset: null,
  filters: {},
  quality_status_summary: [
    {
      quality_status: "QC_NOT_PASSED",
      component_count: 1,
      device_count: 1,
    },
    {
      quality_status: "CRITICAL_NCR_OPEN",
      component_count: 1,
      device_count: 1,
    },
  ],
  variant_code_summary: [{ variant_code: "DEFAULT", device_count: 2 }],
  production_status_summary: [
    {
      production_status: "FINAL_TEST_PASSED",
      device_count: 2,
    },
  ],
  primary_quality_status_summary: [
    {
      primary_quality_status: "QC_NOT_PASSED",
      device_count: 1,
    },
    {
      primary_quality_status: "CRITICAL_NCR_OPEN",
      device_count: 1,
    },
  ],
  component_quality_gate_summary: [
    {
      passes_component_quality_gate: false,
      device_count: 2,
    },
  ],
  staleness_summary: [{ stale_bucket: "D1_TO_D3", device_count: 2 }],
  component_type_summary: [
    {
      component_type: "FAN_MODULE",
      component_count: 1,
      device_count: 1,
    },
    {
      component_type: "IO_MODULE",
      component_count: 1,
      device_count: 1,
    },
  ],
  blocking_component_type_summary: [
    {
      component_type: "FAN_MODULE",
      component_count: 1,
      device_count: 1,
    },
    {
      component_type: "IO_MODULE",
      component_count: 1,
      device_count: 1,
    },
  ],
  primary_blocking_component_type_summary: [
    {
      component_type: "FAN_MODULE",
      device_count: 1,
    },
    {
      component_type: "IO_MODULE",
      device_count: 1,
    },
  ],
  recommended_action_summary: [
    {
      recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      device_count: 1,
    },
    {
      recommended_action: "RESOLVE_COMPONENT_NCR",
      device_count: 1,
    },
  ],
  devices: [
    {
      device_serial_number: "CQ-MOCK-001",
      device_type: "DEMO-E2E",
      device_variant_code: "DEFAULT",
      production_status: "FINAL_TEST_PASSED",
      device_created_at: "2026-05-01T08:00:00Z",
      device_updated_at: "2026-05-01T09:00:00Z",
      stale_bucket: "D1_TO_D3",
      total_installed_components: 2,
      passing_components: 1,
      blocked_components: 1,
      passes_component_quality_gate: false,
      primary_quality_status: "QC_NOT_PASSED",
      primary_blocking_component_type: "FAN_MODULE",
      primary_blocking_component_serial_number: "FAN-001",
      recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
    },
    {
      device_serial_number: "CN-MOCK-001",
      device_type: "DEMO-E2E",
      device_variant_code: "DEFAULT",
      production_status: "FINAL_TEST_PASSED",
      device_created_at: "2026-05-01T08:00:00Z",
      device_updated_at: "2026-05-01T09:30:00Z",
      stale_bucket: "D1_TO_D3",
      total_installed_components: 2,
      passing_components: 1,
      blocked_components: 1,
      passes_component_quality_gate: false,
      primary_quality_status: "CRITICAL_NCR_OPEN",
      primary_blocking_component_type: "IO_MODULE",
      primary_blocking_component_serial_number: "IO-001",
      recommended_action: "RESOLVE_COMPONENT_NCR",
    },
  ],
};

test("dashboard flushes component text filter immediately on Enter", async ({
  page,
}) => {
  let componentRequests = 0;
  let resolveFilteredRequest!: () => void;
  const filteredRequestSeen = new Promise<void>((resolve) => {
    resolveFilteredRequest = resolve;
  });

  await page.route("**/api/shipment-readiness**", async (route) => {
    await fulfillJson(route, mockedShipmentQueue);
  });

  await page.route("**/api/component-quality**", async (route) => {
    componentRequests += 1;
    const requestUrl = new URL(route.request().url());

    if (requestUrl.searchParams.get("blocking_component_type") === "FAN_MODULE") {
      resolveFilteredRequest();
      await fulfillJson(route, {
        ...mockedComponentQueue,
        total_devices: 1,
        devices_with_issues: 1,
        returned_count: 1,
        filters: { blocking_component_type: "FAN_MODULE" },
        component_type_summary: [mockedComponentQueue.component_type_summary[0]],
        blocking_component_type_summary: [
          mockedComponentQueue.blocking_component_type_summary[0],
        ],
        primary_blocking_component_type_summary: [
          mockedComponentQueue.primary_blocking_component_type_summary[0],
        ],
        recommended_action_summary: [
          mockedComponentQueue.recommended_action_summary[0],
        ],
        devices: [mockedComponentQueue.devices[0]],
      });
      return;
    }

    await fulfillJson(route, mockedComponentQueue);
  });

  await page.goto("/");
  await expect(page.getByText("API OK")).toBeVisible();

  await page.getByRole("button", { name: "Komponenty" }).click();
  await expect(page.locator(".table-card tbody tr")).toHaveCount(2);

  const blockingComponentInput = page.locator(".filters-card input").nth(2);
  await blockingComponentInput.fill("FAN_MODULE");

  expect(componentRequests).toBe(1);

  const requestAfterEnter = Promise.race([
    filteredRequestSeen.then(() => "request"),
    page.waitForTimeout(200).then(() => "timeout"),
  ]);

  await blockingComponentInput.press("Enter");

  expect(await requestAfterEnter).toBe("request");
  await expect(page.locator(".table-card tbody tr")).toHaveCount(1);
  await expect(page.getByText("CQ-MOCK-001")).toBeVisible();
  await expect(page.getByText("CN-MOCK-001")).toHaveCount(0);
});
