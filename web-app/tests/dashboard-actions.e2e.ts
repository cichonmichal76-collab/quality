import { expect, test, type Route } from "@playwright/test";

import { fulfillJson } from "./dashboard.e2e-helpers";

async function fulfillOptionalServiceDetailsRequests(
  path: string,
  route: Route,
): Promise<boolean> {
  if (path === "/api/service-sessions" || path === "/api/audit-events") {
    await fulfillJson(route, []);
    return true;
  }

  return false;
}

async function fulfillOptionalActionContextRequests(
  path: string,
  route: Route,
): Promise<boolean> {
  if (await fulfillOptionalServiceDetailsRequests(path, route)) {
    return true;
  }

  if (path === "/api/work-sessions") {
    await fulfillJson(route, workSessionsPayload);
    return true;
  }

  if (path === "/api/operators") {
    await fulfillJson(route, operatorsPayload);
    return true;
  }

  return false;
}

async function fulfillEmptyShipmentGateHistoryRequest(
  path: string,
  route: Route,
  deviceSerialNumbers: string[],
): Promise<boolean> {
  if (
    deviceSerialNumbers.some(
      (deviceSerialNumber) =>
        path === `/api/devices/${deviceSerialNumber}/shipment-gate-history`,
    )
  ) {
    await fulfillJson(route, []);
    return true;
  }

  return false;
}

async function fulfillShipmentDeviceDetailRequests(
  path: string,
  route: Route,
  options: {
    deviceSerialNumber: string;
    shipmentReadiness: unknown;
    componentQuality: unknown;
    shipmentGateHistory: unknown;
  },
): Promise<boolean> {
  const {
    deviceSerialNumber,
    shipmentReadiness,
    componentQuality,
    shipmentGateHistory,
  } = options;

  if (path === `/api/devices/${deviceSerialNumber}/shipment-readiness`) {
    await fulfillJson(route, shipmentReadiness);
    return true;
  }

  if (path === `/api/devices/${deviceSerialNumber}/component-quality`) {
    await fulfillJson(route, componentQuality);
    return true;
  }

  if (path === `/api/devices/${deviceSerialNumber}/shipment-gate-history`) {
    await fulfillJson(route, shipmentGateHistory);
    return true;
  }

  return false;
}

async function fulfillQueueRequest(
  path: string,
  route: Route,
  endpointPath: string,
  body: unknown,
): Promise<boolean> {
  if (path === endpointPath) {
    await fulfillJson(route, body);
    return true;
  }

  return false;
}

async function fulfillMappedComponentQualityRequests(
  path: string,
  route: Route,
  detailsBySerial: Record<string, unknown>,
): Promise<boolean> {
  const matchedSerialNumber = Object.keys(detailsBySerial).find(
    (serialNumber) => path === `/api/devices/${serialNumber}/component-quality`,
  );

  if (!matchedSerialNumber) {
    return false;
  }

  await fulfillJson(route, detailsBySerial[matchedSerialNumber]);
  return true;
}

async function fulfillDeviceStatusUpdateRequest(
  requestPath: string,
  requestMethod: string,
  route: Route,
  options: {
    deviceSerialNumbers: string[];
    expectedProductionStatus: string;
    updatedAt: string;
    onMatched: (deviceSerialNumber: string) => void;
  },
): Promise<boolean> {
  const {
    deviceSerialNumbers,
    expectedProductionStatus,
    updatedAt,
    onMatched,
  } = options;

  if (requestMethod !== "PATCH") {
    return false;
  }

  const matchedSerialNumber = deviceSerialNumbers.find(
    (deviceSerialNumber) =>
      requestPath === `/api/devices/${deviceSerialNumber}/status`,
  );

  if (!matchedSerialNumber) {
    return false;
  }

  onMatched(matchedSerialNumber);

  await fulfillJson(route, {
    id: `DEV-${matchedSerialNumber}`,
    device_serial_number: matchedSerialNumber,
    device_type: "DEMO-OPS",
    variant_code: "DEFAULT",
    hardware_version: null,
    firmware_version: null,
    bootloader_version: null,
    created_by: null,
    production_status: expectedProductionStatus,
    created_at: "2026-05-01T08:00:00Z",
    updated_at: updatedAt,
  });
  return true;
}

async function fulfillNcrCloseRequest(
  requestPath: string,
  requestMethod: string,
  route: Route,
  options: {
    ncrIds: string[];
    responseBuilder: (ncrId: string) => unknown;
    onMatched: (ncrId: string) => void;
  },
): Promise<boolean> {
  const { ncrIds, responseBuilder, onMatched } = options;

  if (requestMethod !== "PATCH") {
    return false;
  }

  const matchedNcrId = ncrIds.find(
    (ncrId) => requestPath === `/api/nonconformities/${ncrId}`,
  );

  if (!matchedNcrId) {
    return false;
  }

  onMatched(matchedNcrId);
  await fulfillJson(route, responseBuilder(matchedNcrId));
  return true;
}

async function fulfillQcRunCreateRequest(
  requestPath: string,
  requestMethod: string,
  route: Route,
  options: {
    onMatched: (payload: {
      run_id: string;
      device_serial_number: string;
      item_serial_number: string;
      barcode_value: string;
      process_stage: string;
      work_session_id: string;
    }) => void;
  },
): Promise<boolean> {
  if (requestPath !== "/api/qc-runs" || requestMethod !== "POST") {
    return false;
  }

  const payload = route.request().postDataJSON() as {
    run_id: string;
    device_serial_number: string;
    item_serial_number: string;
    barcode_value: string;
    process_stage: string;
    work_session_id: string;
  };

  options.onMatched(payload);
  await fulfillJson(route, {
    id: `QC-ROW-${payload.item_serial_number}`,
    run_id: payload.run_id,
    device_serial_number: payload.device_serial_number,
    item_serial_number: payload.item_serial_number,
    barcode_value: payload.barcode_value,
    checklist_id: null,
    process_stage: payload.process_stage,
    operator_id: "OP-QA-001",
    work_session_id: payload.work_session_id,
    status: "IN_PROGRESS",
    result: null,
    started_at: "2026-05-01T09:20:00Z",
    ended_at: null,
  });
  return true;
}

async function fulfillQcRunCompleteRequest(
  requestPath: string,
  requestMethod: string,
  route: Route,
  options: {
    runIds?: string[];
    onMatched: (runId: string) => void;
  },
): Promise<boolean> {
  if (requestMethod !== "POST") {
    return false;
  }

  const match = requestPath.match(/^\/api\/qc-runs\/([^/]+)\/complete$/);
  if (!match) {
    return false;
  }

  const runId = match[1];
  if (options.runIds && !options.runIds.includes(runId)) {
    return false;
  }

  options.onMatched(runId);
  await fulfillJson(route, {
    id: `QC-ROW-${runId}`,
    run_id: runId,
    device_serial_number: "COMP-QC-001",
    item_serial_number: "FAN-001",
    barcode_value: "BC-FAN-001",
    checklist_id: null,
    process_stage: "COMPONENT_QC",
    operator_id: "OP-QA-001",
    work_session_id: "WS-QA-001",
    status: "COMPLETED",
    result: "PASS",
    started_at: "2026-05-01T09:20:00Z",
    ended_at: "2026-05-01T09:21:00Z",
  });
  return true;
}

const shipmentQueuePayload = {
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
  recommended_action_summary: [
    { recommended_action: "MARK_READY_FOR_SHIPMENT", device_count: 1 },
  ],
  latest_shipment_gate_result_summary: [{ result: "PASS", device_count: 1 }],
  production_status_summary: [
    { production_status: "FINAL_TEST_PASSED", device_count: 1 },
  ],
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
      critical_open_ncr_ids: [],
      bom_compliance: {
        passes_bom_gate: true,
        installed_component_count: 1,
        missing_required_components: [],
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
      primary_blocking_code: null,
      primary_blocking_message: null,
      recommended_action: "MARK_READY_FOR_SHIPMENT",
      blocking_reasons: [],
      blocking_checks: [],
    },
  ],
};

