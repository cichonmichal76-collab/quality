import type {
  DashboardMode,
  DeviceComponentQualityQueue,
  DeviceShipmentQueue,
} from "./api";

const CODE_LABELS: Record<string, string> = {
  ACTIVATE_OR_CONFIGURE_BOM: "Aktywuj lub skonfiguruj BOM",
  ACTIVE: "Aktywny",
  BLOCKED: "Zablokowane",
  BOM_OVER_INSTALLED_COMPONENTS: "Nadmiarowe komponenty BOM",
  BOM_REQUIRED_COMPONENTS_MISSING: "Brak wymaganych komponentów BOM",
  BOM_TEMPLATE_NOT_EFFECTIVE: "BOM nieaktywny",
  BOM_UNEXPECTED_COMPONENTS: "Nieoczekiwane komponenty BOM",
  BOUND_TEMPLATE: "BOM przypięty do urządzenia",
  blocked_components: "Liczba blokad",
  COMPONENT_CRITICAL_OPEN_NCR: "Krytyczne NCR komponentu",
  COMPONENT_QC_NOT_PASSED: "QC komponentu niezaliczone",
  COMPLETE_ASSEMBLY: "Dokończ montaż",
  created_at: "Data utworzenia",
  CREATED: "Utworzone",
  CRITICAL_NCR_OPEN: "Krytyczne NCR otwarte",
  CRITICAL_OPEN_NCR: "Krytyczne NCR otwarte",
  device_serial_number: "Numer seryjny",
  D1_TO_D3: "1-3 dni",
  D3_TO_D7: "3-7 dni",
  FINAL_TEST_NOT_PASSED: "Final test niezaliczony",
  FINAL_TEST_PASSED: "Final test zaliczony",
  FIX_ASSEMBLY_MISMATCH: "Napraw niezgodność montażu",
  GT_7D: "Powyżej 7 dni",
  LT_24H: "Poniżej 24h",
  MISSING: "Brak",
  MARK_READY_FOR_SHIPMENT: "Oznacz gotowe do wysyłki",
  NO_ACTION: "Bez akcji",
  NONE: "Brak decyzji",
  PASS: "Zaliczone",
  QC_NOT_PASSED: "QC niezaliczone",
  passes_component_quality_gate: "Wynik gate komponentów",
  primary_blocking_component_serial_number: "Serial blokującego komponentu",
  primary_blocking_component_type: "Typ blokującego komponentu",
  priority: "Priorytet",
  production_status: "Status produkcji",
  READY_FOR_SHIPMENT: "Gotowe do wysyłki",
  RESOLVE_COMPONENT_NCR: "Zamknij NCR komponentu",
  RESOLVE_COMPONENT_QUALITY: "Rozwiąż jakość komponentu",
  RESOLVE_CRITICAL_NCR: "Zamknij krytyczne NCR",
  recommended_action: "Rekomendowana akcja",
  RUN_COMPONENT_QC_OR_REWORK: "Uruchom QC komponentu / rework",
  RUN_FINAL_TEST: "Uruchom final test",
  SHIPMENT_GATE_BLOCKED: "Shipment gate zablokowany",
  SHIPMENT_GATE_PASSED: "Shipment gate zaliczony",
  SHIPPED: "Wysłane",
  stale_bucket: "Świeżość danych",
  true: "Tak",
  false: "Nie",
  updated_at: "Data aktualizacji",
  variant_code: "Wariant",
};

export function humanizeCode(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, (character) => character.toUpperCase());
}

