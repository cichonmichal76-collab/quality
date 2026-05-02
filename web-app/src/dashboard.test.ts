import { describe, expect, it } from "vitest";

import {
  formatDurationLabel,
  humanizeCode,
  labelForCode,
  percentage,
} from "./dashboard";

describe("labelForCode", () => {
  it("tłumaczy kluczowe kody operacyjne", () => {
    expect(labelForCode("MARK_READY_FOR_SHIPMENT")).toBe(
      "Oznacz gotowe do wysyłki",
    );
    expect(labelForCode("RUN_COMPONENT_QC_OR_REWORK")).toBe(
      "Uruchom QC komponentu / rework",
    );
  });

  it("obsługuje booleany i brak danych", () => {
    expect(labelForCode(true)).toBe("Tak");
    expect(labelForCode(false)).toBe("Nie");
    expect(labelForCode("true")).toBe("Tak");
    expect(labelForCode("false")).toBe("Nie");
    expect(labelForCode(null)).toBe("Brak danych");
  });
});

describe("formatDurationLabel", () => {
  it("formatuje sekundy i minuty dla auto-odświeżania", () => {
    expect(formatDurationLabel(5000)).toBe("5 s");
    expect(formatDurationLabel(30000)).toBe("30 s");
    expect(formatDurationLabel(60000)).toBe("1 min");
  });
});

describe("humanizeCode", () => {
  it("formatuje nieznane kody w czytelny label", () => {
    expect(humanizeCode("SOME_NEW_STATUS")).toBe("Some New Status");
  });
});

describe("percentage", () => {
  it("zabezpiecza dzielenie przez zero", () => {
    expect(percentage(3, 0)).toBe("0%");
  });

  it("liczy procent zaokrąglony do liczby całkowitej", () => {
    expect(percentage(2, 3)).toBe("67%");
  });
});