const shipmentDetailsPayload = {
  ...shipmentQueuePayload.devices[0],
  bom_compliance: {
    device_serial_number: "SHIP-001",
    device_type: "DEMO-OPS",
    device_variant_code: "DEFAULT",
    production_status: "FINAL_TEST_PASSED",
    resolution_source: "BOUND_TEMPLATE",
    resolved_template_id: "BOM-01",
    resolved_variant_code: "DEFAULT",
    resolved_version: "1.2",
    resolved_status: "ACTIVE",
    resolved_is_active: true,
    resolved_is_effective_now: true,
    is_bom_resolved: true,
    passes_bom_gate: true,
    installed_component_count: 1,
    missing_required_components: [],
    over_installed_components: [],
    unexpected_component_types: [],
    component_coverage: [
      {
        component_type: "CONTROL_PCB",
        substitution_group: null,
        allowed_component_types: null,
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
    ],
    blocking_reason: null,
  },
};

const shipmentDetailsWithDeviceNcrPayload = {
  ...shipmentDetailsPayload,
  has_critical_open_ncr: true,
  critical_open_ncr_ids: ["NCR-DEVICE-001"],
  recommended_action: "RESOLVE_CRITICAL_NCR",
  blocking_reasons: ["CRITICAL_OPEN_NCR"],
  primary_blocking_code: "CRITICAL_OPEN_NCR",
  primary_blocking_message: "Urządzenie ma otwartą krytyczną NCR",
  blocking_checks: [
    {
      code: "CRITICAL_OPEN_NCR",
      is_blocking: true,
      message: "Urządzenie ma otwartą krytyczną NCR",
      details: ["NCR-DEVICE-001"],
    },
  ],
};

const shipmentDetailsWithoutDeviceNcrPayload = {
  ...shipmentDetailsWithDeviceNcrPayload,
  has_critical_open_ncr: false,
  critical_open_ncr_ids: [],
  recommended_action: "MARK_READY_FOR_SHIPMENT",
  blocking_reasons: [],
  primary_blocking_code: null,
  primary_blocking_message: null,
  blocking_checks: [],
};

const componentDetailsPayload = {
  device_serial_number: "SHIP-001",
  device_type: "DEMO-OPS",
  device_variant_code: "DEFAULT",
  production_status: "FINAL_TEST_PASSED",
  device_created_at: "2026-05-01T08:00:00Z",
  device_updated_at: "2026-05-01T09:00:00Z",
  stale_bucket: "LT_24H",
  total_installed_components: 1,
  passing_components: 1,
  blocked_components: 0,
  passes_component_quality_gate: true,
  primary_quality_status: "PASS",
  primary_blocking_component_type: null,
  primary_blocking_component_serial_number: null,
  recommended_action: "NO_ACTION",
  components: [
    {
      component_serial_number: "CTRL-100",
      component_type: "CONTROL_PCB",
      child_barcode_value: "BC-CTRL-100",
      installed_at: "2026-05-01T08:30:00Z",
      installed_by: "OP-01",
      workstation_id: "WS-01",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: true,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      blocks_shipment: false,
      quality_status: "PASS",
    },
  ],
};

const shipmentReadyQueuePayload = {
  ...shipmentQueuePayload,
  production_status_summary: [
    { production_status: "READY_FOR_SHIPMENT", device_count: 1 },
  ],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      production_status: "READY_FOR_SHIPMENT",
      device_updated_at: "2026-05-01T10:15:00Z",
    },
  ],
};

const shipmentShippedQueuePayload = {
  ...shipmentQueuePayload,
  production_status_summary: [{ production_status: "SHIPPED", device_count: 1 }],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      production_status: "SHIPPED",
      device_updated_at: "2026-05-01T11:00:00Z",
    },
  ],
};

const operatorsPayload = [
  {
    id: "OP-ROW-FT-001",
    operator_id: "OP-FT-001",
    full_name: "Final Tester",
    role: "FINAL_TEST_OPERATOR",
    rfid_uid_hash: "RFID-FT-001",
    is_active: true,
    created_at: "2026-05-01T07:50:00Z",
  },
  {
    id: "OP-ROW-PROD-001",
    operator_id: "OP-PROD-001",
    full_name: "Production Operator",
    role: "PRODUCTION_OPERATOR",
    rfid_uid_hash: "RFID-PROD-001",
    is_active: true,
    created_at: "2026-05-01T07:45:00Z",
  },
  {
    id: "OP-ROW-QA-001",
    operator_id: "OP-QA-001",
    full_name: "Quality Inspector",
    role: "QUALITY_INSPECTOR",
    rfid_uid_hash: "RFID-QA-001",
    is_active: true,
    created_at: "2026-05-01T07:55:00Z",
  },
];

const workSessionsPayload = [
  {
    id: "WS-ROW-FT-001",
    work_session_id: "WS-FT-001",
    operator_id: "OP-FT-001",
    workstation_id: "FT-ST-01",
    machine_id: "FT-MC-01",
    status: "ACTIVE",
    started_at: "2026-05-01T08:00:00Z",
    ended_at: null,
  },
  {
    id: "WS-ROW-PROD-001",
    work_session_id: "WS-PROD-001",
    operator_id: "OP-PROD-001",
    workstation_id: "PR-ST-01",
    machine_id: "PR-MC-01",
    status: "ACTIVE",
    started_at: "2026-05-01T07:55:00Z",
    ended_at: null,
  },
  {
    id: "WS-ROW-QA-001",
    work_session_id: "WS-QA-001",
    operator_id: "OP-QA-001",
    workstation_id: "QA-ST-01",
    machine_id: "QA-MC-01",
    status: "ACTIVE",
    started_at: "2026-05-01T08:05:00Z",
    ended_at: null,
  },
];

const shipmentFinalTestQueuePayload = {
  ...shipmentQueuePayload,
  ready_count: 0,
  blocked_count: 1,
  recommended_action_summary: [
    { recommended_action: "RUN_FINAL_TEST", device_count: 1 },
  ],
  latest_shipment_gate_result_summary: [],
  production_status_summary: [
    { production_status: "CREATED", device_count: 1 },
  ],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      device_serial_number: "TEST-001",
      production_status: "CREATED",
      device_updated_at: "2026-05-01T08:45:00Z",
      final_test_passed: false,
      can_transition_to_ready_for_shipment: false,
      latest_shipment_gate_decision: null,
      primary_blocking_code: "FINAL_TEST_NOT_PASSED",
      primary_blocking_message: "Final test not passed",
      recommended_action: "RUN_FINAL_TEST",
      blocking_reasons: ["Final test not passed"],
      blocking_checks: [
        {
          code: "FINAL_TEST_NOT_PASSED",
          is_blocking: true,
          message: "Final test not passed",
          details: [],
        },
      ],
    },
  ],
};

const shipmentFinalTestDetailsPayload = {
  ...shipmentFinalTestQueuePayload.devices[0],
  bom_compliance: {
    device_serial_number: "TEST-001",
    device_type: "DEMO-OPS",
    device_variant_code: "DEFAULT",
    production_status: "CREATED",
    resolution_source: "BOUND_TEMPLATE",
    resolved_template_id: "BOM-01",
    resolved_variant_code: "DEFAULT",
    resolved_version: "1.2",
    resolved_status: "ACTIVE",
    resolved_is_active: true,
    resolved_is_effective_now: true,
    is_bom_resolved: true,
    passes_bom_gate: true,
    installed_component_count: 1,
    missing_required_components: [],
    over_installed_components: [],
    unexpected_component_types: [],
    component_coverage: [
      {
        component_type: "CONTROL_PCB",
        substitution_group: null,
        allowed_component_types: null,
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
    ],
    blocking_reason: null,
  },
};

const componentFinalTestDetailsPayload = {
  ...componentDetailsPayload,
  device_serial_number: "TEST-001",
  production_status: "CREATED",
};

const shipmentAfterFinalTestPassQueuePayload = {
  ...shipmentQueuePayload,
  ready_count: 1,
  blocked_count: 0,
  recommended_action_summary: [
    { recommended_action: "MARK_READY_FOR_SHIPMENT", device_count: 1 },
  ],
  latest_shipment_gate_result_summary: [],
  production_status_summary: [
    { production_status: "FINAL_TEST_PASSED", device_count: 1 },
  ],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      device_serial_number: "TEST-001",
      production_status: "FINAL_TEST_PASSED",
      device_updated_at: "2026-05-01T09:10:00Z",
      final_test_passed: true,
      can_transition_to_ready_for_shipment: true,
      latest_shipment_gate_decision: null,
      primary_blocking_code: null,
      primary_blocking_message: null,
      recommended_action: "MARK_READY_FOR_SHIPMENT",
      blocking_reasons: [],
      blocking_checks: [],
    },
  ],
};

