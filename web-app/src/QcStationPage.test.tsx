import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("QcStationPage", () => {
  it("obsługuje lookup komponentu i zapis runu QC z pomiarem", async () => {
    let barcodeLookupCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/work-sessions")) {
        return jsonResponse([
          {
            id: "ROW-WS-001",
            work_session_id: "WS-QA-001",
            operator_id: "OP-QA-001",
            workstation_id: "QC-ST-01",
            machine_id: null,
            status: "ACTIVE",
            started_at: "2026-05-03T08:00:00Z",
            ended_at: null,
          },
        ]);
      }

      if (url.endsWith("/api/operators")) {
        return jsonResponse([
          {
            id: "ROW-OP-001",
            operator_id: "OP-QA-001",
            full_name: "Anna Kontrola",
            role: "QUALITY_INSPECTOR",
            rfid_uid_hash: null,
            is_active: true,
            created_at: "2026-05-03T07:55:00Z",
          },
        ]);
      }

      if (url.endsWith("/api/qc-checklists")) {
        return jsonResponse([
          {
            id: "CHK-001",
            checklist_code: "QC-COMP-001",
            name: "Kontrola wentylatora",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            is_active: true,
            created_at: "2026-05-03T08:05:00Z",
          },
        ]);
      }

      if (url.endsWith("/api/qc-checklists/QC-COMP-001/steps")) {
        return jsonResponse([
          {
            id: "STEP-001",
            checklist_id: "CHK-001",
            step_order: 1,
            title: "Zmierz szerokość",
            instruction: "Użyj suwmiarki cyfrowej.",
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
            title: "Zatwierdź etykietę",
            instruction: "Sprawdź zgodność nadruku z kartą kontroli.",
            requires_photo: false,
            requires_measurement: false,
            blocking_on_fail: true,
            expected_value: "Czytelna",
            unit: null,
            tolerance_min: null,
            tolerance_max: null,
          },
        ]);
      }

      if (url.endsWith("/api/production-items/by-barcode/BC-FAN-001")) {
        barcodeLookupCount += 1;
        return jsonResponse({
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
          created_by_operator_id: "OP-QA-001",
          current_status: barcodeLookupCount > 1 ? "QC_PASSED" : "PRODUCED",
          produced_at: "2026-05-03T08:10:00Z",
          created_at: "2026-05-03T08:10:00Z",
        });
      }

      if (url.endsWith("/api/qc-runs") && method === "POST") {
        return jsonResponse({
          run_id: "QC-WEB-TEST-001",
          item_serial_number: "FAN-001",
          barcode_value: "BC-FAN-001",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "OP-QA-001",
          id: "QC-ROW-001",
          status: "IN_PROGRESS",
          result: null,
          started_at: "2026-05-03T08:20:00Z",
          ended_at: null,
        });
      }

      if (
        url.includes("/api/qc-runs/") &&
        url.endsWith("/steps/STEP-001/result")
      ) {
        return jsonResponse({
          id: "STEP-RESULT-001",
          qc_run_id: "QC-ROW-001",
          step_id: "STEP-001",
          status: "PASS",
          measurement_value: 25.0,
          comment: "Pomiar w normie",
          mcu_snapshot: null,
          created_at: "2026-05-03T08:20:30Z",
        });
      }

      if (
        url.includes("/api/qc-runs/") &&
        url.endsWith("/steps/STEP-002/result")
      ) {
        return jsonResponse({
          id: "STEP-RESULT-002",
          qc_run_id: "QC-ROW-001",
          step_id: "STEP-002",
          status: "PASS",
          measurement_value: null,
          comment: "Etykieta czytelna",
          mcu_snapshot: null,
          created_at: "2026-05-03T08:20:35Z",
        });
      }

      if (url.includes("/api/qc-runs/") && url.endsWith("/complete")) {
        return jsonResponse({
          run_id: "QC-WEB-TEST-001",
          item_serial_number: "FAN-001",
          barcode_value: "BC-FAN-001",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "OP-QA-001",
          id: "QC-ROW-001",
          status: "COMPLETED",
          result: "PASS",
          started_at: "2026-05-03T08:20:00Z",
          ended_at: "2026-05-03T08:20:40Z",
        });
      }

      throw new Error(`Nieobsłużony request testowy: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/qc-station");

    render(<App />);

    await screen.findByDisplayValue(/Kontrola wentylatora/);

    fireEvent.change(screen.getByPlaceholderText("np. BC-DEMO-001"), {
      target: { value: "BC-FAN-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pobierz detal" }));

    await screen.findByText("FAN-001");

    const measurementCard = screen.getByText("Zmierz szerokość").closest("article");
    const labelCard = screen.getByText("Zatwierdź etykietę").closest("article");

    expect(measurementCard).not.toBeNull();
    expect(labelCard).not.toBeNull();

    fireEvent.change(
      within(measurementCard as HTMLElement).getByPlaceholderText("np. 24.95"),
      {
        target: { value: "25.0" },
      },
    );
    fireEvent.change(
      within(measurementCard as HTMLElement).getByPlaceholderText(
        "Opcjonalna notatka, np. numer przyrządu lub obserwacja.",
      ),
      {
        target: { value: "Pomiar w normie" },
      },
    );
    fireEvent.change(within(labelCard as HTMLElement).getByRole("combobox"), {
      target: { value: "PASS" },
    });
    fireEvent.change(
      within(labelCard as HTMLElement).getByPlaceholderText(
        "Opcjonalna notatka, np. numer przyrządu lub obserwacja.",
      ),
      {
        target: { value: "Etykieta czytelna" },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Zapisz kontrolę QC" }));

    await screen.findByText(/Kontrola zakończona PASS/);
    expect(screen.getAllByText(/QC passed|QC_PASSED/i).length).toBeGreaterThan(0);

    await waitFor(() => {
      const createRunCall = fetchMock.mock.calls.find(
        ([url]) => String(url) === "/api/qc-runs",
      );
      expect(createRunCall).toBeDefined();

      const requestInit = createRunCall?.[1] as RequestInit;
      expect(requestInit.method).toBe("POST");
      expect(JSON.parse(String(requestInit.body))).toMatchObject({
        item_serial_number: "FAN-001",
        barcode_value: "BC-FAN-001",
        checklist_id: "CHK-001",
        process_stage: "COMPONENT_QC",
        operator_id: "OP-QA-001",
        work_session_id: "WS-QA-001",
      });
    });

    const firstStepCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/steps/STEP-001/result"),
    );
    const secondStepCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/steps/STEP-002/result"),
    );
    const completeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/complete"),
    );

    expect(firstStepCall).toBeDefined();
    expect(secondStepCall).toBeDefined();
    expect(completeCall).toBeDefined();
    expect(JSON.parse(String((firstStepCall?.[1] as RequestInit).body))).toEqual({
      status: "PASS",
      measurement_value: 25,
      comment: "Pomiar w normie",
    });
    expect(JSON.parse(String((secondStepCall?.[1] as RequestInit).body))).toEqual({
      status: "PASS",
      comment: "Etykieta czytelna",
    });
    expect((completeCall?.[1] as RequestInit).body).toBe("");
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
