import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildQuery,
  completeQcRun,
  createFinalTest,
  createQcRun,
  joinApiUrl,
  listOperators,
  listWorkSessions,
  optionalBoolean,
  scanAssemblyComponent,
  updateDeviceStatus,
  updateNonconformityStatus,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildQuery", () => {
  it("przycina tekstowe filtry, pomija puste wartości i serializuje booleany", () => {
    expect(
      buildQuery({
        device_type: "  ZSS-VENT  ",
        variant_code: "",
        only_blocked: true,
        latest_gate_result: null,
        limit: 100,
      }),
    ).toBe("?device_type=ZSS-VENT&only_blocked=true&limit=100");
  });

  it("zwraca pusty string, gdy nie ma parametrów", () => {
    expect(buildQuery({ device_type: "", limit: undefined })).toBe("");
  });
});

describe("joinApiUrl", () => {
  it("łączy bazowy adres API bez podwójnych slashy", () => {
    expect(joinApiUrl("http://localhost:8000/api/", "/shipment-readiness")).toBe(
      "http://localhost:8000/api/shipment-readiness",
    );
  });

  it("przycina przypadkowe spacje w bazowym adresie API", () => {
    expect(joinApiUrl("  http://localhost:8000/api/  ", "component-quality")).toBe(
      "http://localhost:8000/api/component-quality",
    );
  });

  it("obsługuje relatywne API base dla proxy Vite", () => {
    expect(joinApiUrl("/api", "component-quality")).toBe(
      "/api/component-quality",
    );
  });
});

describe("optionalBoolean", () => {
  it("mapuje opcjonalną wartość selecta na query boolean", () => {
    expect(optionalBoolean("")).toBeUndefined();
    expect(optionalBoolean("true")).toBe(true);
    expect(optionalBoolean("false")).toBe(false);
  });
});

describe("updateDeviceStatus", () => {
  it("wysyła PATCH ze statusem urządzenia i parsuje odpowiedź JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        device_serial_number: "SHIP-001",
        production_status: "READY_FOR_SHIPMENT",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await updateDeviceStatus(
      "/api",
      "SHIP-001",
      "READY_FOR_SHIPMENT",
    );

    expect(payload.production_status).toBe("READY_FOR_SHIPMENT");
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

  it("wyciąga detail z odpowiedzi JSON, gdy backend odrzuca akcję", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () =>
          JSON.stringify({ detail: "Open critical NCR blocks shipment" }),
      } satisfies Partial<Response>),
    );

    await expect(
      updateDeviceStatus("/api", "SHIP-001", "READY_FOR_SHIPMENT"),
    ).rejects.toThrow("API 400 Bad Request: Open critical NCR blocks shipment");
  });
});

describe("updateNonconformityStatus", () => {
  it("wysyła PATCH zamykający NCR z corrective_action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        ncr_id: "NCR-001",
        status: "CLOSED",
        corrective_action: "Zamknięte z panelu operacyjnego.",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await updateNonconformityStatus(
      "/api",
      "NCR-001",
      "CLOSED",
      "Zamknięte z panelu operacyjnego.",
    );

    expect(payload.status).toBe("CLOSED");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/nonconformities/NCR-001",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "CLOSED",
          corrective_action: "Zamknięte z panelu operacyjnego.",
        }),
      }),
    );
  });
});

describe("listWorkSessions", () => {
  it("pobiera aktywne sesje pracy z API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          work_session_id: "WS-FT-001",
          operator_id: "OP-FT-001",
          status: "ACTIVE",
        },
      ],
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listWorkSessions("/api");

    expect(payload).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/work-sessions",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });
});

describe("listOperators", () => {
  it("pobiera operatorów do filtrowania sesji final test", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          operator_id: "OP-FT-001",
          role: "FINAL_TEST_OPERATOR",
        },
      ],
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listOperators("/api");

    expect(payload[0]?.role).toBe("FINAL_TEST_OPERATOR");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/operators",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });
});