const shipmentAfterFinalTestPassDetailsPayload = {
  ...shipmentAfterFinalTestPassQueuePayload.devices[0],
  bom_compliance: {
    ...shipmentDetailsPayload.bom_compliance,
    device_serial_number: "TEST-001",
    production_status: "FINAL_TEST_PASSED",
  },
};

const componentActionShipmentDetailsPayload = {
  ...shipmentDetailsPayload,
  device_serial_number: "COMP-001",
  has_critical_open_ncr: false,
  critical_open_ncr_ids: [],
  bom_compliance: {
    ...shipmentDetailsPayload.bom_compliance,
    device_serial_number: "COMP-001",
    installed_component_count: 2,
    missing_required_components: [],
    blocking_reason: null,
    component_coverage: [
      {
        component_type: "CONTROL_PCB",
        substitution_group: null,
        allowed_component_types: null,
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
      {
        component_type: "FAN_MODULE",
        substitution_group: "AIRFLOW",
        allowed_component_types: ["FAN_MODULE"],
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
    ],
  },
  can_transition_to_ready_for_shipment: false,
  latest_shipment_gate_decision: null,
  primary_blocking_code: "COMPONENT_QC_NOT_PASSED",
  primary_blocking_message: "Installed component lacks QC_PASSED",
  recommended_action: "RESOLVE_COMPONENT_QUALITY",
  blocking_reasons: ["Installed component lacks QC_PASSED"],
  blocking_checks: [
    {
      code: "COMPONENT_QC_NOT_PASSED",
      is_blocking: true,
      message: "Installed component lacks QC_PASSED",
      details: ["FAN-001 (FAN_MODULE)"],
    },
  ],
};

const componentActionComponentDetailsPayload = {
  device_serial_number: "COMP-001",
  device_type: "DEMO-OPS",
  device_variant_code: "DEFAULT",
  production_status: "FINAL_TEST_PASSED",
  device_created_at: "2026-05-01T08:00:00Z",
  device_updated_at: "2026-05-01T09:05:00Z",
  stale_bucket: "LT_24H",
  total_installed_components: 2,
  passing_components: 1,
  blocked_components: 1,
  passes_component_quality_gate: false,
  primary_quality_status: "QC_NOT_PASSED",
  primary_blocking_component_type: "FAN_MODULE",
  primary_blocking_component_serial_number: "FAN-001",
  recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
  components: [
    {
      component_serial_number: "CTRL-200",
      component_type: "CONTROL_PCB",
      child_barcode_value: "BC-CTRL-200",
      installed_at: "2026-05-01T08:20:00Z",
      installed_by: "OP-01",
      workstation_id: "WS-01",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: true,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      blocks_shipment: false,
      quality_status: "PASS",
    },
    {
      component_serial_number: "FAN-001",
      component_type: "FAN_MODULE",
      child_barcode_value: "BC-FAN-001",
      installed_at: "2026-05-01T08:25:00Z",
      installed_by: "OP-02",
      workstation_id: "WS-02",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: false,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      blocks_shipment: true,
      quality_status: "QC_NOT_PASSED",
    },
  ],
};

const componentActionQueuePayload = {
  total_devices: 1,
  devices_with_issues: 1,
  returned_count: 1,
  offset: 0,
  limit: 100,
  has_more: false,
  next_offset: null,
  filters: {},
  quality_status_summary: [
    { quality_status: "QC_NOT_PASSED", component_count: 1, device_count: 1 },
  ],
  variant_code_summary: [{ variant_code: "DEFAULT", device_count: 1 }],
  production_status_summary: [
    { production_status: "FINAL_TEST_PASSED", device_count: 1 },
  ],
  primary_quality_status_summary: [
    { primary_quality_status: "QC_NOT_PASSED", device_count: 1 },
  ],
  component_quality_gate_summary: [
    { passes_component_quality_gate: false, device_count: 1 },
  ],
  staleness_summary: [{ stale_bucket: "LT_24H", device_count: 1 }],
  component_type_summary: [
    { component_type: "FAN_MODULE", component_count: 1, device_count: 1 },
  ],
  blocking_component_type_summary: [
    { component_type: "FAN_MODULE", component_count: 1, device_count: 1 },
  ],
  primary_blocking_component_type_summary: [
    { component_type: "FAN_MODULE", device_count: 1 },
  ],
  recommended_action_summary: [
    { recommended_action: "RUN_COMPONENT_QC_OR_REWORK", device_count: 1 },
  ],
  devices: [
    {
      device_serial_number: "COMP-001",
      device_type: "DEMO-OPS",
      device_variant_code: "DEFAULT",
      production_status: "FINAL_TEST_PASSED",
      device_created_at: "2026-05-01T08:00:00Z",
      device_updated_at: "2026-05-01T09:05:00Z",
      stale_bucket: "LT_24H",
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
};

const componentActionAfterPassQueuePayload = {
  ...componentActionQueuePayload,
  devices_with_issues: 0,
  quality_status_summary: [
    { quality_status: "PASS", component_count: 2, device_count: 1 },
  ],
  primary_quality_status_summary: [
    { primary_quality_status: "PASS", device_count: 1 },
  ],
  component_quality_gate_summary: [
    { passes_component_quality_gate: true, device_count: 1 },
  ],
  blocking_component_type_summary: [],
  primary_blocking_component_type_summary: [],
  recommended_action_summary: [
    { recommended_action: "NO_ACTION", device_count: 1 },
  ],
  devices: [
    {
      ...componentActionQueuePayload.devices[0],
      passing_components: 2,
      blocked_components: 0,
      passes_component_quality_gate: true,
      primary_quality_status: "PASS",
      primary_blocking_component_type: null,
      primary_blocking_component_serial_number: null,
      recommended_action: "NO_ACTION",
    },
  ],
};

const componentActionAfterPassShipmentDetailsPayload = {
  ...componentActionShipmentDetailsPayload,
  can_transition_to_ready_for_shipment: true,
  primary_blocking_code: null,
  primary_blocking_message: null,
  recommended_action: "MARK_READY_FOR_SHIPMENT",
  blocking_reasons: [],
  blocking_checks: [],
};

const componentActionAfterPassComponentDetailsPayload = {
  ...componentActionComponentDetailsPayload,
  passing_components: 2,
  blocked_components: 0,
  passes_component_quality_gate: true,
  primary_quality_status: "PASS",
  primary_blocking_component_type: null,
  primary_blocking_component_serial_number: null,
  recommended_action: "NO_ACTION",
  components: componentActionComponentDetailsPayload.components.map((component) =>
    component.component_serial_number === "FAN-001"
      ? {
          ...component,
          component_qc_passed: true,
          blocks_shipment: false,
          quality_status: "PASS",
        }
      : component,
  ),
};

const shipmentAssemblyQueuePayload = {
  ...shipmentQueuePayload,
  ready_count: 0,
  blocked_count: 1,
  recommended_action_summary: [
    { recommended_action: "COMPLETE_ASSEMBLY", device_count: 1 },
  ],
  latest_shipment_gate_result_summary: [
    { result: "BLOCKED", device_count: 1 },
  ],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      device_serial_number: "ASM-001",
      production_status: "FINAL_TEST_PASSED",
      device_updated_at: "2026-05-02T08:10:00Z",
      final_test_passed: true,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      bom_compliance: {
        passes_bom_gate: false,
        installed_component_count: 1,
        missing_required_components: ["FAN_MODULE"],
        over_installed_components: [],
        unexpected_component_types: [],
        blocking_reason: "Brak FAN_MODULE",
      },
      can_transition_to_ready_for_shipment: false,
      latest_shipment_gate_decision: {
        event_type: "SHIPMENT_GATE_BLOCKED",
        result: "BLOCKED",
        message: "Brakuje FAN_MODULE",
        recommended_action: "COMPLETE_ASSEMBLY",
        created_at: "2026-05-02T08:10:00Z",
      },
      primary_blocking_code: "BOM_REQUIRED_COMPONENTS_MISSING",
      primary_blocking_message: "Brakuje FAN_MODULE",
      recommended_action: "COMPLETE_ASSEMBLY",
      blocking_reasons: ["FAN_MODULE"],
      blocking_checks: [
        {
          code: "BOM_REQUIRED_COMPONENTS_MISSING",
          is_blocking: true,
          message: "Brak wymaganego komponentu FAN_MODULE",
          details: ["FAN_MODULE"],
        },
      ],
    },
  ],
};

const shipmentAssemblyDetailsPayload = {
  ...shipmentAssemblyQueuePayload.devices[0],
  bom_compliance: {
    device_serial_number: "ASM-001",
    device_type: "DEMO-OPS",
    device_variant_code: "DEFAULT",
    production_status: "FINAL_TEST_PASSED",
    resolution_source: "BOUND_TEMPLATE",
    resolved_template_id: "BOM-01",
    resolved_variant_code: "DEFAULT",
    resolved_version: "1.2",
    resolved_status: "ACTIVE",
    resolved_is_active: true,
    resolved_is_effective_now: true,
    is_bom_resolved: true,
    passes_bom_gate: false,
    installed_component_count: 1,
    missing_required_components: ["FAN_MODULE"],
    over_installed_components: [],
    unexpected_component_types: [],
    component_coverage: [
      {
        component_type: "CONTROL_PCB",
        substitution_group: null,
        allowed_component_types: null,
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
      {
        component_type: "FAN_MODULE",
        substitution_group: "AIRFLOW",
        allowed_component_types: ["FAN_MODULE", "FAN_MODULE_V2"],
        required_quantity: 1,
        installed_quantity: 0,
        is_required: true,
        status: "MISSING",
      },
    ],
    blocking_reason: "Brak FAN_MODULE",
  },
};

const componentAssemblyDetailsPayload = {
  device_serial_number: "ASM-001",
  device_type: "DEMO-OPS",
  device_variant_code: "DEFAULT",
  production_status: "FINAL_TEST_PASSED",
  device_created_at: "2026-05-02T07:30:00Z",
  device_updated_at: "2026-05-02T08:10:00Z",
  stale_bucket: "LT_24H",
  total_installed_components: 1,
  passing_components: 1,
  blocked_components: 0,
  passes_component_quality_gate: true,
  primary_quality_status: "PASS",
  primary_blocking_component_type: null,
  primary_blocking_component_serial_number: null,
  recommended_action: "NO_ACTION",
  components: [
    {
      component_serial_number: "CTRL-ASM-001",
      component_type: "CONTROL_PCB",
      child_barcode_value: "BC-CTRL-ASM-001",
      installed_at: "2026-05-02T07:50:00Z",
      installed_by: "OP-PROD-001",
      workstation_id: "PR-ST-01",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: true,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      blocks_shipment: false,
      quality_status: "PASS",
    },
  ],
};

const shipmentAssemblyAfterQueuePayload = {
  ...shipmentQueuePayload,
  ready_count: 1,
  blocked_count: 0,
  recommended_action_summary: [
    { recommended_action: "MARK_READY_FOR_SHIPMENT", device_count: 1 },
  ],
  latest_shipment_gate_result_summary: [
    { result: "PASS", device_count: 1 },
  ],
  devices: [
    {
      ...shipmentQueuePayload.devices[0],
      device_serial_number: "ASM-001",
      production_status: "FINAL_TEST_PASSED",
      device_updated_at: "2026-05-02T08:20:00Z",
      final_test_passed: true,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      bom_compliance: {
        passes_bom_gate: true,
        installed_component_count: 2,
        missing_required_components: [],
        over_installed_components: [],
        unexpected_component_types: [],
        blocking_reason: null,
      },
      can_transition_to_ready_for_shipment: true,
      latest_shipment_gate_decision: {
        event_type: "SHIPMENT_GATE_PASSED",
        result: "PASS",
        message: "Montaż BOM domknięty",
        recommended_action: "MARK_READY_FOR_SHIPMENT",
        created_at: "2026-05-02T08:20:00Z",
      },
      primary_blocking_code: null,
      primary_blocking_message: null,
      recommended_action: "MARK_READY_FOR_SHIPMENT",
      blocking_reasons: [],
      blocking_checks: [],
    },
  ],
};

const shipmentAssemblyAfterDetailsPayload = {
  ...shipmentAssemblyAfterQueuePayload.devices[0],
  bom_compliance: {
    device_serial_number: "ASM-001",
    device_type: "DEMO-OPS",
    device_variant_code: "DEFAULT",
    production_status: "FINAL_TEST_PASSED",
    resolution_source: "BOUND_TEMPLATE",
    resolved_template_id: "BOM-01",
    resolved_variant_code: "DEFAULT",
    resolved_version: "1.2",
    resolved_status: "ACTIVE",
    resolved_is_active: true,
    resolved_is_effective_now: true,
    is_bom_resolved: true,
    passes_bom_gate: true,
    installed_component_count: 2,
    missing_required_components: [],
    over_installed_components: [],
    unexpected_component_types: [],
    component_coverage: [
      {
        component_type: "CONTROL_PCB",
        substitution_group: null,
        allowed_component_types: null,
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
      {
        component_type: "FAN_MODULE",
        substitution_group: "AIRFLOW",
        allowed_component_types: ["FAN_MODULE", "FAN_MODULE_V2"],
        required_quantity: 1,
        installed_quantity: 1,
        is_required: true,
        status: "PASS",
      },
    ],
    blocking_reason: null,
  },
};

const componentAssemblyAfterDetailsPayload = {
  ...componentAssemblyDetailsPayload,
  device_updated_at: "2026-05-02T08:20:00Z",
  total_installed_components: 2,
  passing_components: 2,
  components: [
    ...componentAssemblyDetailsPayload.components,
    {
      component_serial_number: "FAN-777",
      component_type: "FAN_MODULE",
      child_barcode_value: "BC-FAN-777",
      installed_at: "2026-05-02T08:20:00Z",
      installed_by: "OP-PROD-001",
      workstation_id: "PR-ST-01",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: true,
      has_critical_open_ncr: false,
      critical_open_ncr_ids: [],
      blocks_shipment: false,
      quality_status: "PASS",
    },
  ],
};

test("dashboard marks device ready for shipment from the details drawer", async ({
  page,
}) => {
  let markedReady = false;
  let patchRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          markedReady
            ? shipmentReadyQueuePayload
            : shipmentQueuePayload,
        ),
      });
      return;
    }

    if (
      await fulfillShipmentDeviceDetailRequests(path, route, {
        deviceSerialNumber: "SHIP-001",
        shipmentReadiness: {
          ...shipmentDetailsPayload,
          production_status: markedReady ? "READY_FOR_SHIPMENT" : "FINAL_TEST_PASSED",
          device_updated_at: markedReady
            ? "2026-05-01T10:15:00Z"
            : "2026-05-01T09:00:00Z",
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_PASSED",
            result: "PASS",
            message: markedReady ? "Shipment gate passed" : "Ready",
            recommended_action: "MARK_READY_FOR_SHIPMENT",
            created_at: markedReady
              ? "2026-05-01T10:15:00Z"
              : "2026-05-01T09:05:00Z",
          },
        },
        componentQuality: componentDetailsPayload,
        shipmentGateHistory: markedReady
          ? [
              {
                id: "AUD-3",
                event_type: "SHIPMENT_GATE_PASSED",
                entity_type: "DEVICE",
                entity_id: "SHIP-001",
                work_session_id: "WS-12",
                operator_id: "OP-12",
                workstation_id: "ST-12",
                machine_id: null,
                result: "PASS",
                message: "Shipment gate passed",
                payload: { requested_status: "READY_FOR_SHIPMENT" },
                created_at: "2026-05-01T10:15:00Z",
              },
            ]
          : [],
      })
    ) {
      return;
    }

    if (
      await fulfillDeviceStatusUpdateRequest(path, request.method(), route, {
        deviceSerialNumbers: ["SHIP-001"],
        expectedProductionStatus: "READY_FOR_SHIPMENT",
        updatedAt: "2026-05-01T10:15:00Z",
        onMatched: () => {
          patchRequests += 1;
          expect(request.postDataJSON()).toEqual({
            production_status: "READY_FOR_SHIPMENT",
          });
          markedReady = true;
        },
      })
    ) {
      return;
    }

    if (await fulfillOptionalServiceDetailsRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "SHIP-001" }).click();

  const drawer = page.getByRole("dialog");
  const actionButton = drawer.getByRole("button", {
    name: "Oznacz gotowe do wysyłki",
  });
  await expect(actionButton).toBeVisible();

  await actionButton.click();

  await expect(
    drawer.getByText("Urządzenie oznaczone jako gotowe do wysyłki."),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Oznacz gotowe do wysyłki" }),
  ).toHaveCount(0);
  expect(patchRequests).toBe(1);
});

