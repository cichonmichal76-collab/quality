import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { App } from "./App";
import { jsonResponse } from "./TestHttpUtils";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminPage", () => {
  it("dodaje operatora z panelu administracyjnego", async () => {
    const operators = [
      {
        id: "OP-ROW-001",
        operator_id: "QCOP-EXISTING",
        full_name: "Istniejacy operator",
        role: "QUALITY_INSPECTOR",
        login_name: "qc-existing",
        rfid_uid_hash: "RFID-EXISTING",
        is_active: true,
        created_at: "2026-05-03T08:00:00Z",
      },
    ];
    const workstations = [
      {
        id: "WS-ROW-001",
        workstation_id: "QCWS-001",
        name: "Stacja QC 1",
        area: "QA",
        station_type: "QC",
        is_active: true,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/operators") && method === "GET") {
        return jsonResponse(operators);
      }

      if (url.endsWith("/api/workstations") && method === "GET") {
        return jsonResponse(workstations);
      }

      if (url.endsWith("/api/operators") && method === "POST") {
        const payload = JSON.parse(String(init?.body));
        operators.unshift({
          id: "OP-ROW-NEW",
          operator_id: payload.operator_id,
          full_name: payload.full_name,
          role: payload.role,
          login_name: payload.login_name,
          rfid_uid_hash: payload.rfid_uid_hash,
          is_active: payload.is_active,
          created_at: "2026-05-03T10:00:00Z",
        });
        return jsonResponse(operators[0]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/admin");

    render(<App />);

    await screen.findByText("Lista operatorow");

    fireEvent.change(screen.getByPlaceholderText("np. QCOP-LINIA-01"), {
      target: { value: "QCOP-NEW-01" },
    });
    fireEvent.change(screen.getByPlaceholderText("np. Jan Kowalski"), {
      target: { value: "Jan Kowalski" },
    });
    fireEvent.change(screen.getByDisplayValue("QUALITY_INSPECTOR"), {
      target: { value: "QUALITY_MANAGER" },
    });
    fireEvent.change(screen.getByPlaceholderText("np. qc-linia-01"), {
      target: { value: "qc-new-01" },
    });
    fireEvent.change(screen.getByPlaceholderText("np. Secret123!"), {
      target: { value: "Secret123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("np. QCRFID-LINIA-01"), {
      target: { value: "RFID-NEW-01" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Dodaj operatora" }));

    await screen.findByText("Dodano operatora QCOP-NEW-01.");
    await screen.findByText("Jan Kowalski");
    await screen.findByText(/Login qc-new-01/);
  });

  it("edytuje stanowisko QC i pozwala je dezaktywowac", async () => {
    const operators = [
      {
        id: "OP-ROW-001",
        operator_id: "QCOP-EXISTING",
        full_name: "Istniejacy operator",
        role: "QUALITY_INSPECTOR",
        login_name: "qc-existing",
        rfid_uid_hash: "RFID-EXISTING",
        is_active: true,
        created_at: "2026-05-03T08:00:00Z",
      },
    ];
    const workstations = [
      {
        id: "WS-ROW-001",
        workstation_id: "QCWS-001",
        name: "Stacja QC 1",
        area: "QA",
        station_type: "QC",
        is_active: true,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/operators") && method === "GET") {
        return jsonResponse(operators);
      }

      if (url.endsWith("/api/workstations") && method === "GET") {
        return jsonResponse(workstations);
      }

      if (url.endsWith("/api/workstations/QCWS-001") && method === "PATCH") {
        const payload = JSON.parse(String(init?.body));
        workstations[0] = {
          ...workstations[0],
          ...payload,
        };
        return jsonResponse(workstations[0]);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/admin");

    render(<App />);

    await screen.findByText("Lista operatorow");
    fireEvent.click(screen.getByRole("button", { name: "Stanowiska QC" }));

    await screen.findByText("Lista stanowisk QC");
    fireEvent.click(screen.getByRole("button", { name: "Edytuj" }));

    const nameField = screen.getByDisplayValue("Stacja QC 1");
    fireEvent.change(nameField, { target: { value: "Stacja koncowa QC" } });
    fireEvent.change(screen.getByDisplayValue("QA"), {
      target: { value: "LAB" },
    });
    fireEvent.change(screen.getByDisplayValue("QC"), {
      target: { value: "FINAL_QC" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Stanowisko aktywne" }));

    fireEvent.click(screen.getByRole("button", { name: "Zapisz stanowisko" }));

    await screen.findByText("Zapisano stanowisko QCWS-001.");
    await screen.findByText("Stacja koncowa QC");
    await screen.findByText(/Typ stanowiska FINAL_QC/);
    await screen.findByText("NIEAKTYWNE");
  });

  it("konfiguruje kontrole komponentu z BOM wraz ze zdjeciem i rysowaniem obszaru na obrazie", async () => {
    let configurationLoaded = false;
    const operators: Array<Record<string, unknown>> = [];
    const workstations: Array<Record<string, unknown>> = [];
    const createObjectUrl = vi.fn(() => "blob:qc-reference-preview");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/operators") && method === "GET") {
        return jsonResponse(operators);
      }

      if (url.endsWith("/api/workstations") && method === "GET") {
        return jsonResponse(workstations);
      }

      if (
        url.endsWith("/api/qc-product-configurations/DEMO-OPS?variant_code=DEFAULT") &&
        method === "GET"
      ) {
        return jsonResponse({
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          items: [
            {
              component_type: "SCREW_M4",
              substitution_group: null,
              required_part_number: "M4-12",
              required_revision: null,
              required_drawing_number: null,
              required_drawing_revision: null,
              quantity_required: 4,
              is_required: true,
              checklist_code: configurationLoaded ? "QC-DEMO-OPS-DEFAULT-SCREW-M4" : null,
              checklist_name: configurationLoaded ? "Kontrola sruby M4" : null,
              checklist_version: configurationLoaded ? "1.0" : null,
              checklist_is_active: configurationLoaded,
              skip_component_qc: false,
              reference_image_file_id: configurationLoaded ? "FILE-001" : null,
              configured_step_count: configurationLoaded ? 1 : 0,
            },
          ],
        });
      }

      if (
        url.includes("/api/qc-checklists?device_type=DEMO-OPS") &&
        method === "GET"
      ) {
        return jsonResponse([
          {
            id: "CHK-001",
            checklist_code: "QC-DEMO-OPS-DEFAULT-SCREW-M4",
            name: "Kontrola sruby M4",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            device_type: "DEMO-OPS",
            variant_code: "DEFAULT",
            component_type: "SCREW_M4",
            skip_component_qc: false,
            reference_image_file_id: "FILE-001",
            is_active: true,
            created_at: "2026-05-03T11:00:00Z",
          },
        ]);
      }

      if (
        url.endsWith("/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/steps") &&
        method === "GET"
      ) {
        return jsonResponse([
          {
            id: "STEP-001",
            checklist_id: "CHK-001",
            step_order: 1,
            title: "Zweryfikuj oznaczenie",
            instruction: "Porownaj oznaczenie z wzorcem.",
            control_area: "Glowka sruby",
            evaluation_mode: "TEXT_MATCH",
            result_input_label: "Wpisz oznaczenie",
            region_x: 62,
            region_y: 58,
            region_width: 20,
            region_height: 16,
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

      if (url.endsWith("/api/qc-checklists") && method === "POST") {
        configurationLoaded = true;
        return jsonResponse({
          id: "CHK-001",
          checklist_code: "QC-DEMO-OPS-DEFAULT-SCREW-M4",
          name: "Kontrola sruby M4",
          process_stage: "COMPONENT_QC",
          version: "1.0",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          component_type: "SCREW_M4",
          skip_component_qc: false,
          reference_image_file_id: null,
          is_active: true,
          created_at: "2026-05-03T11:00:00Z",
        });
      }

      if (
        url.endsWith("/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/reference-image") &&
        method === "POST"
      ) {
        return jsonResponse({
          id: "CHK-001",
          checklist_code: "QC-DEMO-OPS-DEFAULT-SCREW-M4",
          name: "Kontrola sruby M4",
          process_stage: "COMPONENT_QC",
          version: "1.0",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          component_type: "SCREW_M4",
          skip_component_qc: false,
          reference_image_file_id: "FILE-001",
          is_active: true,
          created_at: "2026-05-03T11:00:00Z",
        });
      }

      if (
        url.endsWith("/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/steps") &&
        method === "POST"
      ) {
        return jsonResponse({
          id: "STEP-001",
          checklist_id: "CHK-001",
          step_order: 1,
          title: "Zweryfikuj oznaczenie",
          instruction: "Porownaj oznaczenie z wzorcem.",
            control_area: "Glowka sruby",
            evaluation_mode: "TEXT_MATCH",
            result_input_label: "Wpisz oznaczenie",
            region_x: 62,
            region_y: 58,
            region_width: 20,
            region_height: 16,
            requires_photo: false,
            requires_measurement: false,
            blocking_on_fail: true,
          expected_value: "A2-70",
          unit: null,
          tolerance_min: null,
          tolerance_max: null,
        });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/admin");

    render(<App />);

    await screen.findByText("Lista operatorow");
    fireEvent.click(screen.getByRole("button", { name: "Produkt QC" }));

    fireEvent.change(screen.getByLabelText("Typ produktu"), {
      target: { value: "DEMO-OPS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pobierz komponenty BOM" }));

    await screen.findByText("Brak konfiguracji");
    fireEvent.click(screen.getByRole("button", { name: "Skonfiguruj" }));

    fireEvent.change(screen.getByLabelText("Nazwa checklisty"), {
      target: { value: "Kontrola sruby M4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj krok" }));
    fireEvent.change(screen.getByPlaceholderText("np. Sprawdz dlugosc sruby"), {
      target: { value: "Zweryfikuj oznaczenie" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Opisz procedure i sposob kontroli dla operatora."),
      {
        target: { value: "Porownaj oznaczenie z wzorcem." },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("np. Glowka sruby / gwint / etykieta"), {
      target: { value: "Glowka sruby" },
    });
    fireEvent.change(screen.getByLabelText("Tryb oceny"), {
      target: { value: "TEXT_MATCH" },
    });
    fireEvent.change(screen.getByPlaceholderText("np. Wpisz odczyt oznaczenia"), {
      target: { value: "Wpisz oznaczenie" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("np. A2-70 albo Czytelna etykieta"),
      {
        target: { value: "A2-70" },
      },
    );
    const file = new File(["demo-image"], "screw.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Zdjecie referencyjne elementu"), {
      target: { files: [file] },
    });

    const stage = screen.getByTestId("qc-reference-stage");
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        toJSON: () => "",
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Ustaw z obrazu" }));
    fireEvent.mouseDown(stage, { button: 0, clientX: 40, clientY: 20 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 60 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 60 });

    await screen.findByText("K1");
    expect((screen.getByPlaceholderText("np. 12") as HTMLInputElement).value).toBe("20");
    expect((screen.getByPlaceholderText("np. 18") as HTMLInputElement).value).toBe("20");
    expect((screen.getByPlaceholderText("np. 36") as HTMLInputElement).value).toBe("50");
    expect((screen.getByPlaceholderText("np. 24") as HTMLInputElement).value).toBe("40");

    const activeRegion = screen.getByTestId(/qc-reference-region-/);
    fireEvent.mouseDown(activeRegion, { button: 0, clientX: 60, clientY: 30 });
    fireEvent.mouseMove(window, { clientX: 80, clientY: 40 });
    fireEvent.mouseUp(window, { clientX: 80, clientY: 40 });

    expect((screen.getByPlaceholderText("np. 12") as HTMLInputElement).value).toBe("30");
    expect((screen.getByPlaceholderText("np. 18") as HTMLInputElement).value).toBe("30");
    expect((screen.getByPlaceholderText("np. 36") as HTMLInputElement).value).toBe("50");
    expect((screen.getByPlaceholderText("np. 24") as HTMLInputElement).value).toBe("40");

    const resizeHandle = screen.getByLabelText("Zmien rozmiar z prawego dolnego rogu");
    fireEvent.mouseDown(resizeHandle, { button: 0, clientX: 160, clientY: 70 });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 90 });
    fireEvent.mouseUp(window, { clientX: 180, clientY: 90 });

    expect((screen.getByPlaceholderText("np. 12") as HTMLInputElement).value).toBe("30");
    expect((screen.getByPlaceholderText("np. 18") as HTMLInputElement).value).toBe("30");
    expect((screen.getByPlaceholderText("np. 36") as HTMLInputElement).value).toBe("60");
    expect((screen.getByPlaceholderText("np. 24") as HTMLInputElement).value).toBe("60");

    fireEvent.click(screen.getByRole("button", { name: "Zapisz konfiguracje produktu QC" }));

    await screen.findByText(/Zapisano konfiguracje QC dla SCREW_M4/);
    await screen.findByText("SKONFIGUROWANY");
    const createStepCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/steps") &&
        (init?.method ?? "GET") === "POST",
    );
    expect(createStepCall).toBeDefined();
    expect(JSON.parse(String((createStepCall?.[1] as RequestInit).body))).toMatchObject({
      region_x: 30,
      region_y: 30,
      region_width: 60,
      region_height: 60,
    });
  });
});
