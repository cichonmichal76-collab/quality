export type DashboardMode = "shipment" | "components";

export type LoadState = "idle" | "loading" | "loaded" | "error";

export type QueryValue = string | number | boolean | null | undefined;

export interface DeviceShipmentBlockingSummary {
  code: string;
  message: string | null;
  device_count: number;
}

export interface DeviceShipmentActionSummary {
  recommended_action: string;
  device_count: number;
}

export interface DeviceShipmentLatestDecisionSummary {
  result: string;
  device_count: number;
}

export interface DeviceShipmentProductionStatusSummary {
  production_status: string;
  device_count: number;
}

export interface DeviceShipmentLatestDecision {
  event_type: string;
  result: string;
  message: string | null;
  recommended_action: string | null;
  created_at: string;
}

export interface DeviceBomCompliance {
  passes_bom_gate: boolean;
  installed_component_count: number;
  missing_required_components: string[];
  over_installed_components: string[];
  unexpected_component_types: string[];
  blocking_reason: string | null;
}

export interface DeviceShipmentReadiness {
  device_serial_number: string;
  device_type: string;
  device_variant_code: string;
  production_status: string;
  device_created_at: string;
  device_updated_at: string;
  final_test_passed: boolean;
  has_critical_open_ncr: boolean;
  critical_open_ncr_ids: string[];
  bom_compliance: DeviceBomCompliance;
  can_transition_to_ready_for_shipment: boolean;
  latest_shipment_gate_decision: DeviceShipmentLatestDecision | null;
  primary_blocking_code: string | null;
  primary_blocking_message: string | null;
  recommended_action: string;
  blocking_reasons: string[];
}

export interface DeviceShipmentQueue {
  total_devices: number;
  ready_count: number;
  blocked_count: number;
  returned_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  next_offset: number | null;
  filters: Record<string, string | boolean | number | null>;
  blocking_summary: DeviceShipmentBlockingSummary[];
  primary_blocking_summary: DeviceShipmentBlockingSummary[];
  recommended_action_summary: DeviceShipmentActionSummary[];
  latest_shipment_gate_result_summary: DeviceShipmentLatestDecisionSummary[];
  production_status_summary: DeviceShipmentProductionStatusSummary[];
  devices: DeviceShipmentReadiness[];
}

export interface DeviceComponentQualityStatusSummary {
  quality_status: string;
  component_count: number;
  device_count: number;
}

export interface DeviceComponentPrimaryQualityStatusSummary {
  primary_quality_status: string;
  device_count: number;
}

export interface DeviceComponentQualityGateSummary {
  passes_component_quality_gate: boolean;
  device_count: number;
}

export interface DeviceComponentStalenessSummary {
  stale_bucket: string;
  device_count: number;
}

export interface DeviceComponentTypeSummary {
  component_type: string;
  component_count: number;
  device_count: number;
}

export interface DeviceComponentQuality {
  device_serial_number: string;
  device_type: string;
  device_variant_code: string;
  production_status: string;
  device_created_at: string;
  device_updated_at: string;
  stale_bucket: string;
  total_installed_components: number;
  passing_components: number;
  blocked_components: number;
  passes_component_quality_gate: boolean;
  primary_quality_status: string;
  primary_blocking_component_type: string | null;
  primary_blocking_component_serial_number: string | null;
  recommended_action: string;
}

export interface DeviceComponentQualityQueue {
  total_devices: number;
  devices_with_issues: number;
  returned_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  next_offset: number | null;
  filters: Record<string, string | boolean | number | null>;
  quality_status_summary: DeviceComponentQualityStatusSummary[];
  variant_code_summary: { variant_code: string; device_count: number }[];
  production_status_summary: DeviceShipmentProductionStatusSummary[];
  primary_quality_status_summary: DeviceComponentPrimaryQualityStatusSummary[];
  component_quality_gate_summary: DeviceComponentQualityGateSummary[];
  staleness_summary: DeviceComponentStalenessSummary[];
  component_type_summary: DeviceComponentTypeSummary[];
  blocking_component_type_summary: DeviceComponentTypeSummary[];
  primary_blocking_component_type_summary: {
    component_type: string;
    device_count: number;
  }[];
  recommended_action_summary: DeviceShipmentActionSummary[];
  devices: DeviceComponentQuality[];
}

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function joinApiUrl(apiBaseUrl: string, path: string): string {
  const base = apiBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function optionalBoolean(value: "" | "true" | "false"): boolean | undefined {
  if (value === "") {
    return undefined;
  }

  return value === "true";
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const responseText = await response.text();
    const detail = responseText.slice(0, 240).trim();
    throw new Error(
      detail
        ? `API ${response.status} ${response.statusText}: ${detail}`
        : `API ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}
