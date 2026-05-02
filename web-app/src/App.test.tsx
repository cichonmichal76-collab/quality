import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type {
  AuditEvent,
  DeviceComponentQuality,
  DeviceComponentQualityQueue,
  DeviceShipmentQueue,
  DeviceShipmentReadiness,
} from "./api";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const VIEW_STORAGE_KEY = "servicetrace.web.activeView";
const SHIPMENT_FILTERS_STORAGE_KEY = "servicetrace.web.shipmentFilters";
const COMPONENT_FILTERS_STORAGE_KEY = "servicetrace.web.componentFilters";

const shipmentPayload: DeviceShipmentQueue = {
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
    },
  ],
};

const componentPayload: DeviceComponentQualityQueue = {
  total_devices: 1,
  devices_with_issues: 1,
  returned_count: 1,
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
  ],
  variant_code_summary: [{ variant_code: "DEFAULT", device_count: 1 }],
  production_status_summary: [
    {
      production_status: "FINAL_TEST_PASSED",
      device_count: 1,
    },
  ],
  primary_quality_status_summary: [
    {
      primary_quality_status: "QC_NOT_PASSED",
      device_count: 1,
    },
  ],
  component_quality_gate_summary: [
    {
      passes_component_quality_gate: false,
      device_count: 1,
    },
  ],
  staleness_summary: [{ stale_bucket: "D1_TO_D3", device_count: 1 }],
  component_type_summary: [
    {
      component_type: "FAN_MODULE",
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
  ],
  primary_blocking_component_type_summary: [
    {
      component_type: "FAN_MODULE",
      device_count: 1,
    },
  ],
  recommended_action_summary: [
    {
      recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      device_count: 1,
    },
  ],
  devices: [
    {
      device_serial_number: "COMP-001",
      device_type: "DEMO-OPS",
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
  ],
};

const shipmentDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentPayload.devices[0],
  has_critical_open_ncr: true,
  critical_open_ncr_ids: ["NCR-DEVICE-001"],
  bom_compliance: {
    ...shipmentPayload.devices[0].bom_compliance,
    device_serial_number: "SHIP-001",
    device_type: "DEMO-OPS",
    device_variant_code: "DEFAULT",
    production_status: "FINAL_TEST_PASSED",
    resolution_source: "BOUND_TEMPLATE",
    resolved_version: "1.2",
    resolved_status: "ACTIVE",
    resolved_is_active: true,
    resolved_is_effective_now: true,
    is_bom_resolved: true,
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
      {
        component_type: "FAN_MODULE",
        substitution_group: "AIRFLOW",
        allowed_component_types: ["FAN_MODULE", "FAN_MODULE_V2"],
        required_quantity: 1,
        installed_quantity: 0,
        is_required: true,
        status: "MISSING",
      },
    ],
    missing_required_components: ["FAN_MODULE"],
    blocking_reason: "Brak FAN_MODULE",
  },
  primary_blocking_code: "BOM_REQUIRED_COMPONENTS_MISSING",
  primary_blocking_message: "Brakuje FAN_MODULE",
  recommended_action: "COMPLETE_ASSEMBLY",
  blocking_reasons: ["FAN_MODULE", "Brak zamknięcia krytycznej NCR"],
  blocking_checks: [
    {
      code: "BOM_REQUIRED_COMPONENTS_MISSING",
      is_blocking: true,
      message: "Brak wymaganego komponentu FAN_MODULE",
      details: ["FAN_MODULE"],
    },
    {
      code: "CRITICAL_OPEN_NCR",
      is_blocking: true,
      message: "Urządzenie ma otwartą krytyczną NCR",
      details: ["NCR-DEVICE-001"],
    },
  ],
};

