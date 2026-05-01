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
import type { DeviceComponentQualityQueue, DeviceShipmentQueue } from "./api";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";

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

function createJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders shipment queue data from API", async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
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

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByText("FAN-001")).toBeInTheDocument();
    const componentActionsPanel = screen.getByText("Akcje operacyjne").closest("section");
    expect(componentActionsPanel).not.toBeNull();
    expect(
      within(componentActionsPanel as HTMLElement).getByText(
        /Uruchom QC komponentu \/ rework/i,
      ),
    ).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
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

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

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
    fireEvent.click(within(apiControls).getByRole("button"));

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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
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
