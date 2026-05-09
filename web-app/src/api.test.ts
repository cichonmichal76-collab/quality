import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addQcStepResult,
  buildQuery,
  completeQcRun,
  createQcChecklist,
  createQcChecklistStep,
  createFinalTest,
  createOperator,
  createQcRun,
  createWorkstation,
  deleteQcChecklistStep,
  getQcProductConfiguration,
  getQcRunDetails,
  getProductionItemByBarcode,
  getServiceSession,
  joinApiUrl,
  listQcItemClosedCriticalNcrs,
  listQcItemOpenCriticalNcrs,
  listOperators,
  listQcChecklists,
  listQcChecklistSteps,
  listQcRunsForItem,
  listServiceSessions,
  listServiceSessionsQueue,
  listWorkstations,
  listWorkSessions,
  operatorLogin,
  optionalBoolean,
  rfidLogin,
  releaseQcItemForRework,
  scanAssemblyComponent,
  updateQcChecklist,
  updateQcChecklistStep,
  updateDeviceStatus,
  updateNonconformityStatus,
  updateProductionItemStatus,
  updateOperator,
  uploadQcChecklistReferenceImage,
  uploadQcRunEvidence,
  updateWorkstation,
} from "./api";
import {
  errorResponse as createErrorResponse,
  jsonResponse as createJsonResponse,
} from "./TestHttpUtils";

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
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        device_serial_number: "SHIP-001",
        production_status: "READY_FOR_SHIPMENT",
      }),
    );
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
      vi
        .fn()
        .mockResolvedValue(
          createErrorResponse(
            400,
            "Bad Request",
            "Open critical NCR blocks shipment",
          ),
        ),
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

describe("updateProductionItemStatus", () => {
  it("wysyla PATCH ze statusem komponentu", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        item_serial_number: "ITEM-001",
        current_status: "REWORK_REQUIRED",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await updateProductionItemStatus(
      "/api",
      "ITEM-001",
      "REWORK_REQUIRED",
    );

    expect(payload.current_status).toBe("REWORK_REQUIRED");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/production-items/ITEM-001/status",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ current_status: "REWORK_REQUIRED" }),
      }),
    );
  });
});

describe("qc item rework helpers", () => {
  it("pobiera otwarte krytyczne NCR dla komponentu", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          ncr_id: "NCR-QC-001",
          component_serial_number: "ITEM-001",
          severity: "CRITICAL",
          status: "OPEN",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listQcItemOpenCriticalNcrs("/api", "ITEM-001");

    expect(payload).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-items/ITEM-001/open-critical-ncrs",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("pobiera zamkniete krytyczne NCR dla komponentu z limitem", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          ncr_id: "NCR-QC-CLOSED-001",
          component_serial_number: "ITEM-001",
          severity: "CRITICAL",
          status: "CLOSED",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listQcItemClosedCriticalNcrs("/api", "ITEM-001", 5);

    expect(payload).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-items/ITEM-001/closed-critical-ncrs?limit=5",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("pobiera historie QC run dla komponentu", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          run_id: "QCRUN-001",
          item_serial_number: "ITEM-001",
          process_stage: "COMPONENT_QC",
          status: "COMPLETED",
          result: "PASS",
        },
      ],
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listQcRunsForItem("/api", "ITEM-001", 8);

    expect(payload).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-items/ITEM-001/runs?limit=8",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("pobiera szczegoly wybranego QC run", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "QC-ROW-001",
        run_id: "QC-WEB-001",
        device_serial_number: null,
        item_serial_number: "ITEM-001",
        barcode_value: "BC-001",
        checklist_id: "CHK-001",
        checklist_code: "QC-STATION-001",
        checklist_name: "Kontrola obudowy",
        process_stage: "COMPONENT_QC",
        operator_id: "OP-QC-001",
        status: "COMPLETED",
        result: "FAIL",
        started_at: "2026-05-03T09:20:00Z",
        ended_at: "2026-05-03T09:22:00Z",
        failure_reason: "VISUAL_DEFECT",
        failure_comment: "Rysa na obudowie",
        failure_disposition: "OPEN_CRITICAL_NCR",
        step_results: [
          {
            id: "STEP-RESULT-001",
            qc_run_id: "QC-ROW-001",
            step_id: "STEP-001",
            step_order: 1,
            step_title: "Sprawdz obudowe",
            evaluation_mode: "MANUAL",
            result_input_label: null,
            control_area: "Obudowa",
            expected_value: null,
            tolerance_min: null,
            tolerance_max: null,
            unit: null,
            status: "FAIL",
            measurement_value: null,
            observed_value: null,
            comment: "Rysa na obudowie",
            mcu_snapshot: null,
            created_at: "2026-05-03T09:20:30Z",
          },
        ],
        evidence_files: [
          {
            id: "FILE-001",
            related_entity_type: "QC_RUN",
            related_entity_id: "QC-WEB-001",
            file_name: "scratch.jpg",
            file_path: "/storage/files/scratch.jpg",
            file_type: "image/jpeg",
            file_hash: "hash-001",
            uploaded_by: "OP-QC-001",
            created_at: "2026-05-03T09:21:00Z",
          },
        ],
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await getQcRunDetails("/api", "QC-WEB-001");

    expect(payload.run_id).toBe("QC-WEB-001");
    expect(payload.step_results).toHaveLength(1);
    expect(payload.evidence_files[0]?.file_name).toBe("scratch.jpg");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-runs/QC-WEB-001/details",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("wysyla release-for-rework z akcja korygujaca i work session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        item_serial_number: "ITEM-001",
        current_status: "REWORK_REQUIRED",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await releaseQcItemForRework("/api", "ITEM-001", {
      work_session_id: "WS-QC-001",
      operator_id: "OP-QC-001",
      corrective_action: "Wymieniono uszczelke i przygotowano do ponownej kontroli.",
    });

    expect(payload.current_status).toBe("REWORK_REQUIRED");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-items/ITEM-001/release-for-rework",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          work_session_id: "WS-QC-001",
          operator_id: "OP-QC-001",
          corrective_action:
            "Wymieniono uszczelke i przygotowano do ponownej kontroli.",
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

describe("listWorkstations", () => {
  it("pobiera stanowiska do ekranu logowania QC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          workstation_id: "QCWS-DEMO",
          name: "QC Station",
          area: "QA",
          station_type: "QC",
          is_active: true,
        },
      ],
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listWorkstations("/api");

    expect(payload[0]?.workstation_id).toBe("QCWS-DEMO");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workstations",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });
});

