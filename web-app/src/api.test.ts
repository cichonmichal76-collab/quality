import { describe, expect, it } from "vitest";

import { buildQuery, joinApiUrl, optionalBoolean } from "./api";

describe("buildQuery", () => {
  it("pomija puste wartości i serializuje booleany", () => {
    expect(
      buildQuery({
        device_type: "ZSS-VENT",
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