test("dashboard marks ready device as shipped from the details drawer", async ({
  page,
}) => {
  let shipped = false;
  let patchRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          shipped ? shipmentShippedQueuePayload : shipmentReadyQueuePayload,
        ),
      });
      return;
    }

    if (
      await fulfillShipmentDeviceDetailRequests(path, route, {
        deviceSerialNumber: "SHIP-001",
        shipmentReadiness: {
          ...shipmentDetailsPayload,
          production_status: shipped ? "SHIPPED" : "READY_FOR_SHIPMENT",
          device_updated_at: shipped
            ? "2026-05-01T11:00:00Z"
            : "2026-05-01T10:15:00Z",
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_PASSED",
            result: "PASS",
            message: "Shipment gate passed",
            recommended_action: "MARK_READY_FOR_SHIPMENT",
            created_at: "2026-05-01T10:15:00Z",
          },
        },
        componentQuality: componentDetailsPayload,
        shipmentGateHistory: shipped
          ? [
              {
                id: "AUD-4",
                event_type: "DEVICE_STATUS_UPDATED",
                entity_type: "DEVICE",
                entity_id: "SHIP-001",
                work_session_id: null,
                operator_id: null,
                workstation_id: null,
                machine_id: null,
                result: "SHIPPED",
                message: "Device marked as shipped",
                payload: { requested_status: "SHIPPED" },
                created_at: "2026-05-01T11:00:00Z",
              },
            ]
          : [
              {
                id: "AUD-3",
                event_type: "SHIPMENT_GATE_PASSED",
                entity_type: "DEVICE",
                entity_id: "SHIP-001",
                work_session_id: "WS-12",
                operator_id: "OP-12",
                workstation_id: "ST-12",
                machine_id: null,
                result: "PASS",
                message: "Shipment gate passed",
                payload: { requested_status: "READY_FOR_SHIPMENT" },
                created_at: "2026-05-01T10:15:00Z",
              },
            ],
      })
    ) {
      return;
    }

    if (
      await fulfillDeviceStatusUpdateRequest(path, request.method(), route, {
        deviceSerialNumbers: ["SHIP-001"],
        expectedProductionStatus: "SHIPPED",
        updatedAt: "2026-05-01T11:00:00Z",
        onMatched: () => {
          patchRequests += 1;
          expect(request.postDataJSON()).toEqual({
            production_status: "SHIPPED",
          });
          shipped = true;
        },
      })
    ) {
      return;
    }

    if (await fulfillOptionalServiceDetailsRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "SHIP-001" }).click();

  const drawer = page.getByRole("dialog");
  const actionButton = drawer.getByRole("button", {
    name: "Oznacz jako wysłane",
  });
  await expect(actionButton).toBeVisible();

  await actionButton.click();

  await expect(drawer.getByText("Urządzenie oznaczone jako wysłane.")).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Oznacz jako wysłane" }),
  ).toHaveCount(0);
  expect(patchRequests).toBe(1);
});

