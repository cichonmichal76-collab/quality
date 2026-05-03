import { describe, expect, it } from "vitest";

import {
  buildComponentQueueCsv,
  buildDashboardCsvFileName,
  buildServiceSessionQueueCsv,
  buildShipmentQueueCsv,
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

describe("buildDashboardCsvFileName", () => {
  it("tworzy stabilnÄ… nazwÄ™ pliku dla eksportu kolejek", () => {
    const timestamp = new Date("2026-05-02T16:07:08Z");

    expect(buildDashboardCsvFileName("shipment", timestamp)).toBe(
      "servicetrace-wysylka-20260502-160708.csv",
    );
    expect(buildDashboardCsvFileName("components", timestamp)).toBe(
      "servicetrace-komponenty-20260502-160708.csv",
    );
    expect(buildDashboardCsvFileName("service", timestamp)).toBe(
      "servicetrace-commissioning-serwis-20260502-160708.csv",
    );
  });
});

describe("buildShipmentQueueCsv", () => {
  it("eksportuje wiersze shipment queue z kodami i labelami", () => {
    const csv = buildShipmentQueueCsv({
      total_devices: 1,
      ready_count: 1,
      blocked_count: 0,
      returned_count: 1,
      offset: 0,
      limit: 100,
      has_more: false,
      next_offset: null,
      filters: {},
      blocking_summary: [],
      primary_blocking_summary: [],
      recommended_action_summary: [],
      latest_shipment_gate_result_summary: [],
      production_status_summary: [],
      devices: [
        {
          device_serial_number: "SHIP-001",
          device_type: "DEMO-OPS",
          device_variant_code: "DEFAULT",
          production_status: "FINAL_TEST_PASSED",
          device_created_at: "2026-05-01T08:00:00Z",
          device_updated_at: "2026-05-01T09:00:00Z",
          final_test_passed: true,
          has_critical_open_ncr: false,
          critical_open_ncr_ids: ["NCR-001"],
          bom_compliance: {
            passes_bom_gate: true,
            installed_component_count: 1,
            missing_required_components: ["FAN_MODULE"],
            over_installed_components: [],
            unexpected_component_types: [],
            blocking_reason: null,
          },
          can_transition_to_ready_for_shipment: true,
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_PASSED",
            result: "PASS",
            message: "Ready",
            recommended_action: "MARK_READY_FOR_SHIPMENT",
            created_at: "2026-05-01T09:05:00Z",
          },
          primary_blocking_code: "BOM_REQUIRED_COMPONENTS_MISSING",
          primary_blocking_message: "Brakuje FAN_MODULE",
          recommended_action: "COMPLETE_ASSEMBLY",
          blocking_reasons: ["FAN_MODULE", 'Reason with "quotes"'],
        },
      ],
    });

    expect(csv).toContain(
      "device_serial_number,device_type,device_variant_code,production_status",
    );
    expect(csv).toContain("SHIP-001,DEMO-OPS,DEFAULT,FINAL_TEST_PASSED");
    expect(csv).toContain("COMPLETE_ASSEMBLY");
    expect(csv).toContain("MARK_READY_FOR_SHIPMENT");
    expect(csv).toContain('"FAN_MODULE | Reason with ""quotes"""');
  });
});

describe("buildComponentQueueCsv", () => {
  it("eksportuje wiersze component queue z podstawowymi metadanymi", () => {
    const csv = buildComponentQueueCsv({
      total_devices: 1,
      devices_with_issues: 1,
      returned_count: 1,
      offset: 0,
      limit: 100,
      has_more: false,
      next_offset: null,
      filters: {},
      quality_status_summary: [],
      variant_code_summary: [],
      production_status_summary: [],
      primary_quality_status_summary: [],
      component_quality_gate_summary: [],
      staleness_summary: [],
      component_type_summary: [],
      blocking_component_type_summary: [],
      primary_blocking_component_type_summary: [],
      recommended_action_summary: [],
      devices: [
        {
          device_serial_number: "COMP-001",
          device_type: "DEMO-OPS",
          device_variant_code: "DEFAULT",
          production_status: "FINAL_TEST_PASSED",
          device_created_at: "2026-05-01T08:00:00Z",
          device_updated_at: "2026-05-01T09:00:00Z",
          stale_bucket: "D1_TO_D3",
          total_installed_components: 2,
          passing_components: 1,
          blocked_components: 1,
          passes_component_quality_gate: false,
          primary_quality_status: "QC_NOT_PASSED",
          primary_blocking_component_type: "FAN_MODULE",
          primary_blocking_component_serial_number: "FAN-001",
          recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
        },
      ],
    });

    expect(csv).toContain(
      "device_serial_number,device_type,device_variant_code,production_status",
    );
    expect(csv).toContain("COMP-001,DEMO-OPS,DEFAULT,FINAL_TEST_PASSED");
    expect(csv).toContain("QC_NOT_PASSED");
    expect(csv).toContain("RUN_COMPONENT_QC_OR_REWORK");
    expect(csv).toContain("D1_TO_D3");
  });
});

describe("buildServiceSessionQueueCsv", () => {
  it("eksportuje wiersze kolejki commissioning z triggerem i uploadem", () => {
    const csv = buildServiceSessionQueueCsv({
      total_sessions: 1,
      reuploaded_sessions: 1,
      returned_count: 1,
      offset: 0,
      limit: 100,
      has_more: false,
      next_offset: null,
      filters: {},
      upload_status_summary: [],
      result_summary: [],
      device_type_summary: [],
      technician_summary: [],
      trigger_source_summary: [],
      sessions: [
        {
          id: "svc-row-001",
          session_id: "SVC-001",
          device_serial_number: "DEVICE-001",
          device_type: "DEMO-SVC",
          technician_id: "TECH-A",
          result: "HOLD",
          firmware_version: "1.0.0",
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

    expect(csv).toContain(
      "session_id,device_serial_number,device_type,technician_id,result",
    );
    expect(csv).toContain("SVC-001,DEVICE-001,DEMO-SVC,TECH-A,HOLD");
    expect(csv).toContain("AUTO_NETWORK");
    expect(csv).toContain("UPLOADED");
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