const shipmentComponentDetailsPayload: DeviceComponentQuality = {
  device_serial_number: "SHIP-001",
  device_type: "DEMO-OPS",
  device_variant_code: "DEFAULT",
  production_status: "FINAL_TEST_PASSED",
  device_created_at: "2026-05-01T08:00:00Z",
  device_updated_at: "2026-05-01T09:15:00Z",
  stale_bucket: "D1_TO_D3",
  total_installed_components: 2,
  passing_components: 1,
  blocked_components: 1,
  passes_component_quality_gate: false,
  primary_quality_status: "QC_NOT_PASSED",
  primary_blocking_component_type: "FAN_MODULE",
  primary_blocking_component_serial_number: "FAN-900",
  recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
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
    {
      component_serial_number: "FAN-900",
      component_type: "FAN_MODULE",
      child_barcode_value: "BC-FAN-900",
      installed_at: "2026-05-01T08:40:00Z",
      installed_by: "OP-02",
      workstation_id: "WS-02",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: false,
      has_critical_open_ncr: true,
      critical_open_ncr_ids: ["NCR-COMP-001"],
      blocks_shipment: true,
      quality_status: "QC_NOT_PASSED",
    },
  ],
};

const shipmentGateHistoryPayload: AuditEvent[] = [
  {
    id: "AUD-1",
    event_type: "SHIPMENT_GATE_BLOCKED",
    entity_type: "DEVICE",
    entity_id: "SHIP-001",
    work_session_id: "WS-10",
    operator_id: "OP-10",
    workstation_id: "ST-10",
    machine_id: null,
    result: "BLOCKED",
    message: "Gate zablokowany przez brak FAN_MODULE",
    payload: { requested_status: "READY_FOR_SHIPMENT" },
    created_at: "2026-05-01T09:20:00Z",
  },
  {
    id: "AUD-2",
    event_type: "SHIPMENT_GATE_PASSED",
    entity_type: "DEVICE",
    entity_id: "SHIP-001",
    work_session_id: "WS-11",
    operator_id: "OP-11",
    workstation_id: "ST-11",
    machine_id: null,
    result: "PASS",
    message: "Gate przeszedł po naprawie",
    payload: { requested_status: "READY_FOR_SHIPMENT" },
    created_at: "2026-05-01T10:00:00Z",
  },
];

const shipmentReadyQueuePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  production_status_summary: [
    {
      production_status: "READY_FOR_SHIPMENT",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...shipmentPayload.devices[0],
      production_status: "READY_FOR_SHIPMENT",
      device_updated_at: "2026-05-01T10:15:00Z",
    },
  ],
};

const shipmentActionDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentPayload.devices[0],
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
  primary_blocking_code: null,
  primary_blocking_message: null,
  recommended_action: "MARK_READY_FOR_SHIPMENT",
  blocking_reasons: [],
  blocking_checks: [],
};

const shipmentActionComponentDetailsPayload: DeviceComponentQuality = {
  device_serial_number: "SHIP-001",
  device_type: "DEMO-OPS",
  device_variant_code: "DEFAULT",
  production_status: "FINAL_TEST_PASSED",
  device_created_at: "2026-05-01T08:00:00Z",
  device_updated_at: "2026-05-01T09:15:00Z",
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

const shipmentDetailsReadyPayload: DeviceShipmentReadiness = {
  ...shipmentActionDetailsPayload,
  production_status: "READY_FOR_SHIPMENT",
  device_updated_at: "2026-05-01T10:15:00Z",
  latest_shipment_gate_decision: {
    event_type: "SHIPMENT_GATE_PASSED",
    result: "PASS",
    message: "Shipment gate passed",
    recommended_action: "MARK_READY_FOR_SHIPMENT",
    created_at: "2026-05-01T10:15:00Z",
  },
};

const shipmentGateHistoryReadyPayload: AuditEvent[] = [
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
  ...shipmentGateHistoryPayload,
];

const paginatedShipmentPageOnePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  total_devices: 3,
  ready_count: 2,
  blocked_count: 1,
  returned_count: 1,
  limit: 1,
  has_more: true,
  next_offset: 1,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-001",
    },
  ],
};

const paginatedShipmentPageTwoPayload: DeviceShipmentQueue = {
  ...paginatedShipmentPageOnePayload,
  offset: 1,
  next_offset: 2,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-002",
      device_updated_at: "2026-05-01T10:00:00Z",
    },
  ],
};

const paginatedComponentPageOnePayload: DeviceComponentQualityQueue = {
  ...componentPayload,
  total_devices: 2,
  devices_with_issues: 2,
  returned_count: 1,
  limit: 1,
  has_more: true,
  next_offset: 1,
  devices: [
    {
      ...componentPayload.devices[0],
      device_serial_number: "COMP-001",
    },
  ],
};

