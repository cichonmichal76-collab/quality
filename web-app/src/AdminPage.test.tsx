import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { App } from "./App";

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
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}