describe("createWorkstation", () => {
  it("tworzy nowe stanowisko QC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        workstation_id: "QCWS-NEW",
        name: "Nowe stanowisko",
        area: "QA",
        station_type: "QC",
        is_active: true,
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await createWorkstation("/api", {
      workstation_id: "QCWS-NEW",
      name: "Nowe stanowisko",
      area: "QA",
      station_type: "QC",
    });

    expect(payload.workstation_id).toBe("QCWS-NEW");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workstations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          workstation_id: "QCWS-NEW",
          name: "Nowe stanowisko",
          area: "QA",
          station_type: "QC",
        }),
      }),
    );
  });
});

describe("updateWorkstation", () => {
  it("aktualizuje stanowisko QC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        workstation_id: "QCWS-DEMO",
        name: "Linia QC 2",
        area: "LAB",
        station_type: "FINAL_QC",
        is_active: false,
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await updateWorkstation("/api", "QCWS-DEMO", {
      name: "Linia QC 2",
      area: "LAB",
      station_type: "FINAL_QC",
      is_active: false,
    });

    expect(payload.is_active).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workstations/QCWS-DEMO",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          name: "Linia QC 2",
          area: "LAB",
          station_type: "FINAL_QC",
          is_active: false,
        }),
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

describe("createOperator", () => {
  it("tworzy operatora do stanowiska QC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        operator_id: "QCOP-NEW",
        full_name: "Nowy operator",
        role: "QUALITY_INSPECTOR",
        login_name: "qc-new",
        rfid_uid_hash: "RFID-NEW",
        is_active: true,
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await createOperator("/api", {
      operator_id: "QCOP-NEW",
      full_name: "Nowy operator",
      role: "QUALITY_INSPECTOR",
      login_name: "qc-new",
      password: "Secret123!",
      rfid_uid_hash: "RFID-NEW",
      is_active: true,
    });

    expect(payload.login_name).toBe("qc-new");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/operators",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          operator_id: "QCOP-NEW",
          full_name: "Nowy operator",
          role: "QUALITY_INSPECTOR",
          login_name: "qc-new",
          password: "Secret123!",
          rfid_uid_hash: "RFID-NEW",
          is_active: true,
        }),
      }),
    );
  });
});