const paginatedComponentPageTwoPayload: DeviceComponentQualityQueue = {
  ...paginatedComponentPageOnePayload,
  offset: 1,
  has_more: false,
  next_offset: null,
  devices: [
    {
      ...componentPayload.devices[0],
      device_serial_number: "COMP-002",
      primary_blocking_component_serial_number: "FAN-002",
    },
  ],
};

const emptyComponentPayload: DeviceComponentQualityQueue = {
  ...componentPayload,
  total_devices: 0,
  devices_with_issues: 0,
  returned_count: 0,
  devices: [],
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
};

const staleShipmentPayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-OLD",
    },
  ],
};

const freshShipmentPayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-NEW",
      device_updated_at: "2026-05-01T11:00:00Z",
    },
  ],
};

function createJsonResponse(
  payload: unknown,
  init: { status?: number; statusText?: string } = {},
): Response {
  const status = init.status ?? 200;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? (status >= 200 && status < 300 ? "OK" : "Error"),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function createDeferredResponse() {
  let resolveResponse!: (response: Response) => void;
  let rejectResponse!: (error?: unknown) => void;

  const promise = new Promise<Response>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });

  return {
    promise,
    resolveResponse,
    rejectResponse,
  };
}

function createErrorResponse(
  status: number,
  statusText: string,
  detail: string,
): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({ detail }),
    text: async () => detail,
  } as Response;
}

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders shipment queue data from API", async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(screen.getByText("API OK")).toBeInTheDocument();
    const shipmentActionsPanel = screen.getByText("Akcje operacyjne").closest("section");
    expect(shipmentActionsPanel).not.toBeNull();
    expect(
      within(shipmentActionsPanel as HTMLElement).getByText(/Oznacz gotowe do wys/i),
    ).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("switches to component view and renders component queue data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByText("FAN-001")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Główny status jakości" }),
    ).toBeInTheDocument();
    const componentActionsPanel = screen.getByText("Akcje operacyjne").closest("section");
    expect(componentActionsPanel).not.toBeNull();
    expect(
      within(componentActionsPanel as HTMLElement).getByText(
        /Uruchom QC komponentu \/ rework/i,
      ),
    ).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("opens device details drawer from shipment queue and renders fetched details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(shipmentDetailsPayload))
      .mockResolvedValueOnce(createJsonResponse(shipmentComponentDetailsPayload))
      .mockResolvedValueOnce(createJsonResponse(shipmentGateHistoryPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SHIP-001" })).toBeInTheDocument();
    expect(await screen.findByText(/Brak.*komponenty BOM/i)).toBeInTheDocument();
    expect(screen.getAllByText("FAN-900").length).toBeGreaterThan(0);
    expect(
      await screen.findByText("Gate zablokowany przez brak FAN_MODULE"),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/devices/SHIP-001/shipment-readiness",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/devices/SHIP-001/component-quality",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/devices/SHIP-001/shipment-gate-history?limit=10",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks device as ready for shipment from the details drawer", async () => {
    let readyMarked = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(readyMarked ? shipmentReadyQueuePayload : shipmentPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(
            readyMarked ? shipmentDetailsReadyPayload : shipmentActionDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(shipmentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(
          createJsonResponse(
            readyMarked ? shipmentGateHistoryReadyPayload : shipmentGateHistoryPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/status" && method === "PATCH") {
        readyMarked = true;
        return Promise.resolve(
          createJsonResponse({
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
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));
    const actionButton = await screen.findByRole("button", {
      name: "Oznacz gotowe do wysyłki",
    });
    fireEvent.click(actionButton);

    expect(
      await screen.findByText("Urządzenie oznaczone jako gotowe do wysyłki."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/SHIP-001/status",
        expect.objectContaining({
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ production_status: "READY_FOR_SHIPMENT" }),
        }),
      );
    });
    expect(
      screen.queryByRole("button", { name: "Oznacz gotowe do wysyłki" }),
    ).not.toBeInTheDocument();
  });

  it("shows action error in the details drawer when mark-ready is rejected", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(createJsonResponse(shipmentActionDetailsPayload));
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(shipmentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse(shipmentGateHistoryPayload));
      }

      if (url === "/api/devices/SHIP-001/status" && method === "PATCH") {
        return Promise.resolve(
          createJsonResponse(
            { detail: "Open critical NCR blocks shipment" },
            { status: 400, statusText: "Bad Request" },
          ),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Oznacz gotowe do wysyłki" }),
    );

    expect(
      await screen.findByText(/Open critical NCR blocks shipment/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Oznacz gotowe do wysyłki" }),
    ).toBeEnabled();
  });

  it("loads last active view from localStorage and persists tab changes", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Komponenty" })).toHaveClass("is-active");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Wysyłka" }));

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("shipment");
  });

  it("shows API error banner when request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createErrorResponse(503, "Service Unavailable", "backend temporarily down"),
      ),
    );

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/API .* problem/i);
    expect(alert).toHaveTextContent(
      "API 503 Service Unavailable: backend temporarily down",
    );
  });

  it("clears stale shipment data when api base becomes empty", async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("/api"), {
      target: { value: "" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Podaj bazowy adres API.");
    expect(screen.queryByText("SHIP-001")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores stale shipment success after a newer response wins", async () => {
    const firstResponse = createDeferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(createJsonResponse(freshShipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("np. ZSS-VENT"), {
      target: { value: "DEMO-OPS" },
    });

    expect(await screen.findByText("SHIP-NEW")).toBeInTheDocument();
    expect(screen.queryByText("SHIP-OLD")).not.toBeInTheDocument();

    await act(async () => {
      firstResponse.resolveResponse(createJsonResponse(staleShipmentPayload));
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-NEW")).toBeInTheDocument();
    expect(screen.queryByText("SHIP-OLD")).not.toBeInTheDocument();
  });

  it("ignores stale shipment error after a newer response wins", async () => {
    const firstResponse = createDeferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(createJsonResponse(freshShipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("np. ZSS-VENT"), {
      target: { value: "DEMO-OPS" },
    });

    expect(await screen.findByText("SHIP-NEW")).toBeInTheDocument();

    await act(async () => {
      firstResponse.resolveResponse(
        createErrorResponse(503, "Service Unavailable", "stale shipment failure"),
      );
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-NEW")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("debounces shipment text filters before sending request", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });

    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("DEMO-OPS");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.queryByText("Oczekuje na zastosowanie")).not.toBeInTheDocument();
  });

  it("flushes pending shipment text filters when a non-text filter changes", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_blocked=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("flushes pending shipment text filters before manual refresh", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const apiControls = screen.getByRole("region", { name: /API/i });
    fireEvent.click(within(apiControls).getByRole("button", { name: "Odśwież" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("flushes pending shipment text filters on Enter", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const deviceTypeInput = screen.getByLabelText("Typ urządzenia");
    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(deviceTypeInput, {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    fireEvent.keyDown(deviceTypeInput, { key: "Enter", code: "Enter" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.queryByText("Oczekuje na zastosowanie")).not.toBeInTheDocument();
  });

  it("flushes pending component text filters on Enter", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValue(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("COMP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const blockingComponentInput = screen.getByLabelText("Typ blokującego komponentu");
    fireEvent.change(blockingComponentInput, {
      target: { value: "FAN_MODULE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    fireEvent.keyDown(blockingComponentInput, { key: "Enter", code: "Enter" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?blocking_component_type=FAN_MODULE&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.queryByText("Oczekuje na zastosowanie")).not.toBeInTheDocument();
  });

  it("does not refetch component view when hidden shipment debounce settles", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValue(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText("np. ZSS-VENT"), {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("COMP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not refetch shipment view when hidden component debounce settles", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("COMP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByPlaceholderText("np. CONTROL_PCB"), {
      target: { value: "FAN_MODULE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /Wysy/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("applies shipment filters and keeps blocked and ready toggles exclusive", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "  DEMO-OPS  " },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_blocked=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByLabelText("Tylko gotowe"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_ready=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    expect(screen.getByLabelText("Tylko zablokowane")).not.toBeChecked();
    expect(screen.getByLabelText("Tylko gotowe")).toBeChecked();
  });

  it("clears incompatible shipment filters when only ready is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Główna blokada"), {
      target: { value: "FINAL_TEST_NOT_PASSED" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Akcja"), {
      target: { value: "COMPLETE_ASSEMBLY" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByLabelText("Tylko gotowe"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?only_ready=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    expect(screen.getByLabelText("Główna blokada")).toHaveValue("");
    expect(screen.getByLabelText("Akcja")).toHaveValue("");
    expect(screen.getByLabelText("Tylko gotowe")).toBeChecked();
    expect(screen.getByLabelText("Tylko zablokowane")).not.toBeChecked();
  });

  it("disables incompatible shipment filter controls when only ready is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Tylko gotowe"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText("Główna blokada")).toBeDisabled();

    const actionSelect = screen.getByLabelText("Akcja") as HTMLSelectElement;
    const readyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "MARK_READY_FOR_SHIPMENT",
    );
    const assemblyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "COMPLETE_ASSEMBLY",
    );

    if (!readyOption || !assemblyOption) {
      throw new Error("Expected shipment action options to exist.");
    }

    expect(readyOption.disabled).toBe(false);
    expect(assemblyOption.disabled).toBe(true);
  });

  it("disables ready-for-shipment action when only blocked is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const actionSelect = screen.getByLabelText("Akcja") as HTMLSelectElement;
    const readyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "MARK_READY_FOR_SHIPMENT",
    );
    const assemblyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "COMPLETE_ASSEMBLY",
    );

    if (!readyOption || !assemblyOption) {
      throw new Error("Expected shipment action options to exist.");
    }

    expect(readyOption.disabled).toBe(true);
    expect(assemblyOption.disabled).toBe(false);
  });

  it("renders empty state for component queue when API returns no devices", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(emptyComponentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));

    expect(
      await screen.findByText("Brak urządzeń w kolejce jakości komponentów."),
    ).toBeInTheDocument();
    const emptyState = screen
      .getByText("Brak urządzeń w kolejce jakości komponentów.")
      .closest("section");
    expect(emptyState).not.toBeNull();
    expect(
      within(emptyState as HTMLElement).getByText(
        "Jeśli backend działa, zawęź lub wyczyść filtry i odśwież kolejkę.",
      ),
    ).toBeInTheDocument();
  });

  it("loads API base from localStorage and persists manual changes", async () => {
    localStorage.setItem(API_STORAGE_KEY, "http://localhost:9100/api");

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const apiBaseInput = screen.getByDisplayValue("http://localhost:9100/api");
    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9100/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.change(apiBaseInput, {
      target: { value: "http://localhost:9200/api" },
    });

    await waitFor(() =>
      expect(localStorage.getItem(API_STORAGE_KEY)).toBe("http://localhost:9200/api"),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:9200/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("clears saved dashboard state back to defaults", async () => {
    localStorage.setItem(API_STORAGE_KEY, "http://localhost:9100/api");
    localStorage.setItem(VIEW_STORAGE_KEY, "components");
    localStorage.setItem(
      COMPONENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        only_blocking: false,
        limit: 25,
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://localhost:9100/api")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść zapisany stan" }));

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wysyłka" })).toHaveClass("is-active");
    expect(screen.getByDisplayValue("/api")).toBeInTheDocument();
    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("");
    expect(screen.getByLabelText("Limit")).toHaveValue(100);

    await waitFor(() =>
      expect(localStorage.getItem(API_STORAGE_KEY)).toBe("/api"),
    );
    await waitFor(() =>
      expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("shipment"),
    );
    await waitFor(() =>
      expect(localStorage.getItem(COMPONENT_FILTERS_STORAGE_KEY)).toBe(
        JSON.stringify({
          device_type: "",
          variant_code: "",
          production_status: "",
          blocking_component_type: "",
          primary_quality_status: "",
          stale_bucket: "",
          recommended_action: "",
          passes_component_quality_gate: "",
          only_blocking: true,
          sort_by: "blocked_components",
          sort_desc: true,
          limit: 100,
          offset: 0,
        }),
      ),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("loads shipment filters from localStorage and persists reset state", async () => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        only_blocked: true,
        sort_desc: false,
        limit: 25,
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_blocked=true&sort_by=created_at&sort_desc=false&limit=25",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść" }));

    await waitFor(() =>
      expect(localStorage.getItem(SHIPMENT_FILTERS_STORAGE_KEY)).toBe(
        JSON.stringify({
          device_type: "",
          variant_code: "",
          production_status: "",
          primary_blocking_code: "",
          recommended_action: "",
          latest_gate_result: "",
          only_blocked: false,
          only_ready: false,
          sort_by: "created_at",
          sort_desc: true,
          limit: 100,
          offset: 0,
        }),
      ),
    );
  });

  it("falls back for unsupported shipment filter options restored from localStorage", async () => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        production_status: "BROKEN",
        primary_blocking_code: "UNKNOWN_BLOCKER",
        recommended_action: "UNSUPPORTED_ACTION",
        latest_gate_result: "INVALID_GATE",
        sort_by: "unknown_field",
        sort_desc: false,
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=false&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("sanitizes incompatible shipment filters restored from localStorage", async () => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        only_blocked: true,
        only_ready: true,
        primary_blocking_code: "FINAL_TEST_NOT_PASSED",
        recommended_action: "COMPLETE_ASSEMBLY",
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_ready=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    await waitFor(() =>
      expect(localStorage.getItem(SHIPMENT_FILTERS_STORAGE_KEY)).toBe(
        JSON.stringify({
          device_type: "DEMO-OPS",
          variant_code: "",
          production_status: "",
          primary_blocking_code: "",
          recommended_action: "",
          latest_gate_result: "",
          only_blocked: false,
          only_ready: true,
          sort_by: "created_at",
          sort_desc: true,
          limit: 100,
          offset: 0,
        }),
      ),
    );
  });

  it("loads component filters from localStorage and falls back for malformed values", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");
    localStorage.setItem(
      COMPONENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        production_status: "BROKEN",
        primary_quality_status: "INVALID_STATUS",
        stale_bucket: "LAST_MONTH",
        recommended_action: "UNSUPPORTED_ACTION",
        passes_component_quality_gate: "maybe",
        only_blocking: false,
        sort_by: "mystery_field",
        limit: 0,
        offset: -5,
        sort_desc: "nope",
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/component-quality?device_type=DEMO-OPS&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("blocks fetch and shows validation when api base is empty", async () => {
    localStorage.setItem(API_STORAGE_KEY, "");

    const blockedFetch = vi.fn();
    vi.stubGlobal("fetch", blockedFetch);

    render(<App />);

    const emptyApiAlert = await screen.findByRole("alert");
    expect(emptyApiAlert).toHaveTextContent("Podaj bazowy adres API.");
    expect(blockedFetch).not.toHaveBeenCalled();
  });

  it("clears stale component data when refresh ends with API error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(
        createErrorResponse(503, "Service Unavailable", "component queue offline"),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    const apiControls = screen.getByRole("region", { name: /API/i });
    fireEvent.click(within(apiControls).getByRole("button", { name: "Odśwież" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("API 503 Service Unavailable: component queue offline");
    expect(screen.queryByText("COMP-001")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("restores default shipment filters after reset", async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("");
    expect(screen.getByLabelText("Tylko zablokowane")).not.toBeChecked();
    expect(screen.getByLabelText("Tylko gotowe")).not.toBeChecked();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("pages through shipment queue and resets offset after filter changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(paginatedShipmentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedShipmentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedShipmentPageTwoPayload))
      .mockResolvedValue(createJsonResponse(paginatedShipmentPageOnePayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(screen.getByText("1-1 z 3 urządzeń")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "1" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Następna strona" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=1&offset=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText("SHIP-002")).toBeInTheDocument();
    expect(screen.getByText("2-2 z 3 urządzeń")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("clamps shipment limit in UI state before sending request", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(paginatedShipmentPageOnePayload),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "999" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Limit")).toHaveValue(500);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=500",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("pages through component queue in both directions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageTwoPayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageOnePayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "1" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Następna strona" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1&offset=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText("COMP-002")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Poprzednia strona" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
  });

  it("clamps component limit to minimum value before sending request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "0" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("Limit")).toHaveValue(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