test("dashboard records final test PASS from the details drawer", async ({
  page,
}) => {
  let finalTestRecorded = false;
  let postRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          finalTestRecorded
            ? shipmentAfterFinalTestPassQueuePayload
            : shipmentFinalTestQueuePayload,
        ),
      });
      return;
    }

    if (
      await fulfillShipmentDeviceDetailRequests(path, route, {
        deviceSerialNumber: "TEST-001",
        shipmentReadiness: finalTestRecorded
          ? shipmentAfterFinalTestPassDetailsPayload
          : shipmentFinalTestDetailsPayload,
        componentQuality: componentFinalTestDetailsPayload,
        shipmentGateHistory: [],
      })
    ) {
      return;
    }

    if (path === "/api/final-tests" && request.method() === "POST") {
      postRequests += 1;
      const payload = request.postDataJSON() as {
        test_run_id: string;
        device_serial_number: string;
        result: string;
        work_session_id: string;
      };

      expect(payload.device_serial_number).toBe("TEST-001");
      expect(payload.result).toBe("PASS");
      expect(payload.work_session_id).toBe("WS-FT-001");
      expect(payload.test_run_id).toMatch(/^FT-WEB-TEST-001-/);
      finalTestRecorded = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "FT-ROW-001",
          test_run_id: payload.test_run_id,
          device_serial_number: "TEST-001",
          operator_id: "OP-FT-001",
          result: "PASS",
          firmware_version: null,
          bootloader_version: null,
          report_path: null,
          mcu_log_path: null,
          work_session_id: "WS-FT-001",
          created_at: "2026-05-01T09:10:00Z",
        }),
      });
      return;
    }

    if (await fulfillOptionalActionContextRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "TEST-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Sesja final test")).toHaveValue("WS-FT-001");

  await drawer.getByRole("button", { name: "Zapisz final test PASS" }).click();

  await expect(drawer.getByText("Zapisano final test PASS.")).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Zapisz final test PASS" }),
  ).toHaveCount(0);
  expect(postRequests).toBe(1);
});

test("dashboard completes assembly from the details drawer", async ({
  page,
}) => {
  let assemblyCompleted = false;
  let postRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          assemblyCompleted
            ? shipmentAssemblyAfterQueuePayload
            : shipmentAssemblyQueuePayload,
        ),
      });
      return;
    }

    if (
      await fulfillShipmentDeviceDetailRequests(path, route, {
        deviceSerialNumber: "ASM-001",
        shipmentReadiness: assemblyCompleted
          ? shipmentAssemblyAfterDetailsPayload
          : shipmentAssemblyDetailsPayload,
        componentQuality: assemblyCompleted
          ? componentAssemblyAfterDetailsPayload
          : componentAssemblyDetailsPayload,
        shipmentGateHistory: [],
      })
    ) {
      return;
    }

    if (
      path === "/api/devices/ASM-001/assembly/scan-component" &&
      request.method() === "POST"
    ) {
      postRequests += 1;
      const payload = request.postDataJSON() as {
        child_barcode_value: string;
        component_type: string;
        installed_by: string;
        workstation_id: string;
        work_session_id: string;
      };

      expect(payload.child_barcode_value).toBe("BC-FAN-777");
      expect(payload.component_type).toBe("FAN_MODULE_V2");
      expect(payload.installed_by).toBe("OP-PROD-001");
      expect(payload.workstation_id).toBe("PR-ST-01");
      expect(payload.work_session_id).toBe("WS-PROD-001");
      assemblyCompleted = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "ASM-LINK-001",
          parent_device_serial_number: "ASM-001",
          child_item_serial_number: "FAN-777",
          child_barcode_value: "BC-FAN-777",
          component_type: "FAN_MODULE_V2",
          installed_by: "OP-PROD-001",
          installed_at: "2026-05-02T08:20:00Z",
          workstation_id: "PR-ST-01",
          scan_event_id: "SCAN-001",
          bom_template_id: "BOM-01",
          bom_version: "1.2",
          status: "INSTALLED",
        }),
      });
      return;
    }

    if (await fulfillOptionalActionContextRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "ASM-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Sesja montażu")).toHaveValue("WS-PROD-001");
  await expect(drawer.getByLabel("Typ komponentu")).toHaveValue("FAN_MODULE");

  await drawer.getByLabel("Typ komponentu").selectOption("FAN_MODULE_V2");
  await drawer.getByLabel("Barcode komponentu").fill("BC-FAN-777");
  await drawer.getByRole("button", { name: "Zamontuj komponent" }).click();

  await expect(
    drawer.getByText(
      "Zamontowano komponent Fan Module V2 z barcode BC-FAN-777.",
    ),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Zamontuj komponent" }),
  ).toHaveCount(0);
  expect(postRequests).toBe(1);
});

