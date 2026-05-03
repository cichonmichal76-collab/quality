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

      if (url.includes("/api/qc-waiting-items")) {
        return jsonResponse([
          {
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
            current_status: "PRODUCED",
            produced_at: "2026-05-03T08:10:00Z",
            created_at: "2026-05-03T08:10:00Z",
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
            region_x: 14,
            region_y: 18,
            region_width: 58,
            region_height: 34,
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
            region_x: 62,
            region_y: 60,
            region_width: 24,
            region_height: 18,
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
    expect(screen.getByText("K1")).toBeInTheDocument();
    expect(screen.getByText("K2")).toBeInTheDocument();

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

      if (url.includes("/api/qc-waiting-items")) {
        return jsonResponse([]);
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

  it("klikniecie komponentu z kolejki oczekujacych podstawia detal do kontroli", async () => {
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
            component_type: "FAN_MODULE",
            skip_component_qc: false,
            reference_image_file_id: null,
            is_active: true,
            created_at: "2026-05-03T08:00:00Z",
          },
        ]);
      }

      if (url.includes("/api/qc-waiting-items")) {
        return jsonResponse([
          {
            id: "ITEM-ROW-QUEUE",
            item_serial_number: "QCITEM-DEMO-QUEUE",
            barcode_value: "QCBC-DEMO-QUEUE",
            item_type: "FAN_MODULE",
            part_number: "PN-FAN-002",
            revision: "B",
            drawing_number: null,
            drawing_revision: null,
            production_order: null,
            material_batch: null,
            machine_id: null,
            created_by_operator_id: "QCOP-DEMO-LOCAL",
            current_status: "PRODUCED",
            produced_at: "2026-05-03T08:15:00Z",
            created_at: "2026-05-03T08:15:00Z",
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
            title: "Sprawdz wyglad",
            instruction: "Porownaj detal ze wzorcem.",
            control_area: "Front",
            evaluation_mode: "MANUAL",
            result_input_label: null,
            region_x: null,
            region_y: null,
            region_width: null,
            region_height: null,
            requires_photo: false,
            requires_measurement: false,
            blocking_on_fail: true,
            expected_value: null,
            unit: null,
            tolerance_min: null,
            tolerance_max: null,
          },
        ]);
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
    await screen.findByTestId("qc-waiting-list");
    fireEvent.click(screen.getByRole("button", { name: /QCITEM-DEMO-QUEUE/i }));

    expect(
      screen
        .getByText("Serial komponentu")
        .closest(".detail-card")
        ?.textContent,
    ).toContain("QCITEM-DEMO-QUEUE");
    expect(screen.getByDisplayValue("QCBC-DEMO-QUEUE")).toBeInTheDocument();
    expect(screen.getByText(/1 oczekuje/i)).toBeInTheDocument();
  });

  it("dobiera checkliste po typie komponentu i wymaga danych dla FAIL", async () => {
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
            id: "CHK-GENERIC",
            checklist_code: "QC-GENERIC",
            name: "Checklista ogolna",
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
          {
            id: "CHK-SEAL",
            checklist_code: "QC-SEAL",
            name: "Kontrola silikonu",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            device_type: null,
            variant_code: null,
            component_type: "SILICONE_PACK",
            skip_component_qc: false,
            reference_image_file_id: null,
            is_active: true,
            created_at: "2026-05-03T08:00:00Z",
          },
        ]);
      }

      if (url.includes("/api/qc-waiting-items")) {
        return jsonResponse([
          {
            id: "ITEM-ROW-FAIL",
            item_serial_number: "QCITEM-DEMO-FAIL",
            barcode_value: "QCBC-DEMO-FAIL",
            item_type: "SILICONE_PACK",
            part_number: "PN-SIL-001",
            revision: "A",
            drawing_number: null,
            drawing_revision: null,
            production_order: null,
            material_batch: null,
            machine_id: null,
            created_by_operator_id: "QCOP-DEMO-LOCAL",
            current_status: "REWORK_REQUIRED",
            produced_at: "2026-05-03T08:16:00Z",
            created_at: "2026-05-03T08:16:00Z",
          },
        ]);
      }

      if (url.endsWith("/api/auth/operator-login") && method === "POST") {
        return jsonResponse({
          id: "SESSION-ROW-FAIL",
          work_session_id: "WS-QA-FAIL",
          operator_id: "QCOP-DEMO-LOCAL",
          workstation_id: "QCWS-DEMO-LOCAL",
          machine_id: null,
          status: "ACTIVE",
          started_at: "2026-05-03T08:10:00Z",
          ended_at: null,
        });
      }

      if (url.endsWith("/api/qc-checklists/QC-GENERIC/steps")) {
        return jsonResponse([]);
      }

      if (url.endsWith("/api/qc-checklists/QC-SEAL/steps")) {
        return jsonResponse([
          {
            id: "STEP-FAIL-001",
            checklist_id: "CHK-SEAL",
            step_order: 1,
            title: "Udokumentuj stan powloki",
            instruction: "Sprawdz czy silikon nie ma pekniec i sladow zabrudzen.",
            control_area: "Powierzchnia worka",
            evaluation_mode: "MANUAL",
            result_input_label: null,
            region_x: null,
            region_y: null,
            region_width: null,
            region_height: null,
            requires_photo: true,
            requires_measurement: false,
            blocking_on_fail: true,
            expected_value: null,
            unit: null,
            tolerance_min: null,
            tolerance_max: null,
          },
        ]);
      }

      if (url.endsWith("/api/qc-runs") && method === "POST") {
        return jsonResponse({
          id: "QC-ROW-FAIL",
          run_id: "QC-WEB-FAIL",
          item_serial_number: "QCITEM-DEMO-FAIL",
          barcode_value: "QCBC-DEMO-FAIL",
          checklist_id: "CHK-SEAL",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-FAIL",
          operator_id: "QCOP-DEMO-LOCAL",
          status: "IN_PROGRESS",
          result: null,
          started_at: "2026-05-03T08:17:00Z",
          ended_at: null,
        });
      }

      if (url.endsWith("/api/files/upload") && method === "POST") {
        return jsonResponse({
          id: "FILE-FAIL-001",
          related_entity_type: "QC_RUN",
          related_entity_id: "QC-WEB-FAIL",
          file_name: "evidence.jpg",
          file_path: "/storage/qc/evidence.jpg",
          file_type: "image/jpeg",
          file_hash: "hash-fail-001",
          uploaded_by: "QCOP-DEMO-LOCAL",
          created_at: "2026-05-03T08:18:00Z",
        });
      }

      if (url.endsWith("/steps/STEP-FAIL-001/result") && method === "POST") {
        return jsonResponse({
          id: "STEP-RESULT-FAIL-001",
          qc_run_id: "QC-WEB-FAIL",
          step_id: "STEP-FAIL-001",
          status: "FAIL",
          comment: "Rysa na worku silikonowym",
        });
      }

      if (url.endsWith("/complete") && method === "POST") {
        return jsonResponse({
          id: "QC-ROW-FAIL",
          run_id: "QC-WEB-FAIL",
          item_serial_number: "QCITEM-DEMO-FAIL",
          barcode_value: "QCBC-DEMO-FAIL",
          checklist_id: "CHK-SEAL",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-FAIL",
          operator_id: "QCOP-DEMO-LOCAL",
          status: "COMPLETED",
          result: "FAIL",
          started_at: "2026-05-03T08:17:00Z",
          ended_at: "2026-05-03T08:19:00Z",
        });
      }

      if (url.endsWith("/api/production-items/by-barcode/QCBC-DEMO-FAIL")) {
        return jsonResponse({
          id: "ITEM-ROW-FAIL",
          item_serial_number: "QCITEM-DEMO-FAIL",
          barcode_value: "QCBC-DEMO-FAIL",
          item_type: "SILICONE_PACK",
          part_number: "PN-SIL-001",
          revision: "A",
          drawing_number: null,
          drawing_revision: null,
          production_order: null,
          material_batch: null,
          machine_id: null,
          created_by_operator_id: "QCOP-DEMO-LOCAL",
          current_status: "QC_FAILED",
          produced_at: "2026-05-03T08:16:00Z",
          created_at: "2026-05-03T08:16:00Z",
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
    fireEvent.click(screen.getByRole("button", { name: /QCITEM-DEMO-FAIL/i }));

    await screen.findByText(/Aktywna checklista: Kontrola silikonu/);
    await screen.findByText("Udokumentuj stan powloki");

    fireEvent.change(screen.getByLabelText("Wynik kroku"), {
      target: { value: "FAIL" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Zapisz kontrole QC" }));
    await screen.findByText("Dla wyniku FAIL wybierz powod niezgodnosci.");

    fireEvent.change(screen.getByLabelText("Powod niezgodnosci"), {
      target: { value: "VISUAL_DEFECT" },
    });
    fireEvent.change(screen.getByLabelText("Komentarz do FAIL"), {
      target: { value: "Rysa na worku silikonowym" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Zapisz kontrole QC" }));
    await screen.findByText(
      "Ta checklista wymaga dodania przynajmniej jednego zdjecia dowodowego.",
    );

    const evidenceFile = new File(["evidence"], "evidence.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(screen.getByLabelText(/Zdjecia dowodowe/), {
      target: { files: [evidenceFile] },
    });

    await screen.findByTestId("qc-evidence-list");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz kontrole QC" }));

    await screen.findByText(/Kontrola zakonczona FAIL/);
    await screen.findByText("Qc Failed");
    expect(screen.getByText("evidence.jpg")).toBeInTheDocument();

    const uploadCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/files/upload",
    );
    expect(uploadCall).toBeDefined();

    const completeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/complete"),
    );
    expect(String((completeCall?.[1] as RequestInit).body)).toContain(
      "failure_reason=VISUAL_DEFECT",
    );
    expect(String((completeCall?.[1] as RequestInit).body)).toContain(
      "failure_comment=Rysa+na+worku+silikonowym",
    );
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