describe("updateOperator", () => {
  it("aktualizuje operatora, login i aktywnosc", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        operator_id: "QCOP-DEMO",
        full_name: "Starszy operator",
        role: "QUALITY_MANAGER",
        login_name: "qc-manager",
        rfid_uid_hash: "RFID-UPD",
        is_active: false,
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await updateOperator("/api", "QCOP-DEMO", {
      full_name: "Starszy operator",
      role: "QUALITY_MANAGER",
      login_name: "qc-manager",
      password: "NewSecret123!",
      rfid_uid_hash: "RFID-UPD",
      is_active: false,
    });

    expect(payload.role).toBe("QUALITY_MANAGER");
    expect(payload.is_active).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/operators/QCOP-DEMO",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          full_name: "Starszy operator",
          role: "QUALITY_MANAGER",
          login_name: "qc-manager",
          password: "NewSecret123!",
          rfid_uid_hash: "RFID-UPD",
          is_active: false,
        }),
      }),
    );
  });
});

describe("operatorLogin", () => {
  it("wysyla login operatora i zwraca sesje stanowiskowa", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        work_session_id: "WS-QC-001",
        operator_id: "QCOP-DEMO",
        workstation_id: "QCWS-DEMO",
        machine_id: null,
        status: "ACTIVE",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await operatorLogin("/api", {
      login: "qc-demo",
      password: "secret-123",
      workstation_id: "QCWS-DEMO",
    });

    expect(payload.work_session_id).toBe("WS-QC-001");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/operator-login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          login: "qc-demo",
          password: "secret-123",
          workstation_id: "QCWS-DEMO",
        }),
      }),
    );
  });
});

describe("rfidLogin", () => {
  it("wysyla odczyt RFID i zwraca sesje stanowiskowa", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        work_session_id: "WS-QC-002",
        operator_id: "QCOP-DEMO",
        workstation_id: "QCWS-DEMO",
        machine_id: null,
        status: "ACTIVE",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await rfidLogin("/api", {
      rfid_uid_hash: "QCRFID-DEMO",
      workstation_id: "QCWS-DEMO",
    });

    expect(payload.work_session_id).toBe("WS-QC-002");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/rfid-login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          rfid_uid_hash: "QCRFID-DEMO",
          workstation_id: "QCWS-DEMO",
        }),
      }),
    );
  });
});

