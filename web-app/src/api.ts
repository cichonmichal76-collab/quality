export type DashboardMode = "shipment" | "components" | "service";

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

export interface DeviceRead {
  id: string;
  device_serial_number: string;
  device_type: string;
  variant_code: string;
  hardware_version: string | null;
  firmware_version: string | null;
  bootloader_version: string | null;
  created_by: string | null;
  production_status: string;
  created_at: string;
  updated_at: string;
}

export interface OperatorRead {
  id: string;
  operator_id: string;
  full_name: string;
  role: string;
  login_name?: string | null;
  rfid_uid_hash: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OperatorCreatePayload {
  operator_id: string;
  full_name: string;
  role: string;
  login_name?: string | null;
  password?: string | null;
  rfid_uid_hash?: string | null;
  is_active?: boolean;
}

export interface OperatorUpdatePayload {
  full_name?: string;
  role?: string;
  login_name?: string | null;
  password?: string | null;
  rfid_uid_hash?: string | null;
  is_active?: boolean;
}

export interface WorkstationRead {
  id: string;
  workstation_id: string;
  name: string;
  area: string | null;
  station_type: string | null;
  is_active: boolean;
}

export interface WorkstationCreatePayload {
  workstation_id: string;
  name: string;
  area?: string | null;
  station_type?: string | null;
}

export interface WorkstationUpdatePayload {
  name?: string;
  area?: string | null;
  station_type?: string | null;
  is_active?: boolean;
}

export interface WorkSessionRead {
  id: string;
  work_session_id: string;
  operator_id: string;
  workstation_id: string;
  machine_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface ProductionItemRead {
  id: string;
  item_serial_number: string;
  barcode_value: string;
  item_type: string;
  part_number: string | null;
  revision: string | null;
  drawing_number: string | null;
  drawing_revision: string | null;
  production_order: string | null;
  material_batch: string | null;
  machine_id: string | null;
  created_by_operator_id: string | null;
  current_status: string;
  produced_at: string | null;
  created_at: string;
}

export interface QcChecklistRead {
  id: string;
  checklist_code: string;
  name: string;
  process_stage: string;
  version: string;
  device_type: string | null;
  variant_code: string | null;
  component_type: string | null;
  skip_component_qc: boolean;
  reference_image_file_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface QcChecklistCreatePayload {
  checklist_code: string;
  name: string;
  process_stage: string;
  version: string;
  device_type?: string | null;
  variant_code?: string | null;
  component_type?: string | null;
  skip_component_qc?: boolean;
  reference_image_file_id?: string | null;
  is_active?: boolean;
}

export interface QcChecklistUpdatePayload {
  name?: string;
  process_stage?: string;
  version?: string;
  device_type?: string | null;
  variant_code?: string | null;
  component_type?: string | null;
  skip_component_qc?: boolean;
  reference_image_file_id?: string | null;
  is_active?: boolean;
}

export interface QcStepRead {
  id: string;
  checklist_id: string;
  step_order: number;
  title: string;
  instruction: string | null;
  control_area: string | null;
  evaluation_mode: string;
  result_input_label: string | null;
  requires_photo: boolean;
  requires_measurement: boolean;
  blocking_on_fail: boolean;
  expected_value: string | null;
  unit: string | null;
  tolerance_min: number | null;
  tolerance_max: number | null;
}

export interface QcStepCreatePayload {
  step_order: number;
  title: string;
  instruction?: string | null;
  control_area?: string | null;
  evaluation_mode?: string;
  result_input_label?: string | null;
  requires_photo?: boolean;
  requires_measurement?: boolean;
  blocking_on_fail?: boolean;
  expected_value?: string | null;
  unit?: string | null;
  tolerance_min?: number | null;
  tolerance_max?: number | null;
}

export interface QcStepUpdatePayload {
  step_order?: number;
  title?: string;
  instruction?: string | null;
  control_area?: string | null;
  evaluation_mode?: string;
  result_input_label?: string | null;
  requires_photo?: boolean;
  requires_measurement?: boolean;
  blocking_on_fail?: boolean;
  expected_value?: string | null;
  unit?: string | null;
  tolerance_min?: number | null;
  tolerance_max?: number | null;
}

export interface QcProductComponentConfigRead {
  component_type: string;
  substitution_group: string | null;
  required_part_number: string | null;
  required_revision: string | null;
  required_drawing_number: string | null;
  required_drawing_revision: string | null;
  quantity_required: number;
  is_required: boolean;
  checklist_code: string | null;
  checklist_name: string | null;
  checklist_version: string | null;
  checklist_is_active: boolean;
  skip_component_qc: boolean;
  reference_image_file_id: string | null;
  configured_step_count: number;
}

export interface QcProductConfigurationRead {
  device_type: string;
  variant_code: string;
  items: QcProductComponentConfigRead[];
}

export interface ServiceSessionRead {
  id: string;
  session_id: string;
  device_serial_number: string;
  device_type: string | null;
  technician_id: string | null;
  result: string | null;
  firmware_version: string | null;
  bootloader_version: string | null;
  package_path: string | null;
  package_hash: string | null;
  upload_status: string;
  upload_count: number;
  client_attempt_id: string | null;
  client_attempt_number: number | null;
  client_trigger_source: string | null;
  upload_correlation_id: string | null;
  uploaded_at: string | null;
  created_at: string;
}

export interface ServiceSessionUploadStatusSummary {
  upload_status: string;
  session_count: number;
}

export interface ServiceSessionResultSummary {
  result: string | null;
  session_count: number;
}

export interface ServiceSessionDeviceTypeSummary {
  device_type: string | null;
  session_count: number;
}

export interface ServiceSessionTechnicianSummary {
  technician_id: string | null;
  session_count: number;
}

export interface ServiceSessionTriggerSourceSummary {
  client_trigger_source: string | null;
  session_count: number;
}

export interface ServiceSessionQueue {
  total_sessions: number;
  reuploaded_sessions: number;
  returned_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  next_offset: number | null;
  filters: Record<string, string | boolean | number | null>;
  upload_status_summary: ServiceSessionUploadStatusSummary[];
  result_summary: ServiceSessionResultSummary[];
  device_type_summary: ServiceSessionDeviceTypeSummary[];
  technician_summary: ServiceSessionTechnicianSummary[];
  trigger_source_summary: ServiceSessionTriggerSourceSummary[];
  sessions: ServiceSessionRead[];
}

export interface NonconformityRead {
  id: string;
  ncr_id: string;
  device_serial_number: string | null;
  component_serial_number: string | null;
  process_stage: string | null;
  description: string;
  severity: string;
  detected_by: string | null;
  corrective_action: string | null;
  status: string;
  detected_at: string;
  closed_at: string | null;
}

export interface DeviceBomComponentCoverage {
  component_type: string;
  substitution_group: string | null;
  allowed_component_types: string[] | null;
  required_quantity: number;
  installed_quantity: number;
  is_required: boolean;
  status: string;
}

export interface DeviceBomCompliance {
  device_serial_number?: string;
  device_type?: string;
  device_variant_code?: string;
  production_status?: string;
  resolution_source?: string;
  resolved_template_id?: string | null;
  resolved_variant_code?: string | null;
  resolved_version?: string | null;
  resolved_status?: string | null;
  resolved_is_active?: boolean;
  resolved_is_effective_now?: boolean;
  is_bom_resolved?: boolean;
  passes_bom_gate: boolean;
  installed_component_count: number;
  missing_required_components: string[];
  over_installed_components: string[];
  unexpected_component_types: string[];
  component_coverage?: DeviceBomComponentCoverage[];
  blocking_reason: string | null;
}

export interface DeviceShipmentBlockingCheck {
  code: string;
  is_blocking: boolean;
  message: string | null;
  details: string[];
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
  blocking_checks?: DeviceShipmentBlockingCheck[];
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

export interface DeviceInstalledComponentQuality {
  component_serial_number: string;
  component_type: string;
  child_barcode_value: string;
  installed_at: string;
  installed_by: string | null;
  workstation_id: string | null;
  bom_template_id: string | null;
  bom_version: string | null;
  component_qc_passed: boolean;
  has_critical_open_ncr: boolean;
  critical_open_ncr_ids: string[];
  blocks_shipment: boolean;
  quality_status: string;
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
  components?: DeviceInstalledComponentQuality[];
}

export interface AuditEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  work_session_id: string | null;
  operator_id: string | null;
  workstation_id: string | null;
  machine_id: string | null;
  result: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface FinalTestCreatePayload {
  test_run_id: string;
  device_serial_number: string;
  result: "PASS" | "FAIL" | "HOLD";
  operator_id?: string;
  firmware_version?: string;
  bootloader_version?: string;
  report_path?: string;
  mcu_log_path?: string;
  work_session_id: string;
}

export interface FinalTestRead extends FinalTestCreatePayload {
  id: string;
  created_at: string;
}

export interface QcRunCreatePayload {
  run_id: string;
  device_serial_number?: string;
  item_serial_number?: string;
  barcode_value?: string;
  checklist_id?: string;
  process_stage: string;
  operator_id?: string;
  work_session_id: string;
}

export interface QcRunRead extends QcRunCreatePayload {
  id: string;
  status: string;
  result: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface QcStepResultCreatePayload {
  status: string;
  measurement_value?: number;
  observed_value?: string | null;
  comment?: string;
  mcu_snapshot?: Record<string, unknown>;
}

export interface OperatorLoginPayload {
  login: string;
  password: string;
  workstation_id: string;
  machine_id?: string;
}

export interface RfidLoginPayload {
  rfid_uid_hash: string;
  workstation_id: string;
  machine_id?: string;
}

export interface QcStepResultRead extends QcStepResultCreatePayload {
  id: string;
  qc_run_id: string;
  step_id: string;
  created_at: string;
}

export interface AssemblyScanPayload {
  child_barcode_value: string;
  component_type: string;
  installed_by?: string;
  workstation_id?: string;
  work_session_id?: string;
}

export interface AssemblyLinkRead {
  id: string;
  parent_device_serial_number: string;
  child_item_serial_number: string;
  child_barcode_value: string;
  component_type: string;
  installed_by: string | null;
  installed_at: string;
  workstation_id: string | null;
  scan_event_id: string | null;
  bom_template_id: string | null;
  bom_version: string | null;
  status: string;
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

