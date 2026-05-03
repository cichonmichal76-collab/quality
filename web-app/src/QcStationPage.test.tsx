import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { App } from "./App";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QcStationPage", () => {
  it("po logowaniu haslem pozwala wykonac kontrole QC", async () => {
    let barcodeLookupCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/operators")) {
        return jsonResponse([
          {
            id: "OP-ROW-001",
            operator_id: "QCOP-DEMO-LOCAL",
            full_name: "Demo QC Inspector",
            role: "QUALITY_INSPECTOR",
            login_name: "qc-demo-local",
            rfid_uid_hash: "QCRFID-DEMO-LOCAL",
            is_active: true,
            created_at: "2026-05-03T08:00:00Z",
          },
        ]);
      }

      if (url.endsWith("/api/workstations")) {
        return jsonResponse([
          {
            id: "WS-ROW-001",
            workstation_id: "QCWS-DEMO-LOCAL",
            name: "QC Station Demo",
            area: "QA",
            station_type: "QC",
            is_active: true,
          },
        ]);
      }

      if (url.endsWith("/api/qc-checklists")) {
        return jsonResponse([
          {
            id: "CHK-001",
            checklist_code: "QC-STATION-DEMO-LOCAL",
            name: "Kontrola wentylatora",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            device_type: null,
            variant_code: null,
            component_type: null,
            skip_component_qc: false,
            reference_image_file_id: "FILE-REF-001",
            is_active: true,
            created_at: "2026-05-03T08:00:00Z",
          },
        ]);
      }

      if (url.endsWith("/api/auth/operator-login") && method === "POST") {
        return jsonResponse({
          id: "SESSION-ROW-001",
          work_session_id: "WS-QA-001",
          operator_id: "QCOP-DEMO-LOCAL",
          workstation_id: "QCWS-DEMO-LOCAL",
          machine_id: null,
          status: "ACTIVE",
          started_at: "2026-05-03T08:10:00Z",
          ended_at: null,
        });
      }

      if (url.endsWith("/api/qc-checklists/QC-STATION-DEMO-LOCAL/steps")) {
        return jsonResponse([
          {
            id: "STEP-001",
            checklist_id: "CHK-001",
            step_order: 1,
            title: "Zmierz szerokosc",
            instruction: "Uzyj suwmiarki.",
            control_area: "Obudowa wentylatora",
            evaluation_mode: "NUMERIC_RANGE",
            result_input_label: "Wynik szerokosci",
            requires_photo: false,
            requires_measurement: true,
            blocking_on_fail: true,
            expected_value: "25.0",
            unit: "mm",
            tolerance_min: 24.8,
            tolerance_max: 25.2,
          },
          {
            id: "STEP-002",
            checklist_id: "CHK-001",
            step_order: 2,
            title: "Sprawdz etykiete",
            instruction: "Potwierdz czytelnosc etykiety.",
            control_area: "Etykieta",
            evaluation_mode: "TEXT_MATCH",
            result_input_label: "Wpisz odczyt etykiety",
            requires_photo: false,
            requires_measurement: false,
            blocking_on_fail: true,
            expected_value: "A2-70",
            unit: null,
            tolerance_min: null,
            tolerance_max: null,
          },
        ]);
      }

      if (url.endsWith("/api/production-items/by-barcode/QCBC-DEMO-LOCAL")) {
        barcodeLookupCount += 1;
        return jsonResponse({
          id: "ITEM-ROW-001",
          item_serial_number: "QCITEM-DEMO-LOCAL",
          barcode_value: "QCBC-DEMO-LOCAL",
          item_type: "FAN_MODULE",
          part_number: "PN-FAN-001",
          revision: "A",
          drawing_number: null,
          drawing_revision: null,
          production_order: null,
          material_batch: null,
          machine_id: null,
          created_by_operator_id: "QCOP-DEMO-LOCAL",
          current_status: barcodeLookupCount > 1 ? "QC_PASSED" : "PRODUCED",
          produced_at: "2026-05-03T08:10:00Z",
          created_at: "2026-05-03T08:10:00Z",
        });
      }

      if (url.endsWith("/api/qc-runs") && method === "POST") {
        return jsonResponse({
          id: "QC-ROW-001",
          run_id: "QC-WEB-STATIC",
          item_serial_number: "QCITEM-DEMO-LOCAL",
          barcode_value: "QCBC-DEMO-LOCAL",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "QCOP-DEMO-LOCAL",
          status: "IN_PROGRESS",
          result: null,
          started_at: "2026-05-03T08:11:00Z",
          ended_at: null,
        });
      }

      if (url.endsWith("/steps/STEP-001/result") && method === "POST") {
        return jsonResponse({
          id: "STEP-RESULT-001",
          qc_run_id: "QC-WEB-STATIC",
          step_id: "STEP-001",
          status: "PASS",
          measurement_value: 25.1,
          comment: "Pomiar OK",
        });
      }

      if (url.endsWith("/steps/STEP-002/result") && method === "POST") {
        return jsonResponse({
          id: "STEP-RESULT-002",
          qc_run_id: "QC-WEB-STATIC",
          step_id: "STEP-002",
          status: "PASS",
          observed_value: "A2-70",
          comment: "Etykieta OK",
        });
      }

      if (url.endsWith("/complete") && method === "POST") {
        return jsonResponse({
          id: "QC-ROW-001",
          run_id: "QC-WEB-STATIC",
          item_serial_number: "QCITEM-DEMO-LOCAL",
          barcode_value: "QCBC-DEMO-LOCAL",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "QCOP-DEMO-LOCAL",
          status: "COMPLETED",
          result: "PASS",
          started_at: "2026-05-03T08:11:00Z",
          ended_at: "2026-05-03T08:12:00Z",
        });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/qc-station");

    render(<App />);

    await screen.findByText(/Logowanie operatora/);

    fireEvent.change(screen.getByPlaceholderText("np. qc-demo-local"), {
      target: { value: "qc-demo-local" },
    });
    fireEvent.change(screen.getByPlaceholderText("Haslo operatora"), {
      target: { value: "qc-demo-local-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Wejdz do aplikacji" }));

    await screen.findByText("Sesja stanowiskowa");
    await screen.findByText("Demo QC Inspector");
    await screen.findByText(/QC Station Demo/);
    await screen.findByText(/Aktywna checklista: Kontrola wentylatora/);
    expect(screen.getByAltText(/Wzorzec kontroli Kontrola wentylatora/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("np. BC-DEMO-001"), {
      target: { value: "QCBC-DEMO-LOCAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pobierz detal" }));

    await screen.findByText("QCITEM-DEMO-LOCAL");

    fireEvent.change(screen.getByPlaceholderText("np. 24.95"), {
      target: { value: "25.1" },
    });
    const commentFields = screen.getAllByPlaceholderText(
      "Opcjonalna notatka albo numer przyrzadu",
    );
    fireEvent.change(commentFields[0]!, {
      target: { value: "Pomiar OK" },
    });
    fireEvent.change(screen.getByPlaceholderText("Wpisz odczyt lub wynik obserwacji"), {
      target: { value: "A2-70" },
    });
    fireEvent.change(commentFields[1]!, {
      target: { value: "Etykieta OK" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Zapisz kontrole QC" }));

    await screen.findByText(/Kontrola zakonczona PASS/);
    await screen.findByText("Qc Passed");

    await waitFor(() => {
      const createRunCall = fetchMock.mock.calls.find(
        ([url]) => String(url) === "/api/qc-runs",
      );
      expect(createRunCall).toBeDefined();
      const requestInit = createRunCall?.[1] as RequestInit;
      expect(JSON.parse(String(requestInit.body))).toMatchObject({
        barcode_value: "QCBC-DEMO-LOCAL",
        work_session_id: "WS-QA-001",
        operator_id: "QCOP-DEMO-LOCAL",
      });
    });

    const textStepCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/steps/STEP-002/result"),
    );
    expect(textStepCall).toBeDefined();
    expect(JSON.parse(String((textStepCall?.[1] as RequestInit).body))).toMatchObject({
      status: "PASS",
      observed_value: "A2-70",
      comment: "Etykieta OK",
    });
  });

  it("logowanie RFID automatycznie uzupelnia login operatora", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/operators")) {
        return jsonResponse([
          {
            id: "OP-ROW-001",
            operator_id: "QCOP-DEMO-LOCAL",
            full_name: "Demo QC Inspector",
            role: "QUALITY_INSPECTOR",
            login_name: "qc-demo-local",
            rfid_uid_hash: "QCRFID-DEMO-LOCAL",
            is_active: true,
            created_at: "2026-05-03T08:00:00Z",
          },
        ]);
      }

      if (url.endsWith("/api/workstations")) {
        return jsonResponse([
          {
            id: "WS-ROW-001",
            workstation_id: "QCWS-DEMO-LOCAL",
            name: "QC Station Demo",
            area: "QA",
            station_type: "QC",
            is_active: true,
          },
        ]);
      }

      if (url.endsWith("/api/qc-checklists")) {
        return jsonResponse([
          {
            id: "CHK-001",
            checklist_code: "QC-STATION-DEMO-LOCAL",
            name: "Kontrola wentylatora",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            device_type: null,
            variant_code: null,
            component_type: null,
            skip_component_qc: false,
            reference_image_file_id: null,
            is_active: true,
            created_at: "2026-05-03T08:00:00Z",
          },
        ]);
      }

      if (url.endsWith("/api/auth/rfid-login") && method === "POST") {
        return jsonResponse({
          id: "SESSION-ROW-002",
          work_session_id: "WS-QA-002",
          operator_id: "QCOP-DEMO-LOCAL",
          workstation_id: "QCWS-DEMO-LOCAL",
          machine_id: null,
          status: "ACTIVE",
          started_at: "2026-05-03T08:15:00Z",
          ended_at: null,
        });
      }

      if (url.endsWith("/api/qc-checklists/QC-STATION-DEMO-LOCAL/steps")) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/qc-station");

    render(<App />);

    await screen.findByText(/Logowanie RFID/);

    fireEvent.change(screen.getByPlaceholderText("Przyluz karte albo wpisz UID"), {
      target: { value: "QCRFID-DEMO-LOCAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Zaloguj przez RFID" }));

    await screen.findByText("Sesja stanowiskowa");
    await screen.findByText("Demo QC Inspector");
    await screen.findByText(/RFID rozpoznane/);

    fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));

    await screen.findByDisplayValue("qc-demo-local");
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}