describe("listServiceSessionsQueue", () => {
  it("pobiera liste sesji commissioning przefiltrowana po serialu urzadzenia", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: "svc-row-001",
          session_id: "SVC-001",
          device_serial_number: "DEVICE-001",
          device_type: "DEMO-SVC",
          technician_id: "TECH-A",
          result: "PASS",
          firmware_version: "1.0.1",
          bootloader_version: "0.9.0",
          package_path: "/tmp/SVC-001.zip",
          package_hash: "hash-001",
          upload_status: "UPLOADED",
          upload_count: 2,
          client_attempt_id: "ATT-001",
          client_attempt_number: 2,
          client_trigger_source: "AUTO_NETWORK",
          upload_correlation_id: "CORR-001",
          uploaded_at: "2026-05-03T08:00:00Z",
          created_at: "2026-05-03T07:30:00Z",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listServiceSessions("/api", {
      device_serial_number: "DEVICE-001",
    });

    expect(payload[0]?.session_id).toBe("SVC-001");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/service-sessions?device_serial_number=DEVICE-001",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("pobiera szczegoly pojedynczej sesji commissioning", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "svc-row-001",
        session_id: "SVC-001",
        device_serial_number: "DEVICE-001",
        device_type: "DEMO-SVC",
        technician_id: "TECH-A",
        result: "PASS",
        firmware_version: "1.0.1",
        bootloader_version: "0.9.0",
        package_path: "/tmp/SVC-001.zip",
        package_hash: "hash-001",
        upload_status: "UPLOADED",
        upload_count: 2,
        client_attempt_id: "ATT-001",
        client_attempt_number: 2,
        client_trigger_source: "AUTO_NETWORK",
        upload_correlation_id: "CORR-001",
        uploaded_at: "2026-05-03T08:00:00Z",
        created_at: "2026-05-03T07:30:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await getServiceSession("/api", "SVC-001");

    expect(payload.upload_correlation_id).toBe("CORR-001");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/service-sessions/SVC-001",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("pobiera kolejke commissioning z filtrami, sortowaniem i paginacja", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        total_sessions: 2,
        reuploaded_sessions: 1,
        returned_count: 1,
        offset: 0,
        limit: 1,
        has_more: true,
        next_offset: 1,
        filters: {
          technician_id: "TECH-A",
          client_attempt_id: "ATT-QUEUE-001",
          upload_correlation_id: "CORR-QUEUE-001",
          sort_by: "upload_count",
          sort_desc: true,
          offset: 0,
          limit: 1,
        },
        upload_status_summary: [{ upload_status: "UPLOADED", session_count: 2 }],
        result_summary: [{ result: "PASS", session_count: 2 }],
        device_type_summary: [{ device_type: "VENT-PRO", session_count: 2 }],
        technician_summary: [{ technician_id: "TECH-A", session_count: 2 }],
        trigger_source_summary: [
          { client_trigger_source: "AUTO_NETWORK", session_count: 2 },
        ],
        sessions: [
          {
            session_id: "SVC-001",
            device_serial_number: "DEV-001",
            technician_id: "TECH-A",
            upload_count: 2,
            upload_status: "UPLOADED",
            created_at: "2026-05-02T10:00:00Z",
          },
        ],
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listServiceSessionsQueue("/api", {
      technician_id: "TECH-A",
      min_upload_count: 2,
      client_attempt_id: "ATT-QUEUE-001",
      upload_correlation_id: "CORR-QUEUE-001",
      only_reuploaded: true,
      sort_by: "upload_count",
      sort_desc: true,
      offset: 0,
      limit: 1,
    });

    expect(payload.reuploaded_sessions).toBe(1);
    expect(payload.sessions[0]?.upload_count).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/service-sessions/queue?technician_id=TECH-A&min_upload_count=2&client_attempt_id=ATT-QUEUE-001&upload_correlation_id=CORR-QUEUE-001&only_reuploaded=true&sort_by=upload_count&sort_desc=true&offset=0&limit=1",
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

describe("listQcChecklists", () => {
  it("pobiera aktywne checklisty QC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: "CHK-001",
          checklist_code: "QC-COMP-001",
          name: "Kontrola wentylatora",
          process_stage: "COMPONENT_QC",
          version: "1.0",
          is_active: true,
          created_at: "2026-05-03T08:00:00Z",
        },
      ],
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listQcChecklists("/api");

    expect(payload).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-checklists",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });
});

describe("listQcChecklistSteps", () => {
  it("pobiera kroki checklisty QC po checklist_code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          id: "STEP-001",
          checklist_id: "CHK-001",
          step_order: 1,
          title: "Zmierz szerokość",
          instruction: "Użyj suwmiarki.",
          requires_photo: false,
          requires_measurement: true,
          blocking_on_fail: true,
          expected_value: "25.0",
          unit: "mm",
          tolerance_min: 24.8,
          tolerance_max: 25.2,
        },
      ],
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await listQcChecklistSteps("/api", "QC-COMP-001");

    expect(payload[0]?.requires_measurement).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-checklists/QC-COMP-001/steps",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });
});

describe("getProductionItemByBarcode", () => {
  it("pobiera detal po barcode do stanowiska QC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "ITEM-ROW-001",
        item_serial_number: "FAN-001",
        barcode_value: "BC-FAN-001",
        item_type: "FAN_MODULE",
        part_number: "PN-FAN-001",
        revision: "A",
        drawing_number: null,
        drawing_revision: null,
        production_order: null,
        material_batch: null,
        machine_id: null,
        created_by_operator_id: "OP-001",
        current_status: "PRODUCED",
        produced_at: "2026-05-03T08:00:00Z",
        created_at: "2026-05-03T08:00:00Z",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await getProductionItemByBarcode("/api", "BC-FAN-001");

    expect(payload.item_serial_number).toBe("FAN-001");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/production-items/by-barcode/BC-FAN-001",
      expect.objectContaining({
        headers: { Accept: "application/json" },
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
  it("wysyła pusty formularz, gdy backend sam wylicza wynik runu", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        run_id: "QC-WEB-002",
        item_serial_number: "FAN-901",
        barcode_value: "BC-FAN-901",
        checklist_id: "CHK-001",
        process_stage: "COMPONENT_QC",
        work_session_id: "WS-QA-001",
        id: "QC-ROW-002",
        status: "COMPLETED",
        result: "PASS",
        started_at: "2026-05-03T09:20:00Z",
        ended_at: "2026-05-03T09:21:00Z",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await completeQcRun("/api", "QC-WEB-002");

    expect(payload.result).toBe("PASS");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-runs/QC-WEB-002/complete",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: "",
      }),
    );
  });
  it("wysyla reason i comment dla FAIL z formularza obiektowego", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        run_id: "QC-WEB-003",
        item_serial_number: "FAN-902",
        barcode_value: "BC-FAN-902",
        checklist_id: "CHK-003",
        process_stage: "COMPONENT_QC",
        work_session_id: "WS-QA-003",
        id: "QC-ROW-003",
        status: "COMPLETED",
        result: "FAIL",
        started_at: "2026-05-03T09:22:00Z",
        ended_at: "2026-05-03T09:23:00Z",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await completeQcRun("/api", "QC-WEB-003", {
      result: "FAIL",
      failure_reason: " VISUAL_DEFECT ",
      failure_comment: " Rysa na powierzchni. ",
      failure_disposition: "REWORK_REQUIRED",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-runs/QC-WEB-003/complete",
      expect.objectContaining({
        method: "POST",
        body:
          "result=FAIL&failure_reason=VISUAL_DEFECT&failure_comment=Rysa+na+powierzchni.&failure_disposition=REWORK_REQUIRED",
      }),
    );
  });
});

