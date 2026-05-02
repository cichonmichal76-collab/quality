import { afterEach, describe, expect, it, vi } from "vitest";

import { buildQuery, joinApiUrl, optionalBoolean, updateDeviceStatus } from "./api";

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