describe("createFinalTest", () => {
  it("wysyła POST zapisujący wynik final testu z work_session_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        test_run_id: "FT-WEB-001",
        device_serial_number: "TEST-001",
        result: "PASS",
        work_session_id: "WS-FT-001",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await createFinalTest("/api", {
      test_run_id: "FT-WEB-001",
      device_serial_number: "TEST-001",
      result: "PASS",
      work_session_id: "WS-FT-001",
    });

    expect(payload.result).toBe("PASS");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/final-tests",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          test_run_id: "FT-WEB-001",
          device_serial_number: "TEST-001",
          result: "PASS",
          work_session_id: "WS-FT-001",
        }),
      }),
    );
  });
});

describe("createQcRun", () => {
  it("wysyła POST zapisujący komponentowy QC run z work_session_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        run_id: "QC-WEB-001",
        device_serial_number: "SHIP-001",
        item_serial_number: "FAN-900",
        barcode_value: "BC-FAN-900",
        process_stage: "COMPONENT_QC",
        work_session_id: "WS-QA-001",
        id: "QC-ROW-001",
        status: "IN_PROGRESS",
        result: null,
        started_at: "2026-05-01T09:20:00Z",
        ended_at: null,
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await createQcRun("/api", {
      run_id: "QC-WEB-001",
      device_serial_number: "SHIP-001",
      item_serial_number: "FAN-900",
      barcode_value: "BC-FAN-900",
      process_stage: "COMPONENT_QC",
      work_session_id: "WS-QA-001",
    });

    expect(payload.status).toBe("IN_PROGRESS");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-runs",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: "QC-WEB-001",
          device_serial_number: "SHIP-001",
          item_serial_number: "FAN-900",
          barcode_value: "BC-FAN-900",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
        }),
      }),
    );
  });
});

describe("completeQcRun", () => {
  it("wysyła POST form-data zamykający komponentowy QC run wynikiem FAIL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        run_id: "QC-WEB-001",
        device_serial_number: "SHIP-001",
        item_serial_number: "FAN-900",
        barcode_value: "BC-FAN-900",
        process_stage: "COMPONENT_QC",
        work_session_id: "WS-QA-001",
        id: "QC-ROW-001",
        status: "COMPLETED",
        result: "FAIL",
        started_at: "2026-05-01T09:20:00Z",
        ended_at: "2026-05-01T09:21:00Z",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await completeQcRun("/api", "QC-WEB-001", "FAIL");

    expect(payload.result).toBe("FAIL");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-runs/QC-WEB-001/complete",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: "result=FAIL",
      }),
    );
  });
});

describe("scanAssemblyComponent", () => {
  it("wysyła POST montujący komponent z kontekstem sesji produkcyjnej", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "ASM-LINK-001",
        parent_device_serial_number: "ASM-001",
        child_item_serial_number: "FAN-777",
        child_barcode_value: "BC-FAN-777",
        component_type: "FAN_MODULE",
        installed_by: "OP-PROD-001",
        installed_at: "2026-05-02T08:30:00Z",
        workstation_id: "PR-ST-01",
        scan_event_id: "SCAN-001",
        bom_template_id: "BOM-01",
        bom_version: "1.2",
        status: "INSTALLED",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await scanAssemblyComponent("/api", "ASM-001", {
      child_barcode_value: "BC-FAN-777",
      component_type: "FAN_MODULE",
      installed_by: "OP-PROD-001",
      workstation_id: "PR-ST-01",
      work_session_id: "WS-PROD-001",
    });

    expect(payload.status).toBe("INSTALLED");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/devices/ASM-001/assembly/scan-component",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          child_barcode_value: "BC-FAN-777",
          component_type: "FAN_MODULE",
          installed_by: "OP-PROD-001",
          workstation_id: "PR-ST-01",
          work_session_id: "WS-PROD-001",
        }),
      }),
    );
  });
});