test("dashboard records component QC PASS from the details drawer", async ({
  page,
}) => {
  let componentQcRecorded = false;
  let qcRunId = "";
  let createRequests = 0;
  let completeRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(shipmentQueuePayload),
      });
      return;
    }

    if (path === "/api/component-quality") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          componentQcRecorded
            ? componentActionAfterPassQueuePayload
            : componentActionQueuePayload,
        ),
      });
      return;
    }

    if (
      await fulfillShipmentDeviceDetailRequests(path, route, {
        deviceSerialNumber: "COMP-001",
        shipmentReadiness: componentQcRecorded
          ? componentActionAfterPassShipmentDetailsPayload
          : componentActionShipmentDetailsPayload,
        componentQuality: componentQcRecorded
          ? componentActionAfterPassComponentDetailsPayload
          : componentActionComponentDetailsPayload,
        shipmentGateHistory: [],
      })
    ) {
      return;
    }

    if (
      await fulfillQcRunCreateRequest(path, request.method(), route, {
        onMatched: (payload) => {
          createRequests += 1;
          qcRunId = payload.run_id;

          expect(payload.device_serial_number).toBe("COMP-001");
          expect(payload.item_serial_number).toBe("FAN-001");
          expect(payload.barcode_value).toBe("BC-FAN-001");
          expect(payload.process_stage).toBe("COMPONENT_QC");
          expect(payload.work_session_id).toBe("WS-QA-001");
          expect(payload.run_id).toMatch(/^QC-WEB-FAN-001-/);
        },
      })
    ) {
      return;
    }

    if (
      await fulfillQcRunCompleteRequest(path, request.method(), route, {
        runIds: qcRunId ? [qcRunId] : [],
        onMatched: () => {
          completeRequests += 1;
          componentQcRecorded = true;
          expect(request.postData()).toBe("result=PASS");
        },
      })
    ) {
      return;
    }

    if (await fulfillOptionalActionContextRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "Komponenty" }).click();
  await page.getByRole("button", { name: "COMP-001" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Sesja QC komponentów")).toHaveValue("WS-QA-001");

  await drawer
    .getByRole("button", { name: "Zapisz komponentowy QC PASS" })
    .click();

  await expect(drawer.getByText("Zapisano komponentowy QC PASS.")).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Zapisz komponentowy QC PASS" }),
  ).toHaveCount(0);
  expect(createRequests).toBe(1);
  expect(completeRequests).toBe(1);
});

test("dashboard closes device critical NCRs from the details drawer", async ({
  page,
}) => {
  let deviceNcrClosed = false;
  let patchRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/shipment-readiness") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(shipmentQueuePayload),
      });
      return;
    }

    if (
      await fulfillShipmentDeviceDetailRequests(path, route, {
        deviceSerialNumber: "SHIP-001",
        shipmentReadiness: deviceNcrClosed
          ? shipmentDetailsWithoutDeviceNcrPayload
          : shipmentDetailsWithDeviceNcrPayload,
        componentQuality: componentDetailsPayload,
        shipmentGateHistory: [],
      })
    ) {
      return;
    }

    if (
      path === "/api/nonconformities/NCR-DEVICE-001" &&
      request.method() === "PATCH"
    ) {
      patchRequests += 1;
      expect(request.postDataJSON()).toEqual({
        status: "CLOSED",
        corrective_action: "Zamknięte z panelu operacyjnego dla SHIP-001.",
      });
      deviceNcrClosed = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "NCR-ROW-001",
          ncr_id: "NCR-DEVICE-001",
          device_serial_number: "SHIP-001",
          component_serial_number: null,
          process_stage: "FINAL_TEST",
          description: "Otwarte NCR urządzenia",
          severity: "CRITICAL",
          detected_by: "OP-10",
          corrective_action: "Zamknięte z panelu operacyjnego dla SHIP-001.",
          status: "CLOSED",
          detected_at: "2026-05-01T09:10:00Z",
          closed_at: "2026-05-01T09:45:00Z",
        }),
      });
      return;
    }

    if (await fulfillOptionalServiceDetailsRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "SHIP-001" }).click();

  const drawer = page.getByRole("dialog");
  const actionButton = drawer.getByRole("button", {
    name: "Zamknij krytyczne NCR urządzenia",
  });
  await expect(actionButton).toBeVisible();

  await actionButton.click();

  await expect(
    drawer.getByText("Zamknięto 1 krytyczne NCR urządzenia."),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Zamknij krytyczne NCR urządzenia" }),
  ).toHaveCount(0);
  expect(patchRequests).toBe(1);
});

test("dashboard marks selected shipment devices ready from bulk actions", async ({
  page,
}) => {
  let readyMarked = false;
  let patchRequests = 0;

  const bulkShipmentQueuePayload = {
    ...shipmentQueuePayload,
    total_devices: 3,
    ready_count: 0,
    blocked_count: 3,
    returned_count: 3,
    devices: [
      {
        ...shipmentQueuePayload.devices[0],
        device_serial_number: "BULK-READY-001",
        can_transition_to_ready_for_shipment: true,
        recommended_action: "MARK_READY_FOR_SHIPMENT",
        production_status: "FINAL_TEST_PASSED",
      },
      {
        ...shipmentQueuePayload.devices[0],
        device_serial_number: "BULK-READY-002",
        can_transition_to_ready_for_shipment: true,
        recommended_action: "MARK_READY_FOR_SHIPMENT",
        production_status: "FINAL_TEST_PASSED",
      },
      {
        ...shipmentQueuePayload.devices[0],
        device_serial_number: "BULK-BLOCK-001",
        can_transition_to_ready_for_shipment: false,
        recommended_action: "RUN_FINAL_TEST",
        primary_blocking_code: "FINAL_TEST_NOT_PASSED",
        primary_blocking_message: "Final test jest jeszcze wymagany.",
        production_status: "CREATED",
        final_test_passed: false,
      },
    ],
  };

  const refreshedBulkShipmentQueuePayload = {
    ...bulkShipmentQueuePayload,
    ready_count: 2,
    blocked_count: 1,
    devices: [
      {
        ...bulkShipmentQueuePayload.devices[0],
        production_status: "READY_FOR_SHIPMENT",
      },
      {
        ...bulkShipmentQueuePayload.devices[1],
        production_status: "READY_FOR_SHIPMENT",
      },
      bulkShipmentQueuePayload.devices[2],
    ],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      await fulfillQueueRequest(
        path,
        route,
        "/api/shipment-readiness",
        readyMarked
          ? refreshedBulkShipmentQueuePayload
          : bulkShipmentQueuePayload,
      )
    ) {
      return;
    }

    if (
      (path === "/api/devices/BULK-READY-001/status" ||
        path === "/api/devices/BULK-READY-002/status") &&
      request.method() === "PATCH"
    ) {
      patchRequests += 1;
      expect(request.postDataJSON()).toEqual({
        production_status: "READY_FOR_SHIPMENT",
      });
      readyMarked = true;

      const serialNumber = path.includes("BULK-READY-001")
        ? "BULK-READY-001"
        : "BULK-READY-002";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `DEV-${serialNumber}`,
          device_serial_number: serialNumber,
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          hardware_version: null,
          firmware_version: null,
          bootloader_version: null,
          created_by: null,
          production_status: "READY_FOR_SHIPMENT",
          created_at: "2026-05-01T08:00:00Z",
          updated_at: "2026-05-01T10:15:00Z",
        }),
      });
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Zaznacz wszystkie urządzenia w kolejce wysyłki na stronie",
    })
    .check();

  await expect(page.getByText("Zaznaczone: 3")).toBeVisible();
  await expect(page.getByText("Gotowe do oznaczenia: 2")).toBeVisible();

  await page.getByRole("button", { name: "Oznacz gotowe (2)" }).click();

  await expect(
    page.getByText("Oznaczono jako gotowe do wysyłki 2 urządzeń."),
  ).toBeVisible();
  expect(patchRequests).toBe(2);
  await expect(page.getByRole("checkbox", { name: "Zaznacz BULK-READY-001" })).not.toBeChecked();
});