describe("uploadQcRunEvidence", () => {
  it("wysyla multipart z plikiem dowodowym dla QC run", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "FILE-001",
        related_entity_type: "QC_RUN",
        related_entity_id: "QC-WEB-010",
        file_name: "defect.jpg",
        file_path: "/storage/qc/defect.jpg",
        file_type: "image/jpeg",
        file_hash: "hash-001",
        uploaded_by: "QCOP-001",
        created_at: "2026-05-03T09:40:00Z",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["demo"], "defect.jpg", { type: "image/jpeg" });
    const payload = await uploadQcRunEvidence("/api", "QC-WEB-010", file, "QCOP-001");

    expect(payload.related_entity_id).toBe("QC-WEB-010");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/upload",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.body).toBeInstanceOf(FormData);
    const formData = requestInit.body as FormData;
    expect(formData.get("related_entity_type")).toBe("QC_RUN");
    expect(formData.get("related_entity_id")).toBe("QC-WEB-010");
    expect(formData.get("uploaded_by")).toBe("QCOP-001");
    expect((formData.get("file") as File | null)?.name).toBe("defect.jpg");
  });
});

describe("addQcStepResult", () => {
  it("wysyła JSON z wynikiem kroku i pomiarem", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "STEP-RESULT-001",
        qc_run_id: "QC-ROW-001",
        step_id: "STEP-001",
        status: "PASS",
        measurement_value: 25.1,
        comment: "Pomiar w normie",
        mcu_snapshot: null,
        created_at: "2026-05-03T09:20:15Z",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await addQcStepResult("/api", "QC-WEB-001", "STEP-001", {
      status: "PASS",
      measurement_value: 25.1,
      comment: "Pomiar w normie",
    });

    expect(payload.measurement_value).toBe(25.1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-runs/QC-WEB-001/steps/STEP-001/result",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "PASS",
          measurement_value: 25.1,
          comment: "Pomiar w normie",
        }),
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

describe("qc product configuration api", () => {
  it("pobiera konfiguracje komponentow BOM dla produktu", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        device_type: "DEMO-OPS",
        variant_code: "DEFAULT",
        items: [
          {
            component_type: "SCREW_M4",
            quantity_required: 4,
            is_required: true,
            checklist_code: "QC-DEMO-OPS-SCREW-M4",
            checklist_name: "Kontrola sruby",
            checklist_version: "1.0",
            checklist_is_active: true,
            skip_component_qc: false,
            reference_image_file_id: "FILE-001",
            configured_step_count: 2,
          },
        ],
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const payload = await getQcProductConfiguration("/api", "DEMO-OPS");

    expect(payload.items[0]?.component_type).toBe("SCREW_M4");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-product-configurations/DEMO-OPS?variant_code=DEFAULT",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("obsluguje filtrowanie checklist po produkcie, wariancie i komponencie", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [],
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await listQcChecklists("/api", {
      device_type: "DEMO-OPS",
      variant_code: "DEFAULT",
      component_type: "SCREW_M4",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-checklists?device_type=DEMO-OPS&variant_code=DEFAULT&component_type=SCREW_M4",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("tworzy i aktualizuje checkliste produktu QC", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          checklist_code: "QC-DEMO-OPS-SCREW-M4",
          name: "Kontrola sruby",
          process_stage: "COMPONENT_QC",
          version: "1.0",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          component_type: "SCREW_M4",
          skip_component_qc: false,
          reference_image_file_id: null,
          is_active: true,
          id: "CHK-001",
          created_at: "2026-05-03T10:00:00Z",
        }),
      } satisfies Partial<Response>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          checklist_code: "QC-DEMO-OPS-SCREW-M4",
          name: "Kontrola sruby M4",
          process_stage: "COMPONENT_QC",
          version: "1.1",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          component_type: "SCREW_M4",
          skip_component_qc: false,
          reference_image_file_id: null,
          is_active: true,
          id: "CHK-001",
          created_at: "2026-05-03T10:00:00Z",
        }),
      } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await createQcChecklist("/api", {
      checklist_code: "QC-DEMO-OPS-SCREW-M4",
      name: "Kontrola sruby",
      process_stage: "COMPONENT_QC",
      version: "1.0",
      device_type: "DEMO-OPS",
      variant_code: "DEFAULT",
      component_type: "SCREW_M4",
      skip_component_qc: false,
      is_active: true,
    });
    await updateQcChecklist("/api", "QC-DEMO-OPS-SCREW-M4", {
      name: "Kontrola sruby M4",
      version: "1.1",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/qc-checklists");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/qc-checklists/QC-DEMO-OPS-SCREW-M4",
    );
  });

  it("tworzy, aktualizuje i usuwa krok checklisty produktu QC", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          id: "STEP-001",
          checklist_id: "CHK-001",
          step_order: 1,
          title: "Sprawdz dlugosc",
          instruction: "Zmierz srube",
          control_area: "Trzon sruby",
          evaluation_mode: "NUMERIC_RANGE",
          result_input_label: "Wynik dlugosci",
          region_x: 12,
          region_y: 18,
          region_width: 46,
          region_height: 24,
          requires_photo: false,
          requires_measurement: true,
          blocking_on_fail: true,
          expected_value: "12.0",
          unit: "mm",
          tolerance_min: 11.8,
          tolerance_max: 12.2,
        }),
      } satisfies Partial<Response>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          id: "STEP-001",
          checklist_id: "CHK-001",
          step_order: 1,
          title: "Sprawdz dlugosc nominalna",
          instruction: "Zmierz srube",
          control_area: "Trzon sruby",
          evaluation_mode: "NUMERIC_RANGE",
          result_input_label: "Wynik dlugosci",
          region_x: 12,
          region_y: 18,
          region_width: 46,
          region_height: 24,
          requires_photo: false,
          requires_measurement: true,
          blocking_on_fail: true,
          expected_value: "12.0",
          unit: "mm",
          tolerance_min: 11.8,
          tolerance_max: 12.2,
        }),
      } satisfies Partial<Response>)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: "No Content",
        text: async () => "",
      } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await createQcChecklistStep("/api", "QC-DEMO-OPS-SCREW-M4", {
      step_order: 1,
      title: "Sprawdz dlugosc",
      control_area: "Trzon sruby",
      evaluation_mode: "NUMERIC_RANGE",
      result_input_label: "Wynik dlugosci",
      region_x: 12,
      region_y: 18,
      region_width: 46,
      region_height: 24,
      expected_value: "12.0",
      unit: "mm",
      tolerance_min: 11.8,
      tolerance_max: 12.2,
    });
    await updateQcChecklistStep("/api", "QC-DEMO-OPS-SCREW-M4", "STEP-001", {
      title: "Sprawdz dlugosc nominalna",
    });
    await deleteQcChecklistStep("/api", "QC-DEMO-OPS-SCREW-M4", "STEP-001");

    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        method: "DELETE",
      }),
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)),
    ).toMatchObject({
      region_x: 12,
      region_y: 18,
      region_width: 46,
      region_height: 24,
    });
  });

  it("wysyla zdjecie referencyjne checklisty jako multipart/form-data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        checklist_code: "QC-DEMO-OPS-SCREW-M4",
        name: "Kontrola sruby",
        process_stage: "COMPONENT_QC",
        version: "1.0",
        device_type: "DEMO-OPS",
        variant_code: "DEFAULT",
        component_type: "SCREW_M4",
        skip_component_qc: false,
        reference_image_file_id: "FILE-001",
        is_active: true,
        id: "CHK-001",
        created_at: "2026-05-03T10:00:00Z",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["demo-image"], "screw.png", { type: "image/png" });
    const payload = await uploadQcChecklistReferenceImage(
      "/api",
      "QC-DEMO-OPS-SCREW-M4",
      file,
      "QC-ADMIN",
    );

    expect(payload.reference_image_file_id).toBe("FILE-001");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qc-checklists/QC-DEMO-OPS-SCREW-M4/reference-image",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });
});