    if (typeof value === "string") {
      const normalizedValue = value.trim();

      if (normalizedValue === "") {
        continue;
      }

      search.set(key, normalizedValue);
      continue;
    }

    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function joinApiUrl(apiBaseUrl: string, path: string): string {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function optionalBoolean(value: "" | "true" | "false"): boolean | undefined {
  if (value === "") {
    return undefined;
  }

  return value === "true";
}

async function readErrorDetail(response: Response): Promise<string> {
  const responseText = (await response.text()).slice(0, 240).trim();

  if (!responseText) {
    return "";
  }

  try {
    const payload = JSON.parse(responseText) as { detail?: unknown };

    if (typeof payload.detail === "string") {
      return payload.detail.slice(0, 240).trim();
    }
  } catch {
    // Fall back to the raw response body when the payload is not JSON.
  }

  return responseText;
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      detail
        ? `API ${response.status} ${response.statusText}: ${detail}`
        : `API ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(url, { signal });
}

export async function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function postForm<T>(
  url: string,
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const formBody = new URLSearchParams(body);

  return requestJson<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: formBody.toString(),
    signal,
  });
}

export async function patchJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return requestJson<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function postMultipart<T>(
  url: string,
  body: FormData,
  signal?: AbortSignal,
): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    body,
    signal,
  });
}

export async function deleteRequest(
  url: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      detail
        ? `API ${response.status} ${response.statusText}: ${detail}`
        : `API ${response.status} ${response.statusText}`,
    );
  }
}

export async function updateDeviceStatus(
  apiBaseUrl: string,
  serialNumber: string,
  productionStatus: string,
  signal?: AbortSignal,
): Promise<DeviceRead> {
  return patchJson<DeviceRead>(
    joinApiUrl(apiBaseUrl, `/devices/${encodeURIComponent(serialNumber)}/status`),
    { production_status: productionStatus },
    signal,
  );
}

export async function updateNonconformityStatus(
  apiBaseUrl: string,
  ncrId: string,
  status: string,
  correctiveAction?: string,
  signal?: AbortSignal,
): Promise<NonconformityRead> {
  return patchJson<NonconformityRead>(
    joinApiUrl(apiBaseUrl, `/nonconformities/${encodeURIComponent(ncrId)}`),
    {
      status,
      ...(correctiveAction ? { corrective_action: correctiveAction } : {}),
    },
    signal,
  );
}

export async function listWorkSessions(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<WorkSessionRead[]> {
  return fetchJson<WorkSessionRead[]>(
    joinApiUrl(apiBaseUrl, "/work-sessions"),
    signal,
  );
}

export async function listWorkstations(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<WorkstationRead[]> {
  return fetchJson<WorkstationRead[]>(
    joinApiUrl(apiBaseUrl, "/workstations"),
    signal,
  );
}

export async function createWorkstation(
  apiBaseUrl: string,
  payload: WorkstationCreatePayload,
  signal?: AbortSignal,
): Promise<WorkstationRead> {
  return postJson<WorkstationRead>(
    joinApiUrl(apiBaseUrl, "/workstations"),
    payload,
    signal,
  );
}

export async function updateWorkstation(
  apiBaseUrl: string,
  workstationId: string,
  payload: WorkstationUpdatePayload,
  signal?: AbortSignal,
): Promise<WorkstationRead> {
  return patchJson<WorkstationRead>(
    joinApiUrl(apiBaseUrl, `/workstations/${encodeURIComponent(workstationId)}`),
    payload,
    signal,
  );
}

export async function listOperators(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<OperatorRead[]> {
  return fetchJson<OperatorRead[]>(
    joinApiUrl(apiBaseUrl, "/operators"),
    signal,
  );
}

export async function createOperator(
  apiBaseUrl: string,
  payload: OperatorCreatePayload,
  signal?: AbortSignal,
): Promise<OperatorRead> {
  return postJson<OperatorRead>(
    joinApiUrl(apiBaseUrl, "/operators"),
    payload,
    signal,
  );
}

export async function updateOperator(
  apiBaseUrl: string,
  operatorId: string,
  payload: OperatorUpdatePayload,
  signal?: AbortSignal,
): Promise<OperatorRead> {
  return patchJson<OperatorRead>(
    joinApiUrl(apiBaseUrl, `/operators/${encodeURIComponent(operatorId)}`),
    payload,
    signal,
  );
}

export async function operatorLogin(
  apiBaseUrl: string,
  payload: OperatorLoginPayload,
  signal?: AbortSignal,
): Promise<WorkSessionRead> {
  return postJson<WorkSessionRead>(
    joinApiUrl(apiBaseUrl, "/auth/operator-login"),
    payload,
    signal,
  );
}

export async function rfidLogin(
  apiBaseUrl: string,
  payload: RfidLoginPayload,
  signal?: AbortSignal,
): Promise<WorkSessionRead> {
  return postJson<WorkSessionRead>(
    joinApiUrl(apiBaseUrl, "/auth/rfid-login"),
    payload,
    signal,
  );
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof AbortSignal !== "undefined" &&
    value instanceof AbortSignal
  );
}

export async function listQcChecklists(
  apiBaseUrl: string,
  paramsOrSignal:
    | {
        device_type?: string;
        variant_code?: string;
        component_type?: string;
      }
    | AbortSignal
    | undefined = undefined,
  signal?: AbortSignal,
): Promise<QcChecklistRead[]> {
  const query =
    paramsOrSignal && !isAbortSignal(paramsOrSignal)
      ? buildQuery(paramsOrSignal)
      : "";
  const effectiveSignal = isAbortSignal(paramsOrSignal) ? paramsOrSignal : signal;
  return fetchJson<QcChecklistRead[]>(
    joinApiUrl(apiBaseUrl, `/qc-checklists${query}`),
    effectiveSignal,
  );
}

export async function listQcChecklistSteps(
  apiBaseUrl: string,
  checklistCode: string,
  signal?: AbortSignal,
): Promise<QcStepRead[]> {
  return fetchJson<QcStepRead[]>(
    joinApiUrl(
      apiBaseUrl,
      `/qc-checklists/${encodeURIComponent(checklistCode)}/steps`,
    ),
    signal,
  );
}

export async function createQcChecklist(
  apiBaseUrl: string,
  payload: QcChecklistCreatePayload,
  signal?: AbortSignal,
): Promise<QcChecklistRead> {
  return postJson<QcChecklistRead>(
    joinApiUrl(apiBaseUrl, "/qc-checklists"),
    payload,
    signal,
  );
}

export async function updateQcChecklist(
  apiBaseUrl: string,
  checklistCode: string,
  payload: QcChecklistUpdatePayload,
  signal?: AbortSignal,
): Promise<QcChecklistRead> {
  return patchJson<QcChecklistRead>(
    joinApiUrl(apiBaseUrl, `/qc-checklists/${encodeURIComponent(checklistCode)}`),
    payload,
    signal,
  );
}

export async function uploadQcChecklistReferenceImage(
  apiBaseUrl: string,
  checklistCode: string,
  file: File,
  uploadedBy?: string,
  signal?: AbortSignal,
): Promise<QcChecklistRead> {
  const formData = new FormData();
  formData.append("file", file);
  if (uploadedBy) {
    formData.append("uploaded_by", uploadedBy);
  }
  return postMultipart<QcChecklistRead>(
    joinApiUrl(
      apiBaseUrl,
      `/qc-checklists/${encodeURIComponent(checklistCode)}/reference-image`,
    ),
    formData,
    signal,
  );
}

export async function createQcChecklistStep(
  apiBaseUrl: string,
  checklistCode: string,
  payload: QcStepCreatePayload,
  signal?: AbortSignal,
): Promise<QcStepRead> {
  return postJson<QcStepRead>(
    joinApiUrl(
      apiBaseUrl,
      `/qc-checklists/${encodeURIComponent(checklistCode)}/steps`,
    ),
    payload,
    signal,
  );
}

export async function updateQcChecklistStep(
  apiBaseUrl: string,
  checklistCode: string,
  stepId: string,
  payload: QcStepUpdatePayload,
  signal?: AbortSignal,
): Promise<QcStepRead> {
  return patchJson<QcStepRead>(
    joinApiUrl(
      apiBaseUrl,
      `/qc-checklists/${encodeURIComponent(checklistCode)}/steps/${encodeURIComponent(stepId)}`,
    ),
    payload,
    signal,
  );
}

export async function deleteQcChecklistStep(
  apiBaseUrl: string,
  checklistCode: string,
  stepId: string,
  signal?: AbortSignal,
): Promise<void> {
  return deleteRequest(
    joinApiUrl(
      apiBaseUrl,
      `/qc-checklists/${encodeURIComponent(checklistCode)}/steps/${encodeURIComponent(stepId)}`,
    ),
    signal,
  );
}

export async function getQcProductConfiguration(
  apiBaseUrl: string,
  deviceType: string,
  variantCode = "DEFAULT",
  signal?: AbortSignal,
): Promise<QcProductConfigurationRead> {
  return fetchJson<QcProductConfigurationRead>(
    joinApiUrl(
      apiBaseUrl,
      `/qc-product-configurations/${encodeURIComponent(deviceType)}${buildQuery({
        variant_code: variantCode,
      })}`,
    ),
    signal,
  );
}

export async function getProductionItemByBarcode(
  apiBaseUrl: string,
  barcodeValue: string,
  signal?: AbortSignal,
): Promise<ProductionItemRead> {
  return fetchJson<ProductionItemRead>(
    joinApiUrl(
      apiBaseUrl,
      `/production-items/by-barcode/${encodeURIComponent(barcodeValue)}`,
    ),
    signal,
  );
}

export async function listServiceSessions(
  apiBaseUrl: string,
  params: {
    device_serial_number?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ServiceSessionRead[]> {
  return fetchJson<ServiceSessionRead[]>(
    joinApiUrl(apiBaseUrl, `/service-sessions${buildQuery(params)}`),
    signal,
  );
}

export async function getServiceSession(
  apiBaseUrl: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ServiceSessionRead> {
  return fetchJson<ServiceSessionRead>(
    joinApiUrl(
      apiBaseUrl,
      `/service-sessions/${encodeURIComponent(sessionId)}`,
    ),
    signal,
  );
}

export async function listServiceSessionsQueue(
  apiBaseUrl: string,
  params: {
    device_serial_number?: string;
    device_type?: string;
    technician_id?: string;
    min_upload_count?: number;
    client_attempt_id?: string;
    upload_correlation_id?: string;
    only_reuploaded?: boolean;
    result?: string;
    upload_status?: string;
    client_trigger_source?: string;
    sort_by?: string;
    sort_desc?: boolean;
    offset?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ServiceSessionQueue> {
  return fetchJson<ServiceSessionQueue>(
    joinApiUrl(apiBaseUrl, `/service-sessions/queue${buildQuery(params)}`),
    signal,
  );
}

export async function listAuditEvents(
  apiBaseUrl: string,
  params: {
    entity_type?: string;
    entity_id?: string;
    work_session_id?: string;
    event_type?: string;
    result?: string;
    service_session_device_serial_number?: string;
  } = {},
  signal?: AbortSignal,
): Promise<AuditEvent[]> {
  return fetchJson<AuditEvent[]>(
    joinApiUrl(apiBaseUrl, `/audit-events${buildQuery(params)}`),
    signal,
  );
}

export async function createFinalTest(
  apiBaseUrl: string,
  payload: FinalTestCreatePayload,
  signal?: AbortSignal,
): Promise<FinalTestRead> {
  return postJson<FinalTestRead>(
    joinApiUrl(apiBaseUrl, "/final-tests"),
    payload,
    signal,
  );
}

export async function createQcRun(
  apiBaseUrl: string,
  payload: QcRunCreatePayload,
  signal?: AbortSignal,
): Promise<QcRunRead> {
  return postJson<QcRunRead>(
    joinApiUrl(apiBaseUrl, "/qc-runs"),
    payload,
    signal,
  );
}

export async function completeQcRun(
  apiBaseUrl: string,
  runId: string,
  result?: "PASS" | "FAIL",
  signal?: AbortSignal,
): Promise<QcRunRead> {
  return postForm<QcRunRead>(
    joinApiUrl(apiBaseUrl, `/qc-runs/${encodeURIComponent(runId)}/complete`),
    result ? { result } : {},
    signal,
  );
}

export async function addQcStepResult(
  apiBaseUrl: string,
  runId: string,
  stepId: string,
  payload: QcStepResultCreatePayload,
  signal?: AbortSignal,
): Promise<QcStepResultRead> {
  return postJson<QcStepResultRead>(
    joinApiUrl(
      apiBaseUrl,
      `/qc-runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/result`,
    ),
    payload,
    signal,
  );
}

export async function scanAssemblyComponent(
  apiBaseUrl: string,
  serialNumber: string,
  payload: AssemblyScanPayload,
  signal?: AbortSignal,
): Promise<AssemblyLinkRead> {
  return postJson<AssemblyLinkRead>(
    joinApiUrl(
      apiBaseUrl,
      `/devices/${encodeURIComponent(serialNumber)}/assembly/scan-component`,
    ),
    payload,
    signal,
  );
}