test("dashboard closes selected shipment device critical NCRs from bulk actions", async ({
  page,
}) => {
  let ncrClosed = false;
  let patchRequests = 0;

  const bulkShipmentNcrQueuePayload = {
    ...shipmentQueuePayload,
    total_devices: 3,
    ready_count: 0,
    blocked_count: 3,
    returned_count: 3,
    devices: [
      {
        ...shipmentQueuePayload.devices[0],
        device_serial_number: "BULK-NCR-001",
        has_critical_open_ncr: true,
        critical_open_ncr_ids: ["NCR-DEVICE-BULK-001"],
        primary_blocking_code: "CRITICAL_OPEN_NCR",
        primary_blocking_message: "Urządzenie ma otwartą krytyczną NCR.",
        recommended_action: "RESOLVE_CRITICAL_NCR",
        can_transition_to_ready_for_shipment: false,
      },
      {
        ...shipmentQueuePayload.devices[0],
        device_serial_number: "BULK-NCR-002",
        has_critical_open_ncr: true,
        critical_open_ncr_ids: ["NCR-DEVICE-BULK-002"],
        primary_blocking_code: "CRITICAL_OPEN_NCR",
        primary_blocking_message: "Urządzenie ma otwartą krytyczną NCR.",
        recommended_action: "RESOLVE_CRITICAL_NCR",
        can_transition_to_ready_for_shipment: false,
      },
      {
        ...shipmentQueuePayload.devices[0],
        device_serial_number: "BULK-NCR-BLOCK-001",
        has_critical_open_ncr: false,
        critical_open_ncr_ids: [],
        primary_blocking_code: "FINAL_TEST_NOT_PASSED",
        primary_blocking_message: "Final test jest jeszcze wymagany.",
        recommended_action: "RUN_FINAL_TEST",
        can_transition_to_ready_for_shipment: false,
        final_test_passed: false,
        production_status: "CREATED",
      },
    ],
  };

  const refreshedBulkShipmentNcrQueuePayload = {
    ...bulkShipmentNcrQueuePayload,
    devices: [
      {
        ...bulkShipmentNcrQueuePayload.devices[0],
        has_critical_open_ncr: false,
        critical_open_ncr_ids: [],
        primary_blocking_code: null,
        primary_blocking_message: null,
        recommended_action: "MARK_READY_FOR_SHIPMENT",
        can_transition_to_ready_for_shipment: true,
      },
      {
        ...bulkShipmentNcrQueuePayload.devices[1],
        has_critical_open_ncr: false,
        critical_open_ncr_ids: [],
        primary_blocking_code: null,
        primary_blocking_message: null,
        recommended_action: "MARK_READY_FOR_SHIPMENT",
        can_transition_to_ready_for_shipment: true,
      },
      bulkShipmentNcrQueuePayload.devices[2],
    ],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      await fulfillQueueRequest(
        path,
        route,
        "/api/shipment-readiness",
        ncrClosed
          ? refreshedBulkShipmentNcrQueuePayload
          : bulkShipmentNcrQueuePayload,
      )
    ) {
      return;
    }

    if (
      (path === "/api/nonconformities/NCR-DEVICE-BULK-001" ||
        path === "/api/nonconformities/NCR-DEVICE-BULK-002") &&
      request.method() === "PATCH"
    ) {
      patchRequests += 1;
      const serialNumber = path.includes("NCR-DEVICE-BULK-001")
        ? "BULK-NCR-001"
        : "BULK-NCR-002";
      const ncrId = path.includes("NCR-DEVICE-BULK-001")
        ? "NCR-DEVICE-BULK-001"
        : "NCR-DEVICE-BULK-002";
      expect(request.postDataJSON()).toEqual({
        status: "CLOSED",
        corrective_action: `Zamknięte zbiorczo z kolejki wysyłki dla ${serialNumber}.`,
      });
      ncrClosed = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `ROW-${ncrId}`,
          ncr_id: ncrId,
          status: "CLOSED",
          corrective_action: `Zamknięte zbiorczo z kolejki wysyłki dla ${serialNumber}.`,
        }),
      });
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Zaznacz wszystkie urządzenia w kolejce wysyłki na stronie",
    })
    .check();

  await expect(page.getByText("Zaznaczone: 3")).toBeVisible();
  await expect(page.getByText("Z krytycznym NCR: 2")).toBeVisible();

  await page.getByRole("button", { name: "Zamknij NCR urządzeń (2)" }).click();

  await expect(
    page.getByText("Zamknięto 2 krytyczne NCR urządzeń w 2 urządzeniach."),
  ).toBeVisible();
  expect(patchRequests).toBe(2);
  await expect(page.getByRole("checkbox", { name: "Zaznacz BULK-NCR-001" })).not.toBeChecked();
});

test("dashboard records bulk component QC PASS from selected queue rows", async ({
  page,
}) => {
  let componentQcRecorded = false;
  let createRequests = 0;
  let completeRequests = 0;
  const qcRunIds: string[] = [];

  const bulkComponentQcQueuePayload = {
    ...componentActionQueuePayload,
    total_devices: 3,
    devices_with_issues: 3,
    returned_count: 3,
    devices: [
      {
        ...componentActionQueuePayload.devices[0],
        device_serial_number: "COMP-QC-001",
        primary_quality_status: "QC_NOT_PASSED",
        primary_blocking_component_type: "FAN_MODULE",
        primary_blocking_component_serial_number: "FAN-001",
        recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      },
      {
        ...componentActionQueuePayload.devices[0],
        device_serial_number: "COMP-QC-002",
        primary_quality_status: "QC_NOT_PASSED",
        primary_blocking_component_type: "FAN_MODULE",
        primary_blocking_component_serial_number: "FAN-002",
        recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      },
      {
        ...componentActionQueuePayload.devices[0],
        device_serial_number: "COMP-NCR-001",
        primary_quality_status: "CRITICAL_NCR_OPEN",
        primary_blocking_component_type: "FAN_MODULE",
        primary_blocking_component_serial_number: "FAN-900",
        recommended_action: "RESOLVE_COMPONENT_QUALITY",
      },
    ],
  };

  const refreshedBulkComponentQcQueuePayload = {
    ...bulkComponentQcQueuePayload,
    devices_with_issues: 1,
    devices: [
      {
        ...bulkComponentQcQueuePayload.devices[0],
        passes_component_quality_gate: true,
        primary_quality_status: "PASS",
        primary_blocking_component_type: null,
        primary_blocking_component_serial_number: null,
        recommended_action: "NO_ACTION",
        blocked_components: 0,
        passing_components: 2,
      },
      {
        ...bulkComponentQcQueuePayload.devices[1],
        passes_component_quality_gate: true,
        primary_quality_status: "PASS",
        primary_blocking_component_type: null,
        primary_blocking_component_serial_number: null,
        recommended_action: "NO_ACTION",
        blocked_components: 0,
        passing_components: 2,
      },
      bulkComponentQcQueuePayload.devices[2],
    ],
  };

  const componentQcDetailsBySerial: Record<string, unknown> = {
    "COMP-QC-001": {
      ...componentDetailsPayload,
      device_serial_number: "COMP-QC-001",
      primary_quality_status: "QC_NOT_PASSED",
      primary_blocking_component_serial_number: "FAN-001",
      recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      components: [
        {
          ...componentDetailsPayload.components[0],
          component_serial_number: "CTRL-001",
          critical_open_ncr_ids: [],
          has_critical_open_ncr: false,
        },
        {
          ...componentDetailsPayload.components[1],
          component_serial_number: "FAN-001",
          child_barcode_value: "BC-FAN-001",
          critical_open_ncr_ids: [],
          has_critical_open_ncr: false,
        },
      ],
    },
    "COMP-QC-002": {
      ...componentDetailsPayload,
      device_serial_number: "COMP-QC-002",
      primary_quality_status: "QC_NOT_PASSED",
      primary_blocking_component_serial_number: "FAN-002",
      recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      components: [
        {
          ...componentDetailsPayload.components[0],
          component_serial_number: "CTRL-002",
          critical_open_ncr_ids: [],
          has_critical_open_ncr: false,
        },
        {
          ...componentDetailsPayload.components[1],
          component_serial_number: "FAN-002",
          child_barcode_value: "BC-FAN-002",
          critical_open_ncr_ids: [],
          has_critical_open_ncr: false,
        },
      ],
    },
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      await fulfillQueueRequest(
        path,
        route,
        "/api/shipment-readiness",
        shipmentQueuePayload,
      )
    ) {
      return;
    }

    if (
      await fulfillQueueRequest(
        path,
        route,
        "/api/component-quality",
        componentQcRecorded
          ? refreshedBulkComponentQcQueuePayload
          : bulkComponentQcQueuePayload,
      )
    ) {
      return;
    }

    if (
      request.method() === "GET" &&
      (await fulfillMappedComponentQualityRequests(
        path,
        route,
        componentQcDetailsBySerial,
      ))
    ) {
      return;
    }

    if (
      await fulfillQcRunCreateRequest(path, request.method(), route, {
        onMatched: (payload) => {
          createRequests += 1;
          qcRunIds.push(payload.run_id);

          expect(payload.work_session_id).toBe("WS-QA-001");
          expect(payload.process_stage).toBe("COMPONENT_QC");
          expect(["COMP-QC-001", "COMP-QC-002"]).toContain(
            payload.device_serial_number,
          );
          expect(["FAN-001", "FAN-002"]).toContain(payload.item_serial_number);
          expect(["BC-FAN-001", "BC-FAN-002"]).toContain(payload.barcode_value);
        },
      })
    ) {
      return;
    }

    if (
      await fulfillQcRunCompleteRequest(path, request.method(), route, {
        runIds: qcRunIds,
        onMatched: () => {
          completeRequests += 1;
          componentQcRecorded = true;
          expect(request.postData()).toBe("result=PASS");
        },
      })
    ) {
      return;
    }

    if (await fulfillOptionalActionContextRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "Komponenty" }).click();
  await expect(page.getByText("COMP-QC-001")).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: "Zaznacz wszystkie urządzenia w kolejce komponentów na stronie",
    })
    .check();

  await expect(page.getByText("Zaznaczone: 3")).toBeVisible();
  await expect(page.getByText("Gotowe do QC PASS: 2")).toBeVisible();
  await expect(
    page.getByLabel("Sesja QC dla akcji zbiorczej"),
  ).toHaveValue("WS-QA-001");

  await page.getByRole("button", { name: "Zapisz QC PASS (2)" }).click();

  await expect(
    page.getByText("Zapisano zbiorczy komponentowy QC PASS dla 2 urządzeń."),
  ).toBeVisible();
  expect(createRequests).toBe(2);
  expect(completeRequests).toBe(2);
  await expect(page.getByRole("checkbox", { name: "Zaznacz COMP-QC-001" })).not.toBeChecked();
});