export function labelForCode(
  value: string | boolean | null | undefined,
): string {
  if (value === true) {
    return "Tak";
  }

  if (value === false) {
    return "Nie";
  }

  if (!value) {
    return "Brak danych";
  }

  return CODE_LABELS[value] ?? humanizeCode(value);
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("pl-PL").format(value ?? 0);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Brak danych";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nieprawidłowa data";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function percentage(part: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((part / total) * 100)}%`;
}

export function formatDurationLabel(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);

  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function buildDashboardCsvFileName(
  view: DashboardMode,
  now: Date = new Date(),
): string {
  const viewSlug = view === "shipment" ? "wysylka" : "komponenty";
  const timestamp = [
    now.getUTCFullYear(),
    padFileNameSegment(now.getUTCMonth() + 1),
    padFileNameSegment(now.getUTCDate()),
  ].join("");
  const time = [
    padFileNameSegment(now.getUTCHours()),
    padFileNameSegment(now.getUTCMinutes()),
    padFileNameSegment(now.getUTCSeconds()),
  ].join("");

  return `servicetrace-${viewSlug}-${timestamp}-${time}.csv`;
}

export function buildShipmentQueueCsv(data: DeviceShipmentQueue): string {
  const headers = [
    "device_serial_number",
    "device_type",
    "device_variant_code",
    "production_status",
    "production_status_label",
    "final_test_passed",
    "has_critical_open_ncr",
    "passes_bom_gate",
    "installed_component_count",
    "missing_required_components",
    "critical_open_ncr_ids",
    "primary_blocking_code",
    "primary_blocking_label",
    "recommended_action",
    "recommended_action_label",
    "latest_gate_result",
    "latest_gate_result_label",
    "latest_gate_recommended_action",
    "latest_gate_recommended_action_label",
    "latest_gate_message",
    "latest_gate_created_at",
    "blocking_reasons",
    "device_created_at",
    "device_updated_at",
  ];

  const rows = data.devices.map((device) => [
    device.device_serial_number,
    device.device_type,
    device.device_variant_code,
    device.production_status,
    labelForCode(device.production_status),
    labelForCode(device.final_test_passed),
    labelForCode(device.has_critical_open_ncr),
    labelForCode(device.bom_compliance.passes_bom_gate),
    device.bom_compliance.installed_component_count,
    device.bom_compliance.missing_required_components.join(" | "),
    device.critical_open_ncr_ids.join(" | "),
    device.primary_blocking_code,
    labelForCode(device.primary_blocking_code),
    device.recommended_action,
    labelForCode(device.recommended_action),
    device.latest_shipment_gate_decision?.result ?? "",
    labelForCode(device.latest_shipment_gate_decision?.result),
    device.latest_shipment_gate_decision?.recommended_action ?? "",
    labelForCode(device.latest_shipment_gate_decision?.recommended_action),
    device.latest_shipment_gate_decision?.message ?? "",
    device.latest_shipment_gate_decision?.created_at ?? "",
    device.blocking_reasons.join(" | "),
    device.device_created_at,
    device.device_updated_at,
  ]);

  return buildCsv(headers, rows);
}

export function buildComponentQueueCsv(
  data: DeviceComponentQualityQueue,
): string {
  const headers = [
    "device_serial_number",
    "device_type",
    "device_variant_code",
    "production_status",
    "production_status_label",
    "passes_component_quality_gate",
    "primary_quality_status",
    "primary_quality_status_label",
    "primary_blocking_component_type",
    "primary_blocking_component_serial_number",
    "recommended_action",
    "recommended_action_label",
    "total_installed_components",
    "passing_components",
    "blocked_components",
    "stale_bucket",
    "stale_bucket_label",
    "device_created_at",
    "device_updated_at",
  ];

  const rows = data.devices.map((device) => [
    device.device_serial_number,
    device.device_type,
    device.device_variant_code,
    device.production_status,
    labelForCode(device.production_status),
    labelForCode(device.passes_component_quality_gate),
    device.primary_quality_status,
    labelForCode(device.primary_quality_status),
    device.primary_blocking_component_type ?? "",
    device.primary_blocking_component_serial_number ?? "",
    device.recommended_action,
    labelForCode(device.recommended_action),
    device.total_installed_components,
    device.passing_components,
    device.blocked_components,
    device.stale_bucket,
    labelForCode(device.stale_bucket),
    device.device_created_at,
    device.device_updated_at,
  ]);

  return buildCsv(headers, rows);
}

function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

function escapeCsvCell(
  value: string | number | boolean | null | undefined,
): string {
  const normalized =
    value === null || value === undefined ? "" : String(value);
  const escaped = normalized.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function padFileNameSegment(value: number): string {
  return String(value).padStart(2, "0");
}