test("dashboard closes selected component critical NCRs from bulk actions", async ({
  page,
}) => {
  let ncrClosed = false;
  let patchRequests = 0;

  const bulkComponentQueuePayload = {
    ...componentActionQueuePayload,
    total_devices: 3,
    devices_with_issues: 3,
    returned_count: 3,
    devices: [
      {
        ...componentActionQueuePayload.devices[0],
        device_serial_number: "COMP-NCR-001",
        primary_quality_status: "CRITICAL_NCR_OPEN",
        primary_blocking_component_type: "FAN_MODULE",
        primary_blocking_component_serial_number: "FAN-001",
        recommended_action: "RESOLVE_COMPONENT_QUALITY",
      },
      {
        ...componentActionQueuePayload.devices[0],
        device_serial_number: "COMP-NCR-002",
        primary_quality_status: "CRITICAL_NCR_OPEN",
        primary_blocking_component_type: "FAN_MODULE",
        primary_blocking_component_serial_number: "FAN-002",
        recommended_action: "RESOLVE_COMPONENT_QUALITY",
      },
      {
        ...componentActionQueuePayload.devices[0],
        device_serial_number: "COMP-QC-001",
        primary_quality_status: "QC_NOT_PASSED",
        primary_blocking_component_type: "CONTROL_PCB",
        primary_blocking_component_serial_number: "PCB-001",
        recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      },
    ],
  };

  const refreshedBulkComponentQueuePayload = {
    ...bulkComponentQueuePayload,
    devices_with_issues: 1,
    devices: [
      {
        ...bulkComponentQueuePayload.devices[0],
        passes_component_quality_gate: true,
        primary_quality_status: "PASS",
        primary_blocking_component_type: null,
        primary_blocking_component_serial_number: null,
        recommended_action: "NO_ACTION",
        blocked_components: 0,
        passing_components: 2,
      },
      {
        ...bulkComponentQueuePayload.devices[1],
        passes_component_quality_gate: true,
        primary_quality_status: "PASS",
        primary_blocking_component_type: null,
        primary_blocking_component_serial_number: null,
        recommended_action: "NO_ACTION",
        blocked_components: 0,
        passing_components: 2,
      },
      bulkComponentQueuePayload.devices[2],
    ],
  };

  const componentBulkDetailsBySerial: Record<string, unknown> = {
    "COMP-NCR-001": {
      ...componentDetailsPayload,
      device_serial_number: "COMP-NCR-001",
      primary_quality_status: "CRITICAL_NCR_OPEN",
      primary_blocking_component_serial_number: "FAN-001",
      recommended_action: "RESOLVE_COMPONENT_QUALITY",
      components: [
        {
          ...componentDetailsPayload.components[0],
          component_serial_number: "CTRL-001",
          critical_open_ncr_ids: [],
          has_critical_open_ncr: false,
        },
        {
          ...componentDetailsPayload.components[1],
          component_serial_number: "FAN-001",
          critical_open_ncr_ids: ["NCR-COMP-BULK-001"],
          has_critical_open_ncr: true,
        },
      ],
    },
    "COMP-NCR-002": {
      ...componentDetailsPayload,
      device_serial_number: "COMP-NCR-002",
      primary_quality_status: "CRITICAL_NCR_OPEN",
      primary_blocking_component_serial_number: "FAN-002",
      recommended_action: "RESOLVE_COMPONENT_QUALITY",
      components: [
        {
          ...componentDetailsPayload.components[0],
          component_serial_number: "CTRL-002",
          critical_open_ncr_ids: [],
          has_critical_open_ncr: false,
        },
        {
          ...componentDetailsPayload.components[1],
          component_serial_number: "FAN-002",
          critical_open_ncr_ids: ["NCR-COMP-BULK-002"],
          has_critical_open_ncr: true,
        },
      ],
    },
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      await fulfillQueueRequest(
        path,
        route,
        "/api/shipment-readiness",
        shipmentQueuePayload,
      )
    ) {
      return;
    }

    if (
      await fulfillQueueRequest(
        path,
        route,
        "/api/component-quality",
        ncrClosed
          ? refreshedBulkComponentQueuePayload
          : bulkComponentQueuePayload,
      )
    ) {
      return;
    }

    if (
      request.method() === "GET" &&
      (await fulfillMappedComponentQualityRequests(
        path,
        route,
        componentBulkDetailsBySerial,
      ))
    ) {
      return;
    }

    if (
      (path === "/api/nonconformities/NCR-COMP-BULK-001" ||
        path === "/api/nonconformities/NCR-COMP-BULK-002") &&
      request.method() === "PATCH"
    ) {
      patchRequests += 1;
      const serialNumber = path.includes("NCR-COMP-BULK-001")
        ? "COMP-NCR-001"
        : "COMP-NCR-002";
      const ncrId = path.includes("NCR-COMP-BULK-001")
        ? "NCR-COMP-BULK-001"
        : "NCR-COMP-BULK-002";
      expect(request.postDataJSON()).toEqual({
        status: "CLOSED",
        corrective_action: `Zamknięte zbiorczo z kolejki komponentów dla ${serialNumber}.`,
      });
      ncrClosed = true;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `ROW-${ncrId}`,
          ncr_id: ncrId,
          status: "CLOSED",
          corrective_action: `Zamknięte zbiorczo z kolejki komponentów dla ${serialNumber}.`,
        }),
      });
      return;
    }

    if (await fulfillOptionalActionContextRequests(path, route)) {
      return;
    }

    throw new Error(`Unexpected request: ${request.method()} ${path}`);
  });

  await page.goto("/");

  await expect(page.getByText("API OK")).toBeVisible();
  await page.getByRole("button", { name: "Komponenty" }).click();
  await expect(page.getByText("COMP-NCR-001")).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: "Zaznacz wszystkie urządzenia w kolejce komponentów na stronie",
    })
    .check();

  await expect(page.getByText("Zaznaczone: 3")).toBeVisible();
  await expect(page.getByText("Z krytycznym NCR: 2")).toBeVisible();

  await page
    .getByRole("button", { name: "Zamknij NCR komponentów (2)" })
    .click();

  await expect(
    page.getByText("Zamknięto 2 krytyczne NCR komponentów w 2 urządzeniach."),
  ).toBeVisible();
  expect(patchRequests).toBe(2);
  await expect(
    page.getByRole("checkbox", { name: "Zaznacz COMP-NCR-001" }),
  ).not.toBeChecked();
});
