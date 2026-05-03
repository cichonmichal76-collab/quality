import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type {
  AuditEvent,
  DeviceComponentQuality,
  DeviceComponentQualityQueue,
  DeviceShipmentQueue,
  DeviceShipmentReadiness,
  OperatorRead,
  ServiceSessionQueue,
  ServiceSessionRead,
  WorkSessionRead,
} from "./api";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const VIEW_STORAGE_KEY = "servicetrace.web.activeView";
const SHIPMENT_FILTERS_STORAGE_KEY = "servicetrace.web.shipmentFilters";
const COMPONENT_FILTERS_STORAGE_KEY = "servicetrace.web.componentFilters";
const AUTO_REFRESH_ENABLED_STORAGE_KEY =
  "servicetrace.web.autoRefreshEnabled";
const AUTO_REFRESH_INTERVAL_STORAGE_KEY =
  "servicetrace.web.autoRefreshIntervalMs";

const shipmentPayload: DeviceShipmentQueue = {
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
    {
      recommended_action: "MARK_READY_FOR_SHIPMENT",
      device_count: 1,
    },
  ],
  latest_shipment_gate_result_summary: [
    {
      result: "PASS",
      device_count: 1,
    },
  ],
  production_status_summary: [
    {
      production_status: "FINAL_TEST_PASSED",
      device_count: 1,
    },
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
    },
  ],
};

const componentPayload: DeviceComponentQualityQueue = {
  total_devices: 1,
  devices_with_issues: 1,
  returned_count: 1,
  offset: 0,
  limit: 100,
  has_more: false,
  next_offset: null,
  filters: {},
  quality_status_summary: [
    {
      quality_status: "QC_NOT_PASSED",
      component_count: 1,
      device_count: 1,
    },
  ],
  variant_code_summary: [{ variant_code: "DEFAULT", device_count: 1 }],
  production_status_summary: [
    {
      production_status: "FINAL_TEST_PASSED",
      device_count: 1,
    },
  ],
  primary_quality_status_summary: [
    {
      primary_quality_status: "QC_NOT_PASSED",
      device_count: 1,
    },
  ],
  component_quality_gate_summary: [
    {
      passes_component_quality_gate: false,
      device_count: 1,
    },
  ],
  staleness_summary: [{ stale_bucket: "D1_TO_D3", device_count: 1 }],
  component_type_summary: [
    {
      component_type: "FAN_MODULE",
      component_count: 1,
      device_count: 1,
    },
  ],
  blocking_component_type_summary: [
    {
      component_type: "FAN_MODULE",
      component_count: 1,
      device_count: 1,
    },
  ],
  primary_blocking_component_type_summary: [
    {
      component_type: "FAN_MODULE",
      device_count: 1,
    },
  ],
  recommended_action_summary: [
    {
      recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
      device_count: 1,
    },
  ],
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
};

const serviceQueuePayload: ServiceSessionQueue = {
  total_sessions: 2,
  reuploaded_sessions: 1,
  returned_count: 2,
  offset: 0,
  limit: 100,
  has_more: false,
  next_offset: null,
  filters: {},
  upload_status_summary: [
    {
      upload_status: "UPLOADED",
      session_count: 2,
    },
  ],
  result_summary: [
    {
      result: "PASS",
      session_count: 1,
    },
    {
      result: "HOLD",
      session_count: 1,
    },
  ],
  device_type_summary: [
    {
      device_type: "DEMO-SVC",
      session_count: 2,
    },
  ],
  technician_summary: [
    {
      technician_id: "TECH-A",
      session_count: 2,
    },
  ],
  trigger_source_summary: [
    {
      client_trigger_source: "AUTO_NETWORK",
      session_count: 1,
    },
    {
      client_trigger_source: "MANUAL",
      session_count: 1,
    },
  ],
  sessions: [
    {
      id: "svc-row-001",
      session_id: "SVC-001",
      device_serial_number: "SVC-DEVICE-001",
      device_type: "DEMO-SVC",
      technician_id: "TECH-A",
      result: "PASS",
      firmware_version: "1.0.1",
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
    {
      id: "svc-row-002",
      session_id: "SVC-002",
      device_serial_number: "SVC-DEVICE-002",
      device_type: "DEMO-SVC",
      technician_id: "TECH-A",
      result: "HOLD",
      firmware_version: "1.0.2",
      bootloader_version: "0.9.1",
      package_path: "/tmp/SVC-002.zip",
      package_hash: "hash-002",
      upload_status: "UPLOADED",
      upload_count: 1,
      client_attempt_id: "ATT-002",
      client_attempt_number: 1,
      client_trigger_source: "MANUAL",
      upload_correlation_id: "CORR-002",
      uploaded_at: "2026-05-03T09:00:00Z",
      created_at: "2026-05-03T08:45:00Z",
    },
  ],
};

const serviceSessionDetailsPayload: ServiceSessionRead = {
  ...serviceQueuePayload.sessions[0],
  technician_id: "TECH-DETAIL-001",
  firmware_version: "1.0.9",
  bootloader_version: "0.9.9",
  package_hash: "hash-detail-001",
  client_attempt_id: "ATT-DETAIL-001",
  client_attempt_number: 3,
  client_trigger_source: "DEFERRED_WORKER",
  upload_correlation_id: "CORR-DETAIL-001",
};

const serviceSessionDetailsAuditPayload: AuditEvent[] = [
  {
    id: "AUD-SVC-001",
    event_type: "SERVICE_SESSION_PACKAGE_REUPLOADED",
    entity_type: "SERVICE_SESSION",
    entity_id: "SVC-001",
    work_session_id: null,
    operator_id: "TECH-DETAIL-001",
    workstation_id: null,
    machine_id: null,
    result: "UPLOADED",
    message: "Service session package reuploaded",
    payload: {
      upload_count: 3,
      package_hash: "hash-detail-001",
      upload_correlation_id: "CORR-DETAIL-001",
      client_attempt_id: "ATT-DETAIL-001",
      client_attempt_number: 3,
      client_trigger_source: "DEFERRED_WORKER",
    },
    created_at: "2026-05-03T09:15:00Z",
  },
];

const shipmentDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentPayload.devices[0],
  has_critical_open_ncr: true,
  critical_open_ncr_ids: ["NCR-DEVICE-001"],
  bom_compliance: {
    ...shipmentPayload.devices[0].bom_compliance,
    device_serial_number: "SHIP-001",
    device_type: "DEMO-OPS",
    device_variant_code: "DEFAULT",
    production_status: "FINAL_TEST_PASSED",
    resolution_source: "BOUND_TEMPLATE",
    resolved_version: "1.2",
    resolved_status: "ACTIVE",
    resolved_is_active: true,
    resolved_is_effective_now: true,
    is_bom_resolved: true,
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
    missing_required_components: ["FAN_MODULE"],
    blocking_reason: "Brak FAN_MODULE",
  },
  primary_blocking_code: "BOM_REQUIRED_COMPONENTS_MISSING",
  primary_blocking_message: "Brakuje FAN_MODULE",
  recommended_action: "COMPLETE_ASSEMBLY",
  blocking_reasons: ["FAN_MODULE", "Brak zamknięcia krytycznej NCR"],
  blocking_checks: [
    {
      code: "BOM_REQUIRED_COMPONENTS_MISSING",
      is_blocking: true,
      message: "Brak wymaganego komponentu FAN_MODULE",
      details: ["FAN_MODULE"],
    },
    {
      code: "CRITICAL_OPEN_NCR",
      is_blocking: true,
      message: "Urządzenie ma otwartą krytyczną NCR",
      details: ["NCR-DEVICE-001"],
    },
  ],
};

const shipmentComponentDetailsPayload: DeviceComponentQuality = {
  device_serial_number: "SHIP-001",
  device_type: "DEMO-OPS",
  device_variant_code: "DEFAULT",
  production_status: "FINAL_TEST_PASSED",
  device_created_at: "2026-05-01T08:00:00Z",
  device_updated_at: "2026-05-01T09:15:00Z",
  stale_bucket: "D1_TO_D3",
  total_installed_components: 2,
  passing_components: 1,
  blocked_components: 1,
  passes_component_quality_gate: false,
  primary_quality_status: "QC_NOT_PASSED",
  primary_blocking_component_type: "FAN_MODULE",
  primary_blocking_component_serial_number: "FAN-900",
  recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
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
    {
      component_serial_number: "FAN-900",
      component_type: "FAN_MODULE",
      child_barcode_value: "BC-FAN-900",
      installed_at: "2026-05-01T08:40:00Z",
      installed_by: "OP-02",
      workstation_id: "WS-02",
      bom_template_id: "BOM-01",
      bom_version: "1.2",
      component_qc_passed: false,
      has_critical_open_ncr: true,
      critical_open_ncr_ids: ["NCR-COMP-001"],
      blocks_shipment: true,
      quality_status: "QC_NOT_PASSED",
    },
  ],
};

const shipmentGateHistoryPayload: AuditEvent[] = [
  {
    id: "AUD-1",
    event_type: "SHIPMENT_GATE_BLOCKED",
    entity_type: "DEVICE",
    entity_id: "SHIP-001",
    work_session_id: "WS-10",
    operator_id: "OP-10",
    workstation_id: "ST-10",
    machine_id: null,
    result: "BLOCKED",
    message: "Gate zablokowany przez brak FAN_MODULE",
    payload: { requested_status: "READY_FOR_SHIPMENT" },
    created_at: "2026-05-01T09:20:00Z",
  },
  {
    id: "AUD-2",
    event_type: "SHIPMENT_GATE_PASSED",
    entity_type: "DEVICE",
    entity_id: "SHIP-001",
    work_session_id: "WS-11",
    operator_id: "OP-11",
    workstation_id: "ST-11",
    machine_id: null,
    result: "PASS",
    message: "Gate przeszedł po naprawie",
    payload: { requested_status: "READY_FOR_SHIPMENT" },
    created_at: "2026-05-01T10:00:00Z",
  },
];

const serviceSessionPayload: ServiceSessionRead[] = [
  {
    id: "svc-db-1",
    session_id: "SVC-9001",
    device_serial_number: "SHIP-001",
    device_type: "DEMO-OPS",
    technician_id: "TECH-001",
    result: "PASS",
    firmware_version: "1.2.4",
    bootloader_version: "0.9.8",
    package_path: "/tmp/service-package.zip",
    package_hash: "hash-ship-001",
    upload_status: "UPLOADED",
    upload_count: 2,
    client_attempt_id: "SYNC-UPLOAD-0002",
    client_attempt_number: 2,
    client_trigger_source: "AUTO_NETWORK",
    upload_correlation_id: "SRV-UP-ABCD12345678",
    uploaded_at: "2026-05-01T10:30:00Z",
    created_at: "2026-05-01T10:00:00Z",
  },
];

const serviceSessionAuditPayload: AuditEvent[] = [
  {
    id: "AUD-SVC-2",
    event_type: "SERVICE_SESSION_PACKAGE_REUPLOADED",
    entity_type: "SERVICE_SESSION",
    entity_id: "SVC-9001",
    work_session_id: null,
    operator_id: "TECH-001",
    workstation_id: null,
    machine_id: null,
    result: "UPLOADED",
    message: "Service session package reuploaded",
    payload: {
      device_serial_number: "SHIP-001",
      package_hash: "hash-ship-001-v2",
      upload_correlation_id: "SRV-UP-0002",
      upload_count: 2,
      client_attempt_id: "SYNC-TRY-0002",
      client_attempt_number: 2,
      client_trigger_source: "AUTO_NETWORK",
    },
    created_at: "2026-05-01T09:45:00Z",
  },
  {
    id: "AUD-SVC-1",
    event_type: "SERVICE_SESSION_PACKAGE_UPLOADED",
    entity_type: "SERVICE_SESSION",
    entity_id: "SVC-9001",
    work_session_id: null,
    operator_id: "TECH-001",
    workstation_id: null,
    machine_id: null,
    result: "UPLOADED",
    message: "Service session package uploaded",
    payload: {
      device_serial_number: "SHIP-001",
      package_hash: "hash-ship-001",
      upload_correlation_id: "SRV-UP-0001",
      upload_count: 1,
      client_attempt_id: "SYNC-TRY-0001",
      client_attempt_number: 1,
      client_trigger_source: "MANUAL",
    },
    created_at: "2026-05-01T09:30:00Z",
  },
];

const shipmentReadyQueuePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  production_status_summary: [
    {
      production_status: "READY_FOR_SHIPMENT",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...shipmentPayload.devices[0],
      production_status: "READY_FOR_SHIPMENT",
      device_updated_at: "2026-05-01T10:15:00Z",
    },
  ],
};

const shipmentActionDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentPayload.devices[0],
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
  primary_blocking_code: null,
  primary_blocking_message: null,
  recommended_action: "MARK_READY_FOR_SHIPMENT",
  blocking_reasons: [],
  blocking_checks: [],
};

const shipmentActionComponentDetailsPayload: DeviceComponentQuality = {
  device_serial_number: "SHIP-001",
  device_type: "DEMO-OPS",
  device_variant_code: "DEFAULT",
  production_status: "FINAL_TEST_PASSED",
  device_created_at: "2026-05-01T08:00:00Z",
  device_updated_at: "2026-05-01T09:15:00Z",
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

const componentActionShipmentDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentActionDetailsPayload,
  device_serial_number: "COMP-001",
  bom_compliance: {
    ...shipmentActionDetailsPayload.bom_compliance,
    device_serial_number: "COMP-001",
    installed_component_count: 2,
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
  primary_blocking_code: "COMPONENT_QC_NOT_PASSED",
  primary_blocking_message: "Zamontowany komponent nie ma QC_PASSED",
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

const componentActionComponentDetailsPayload: DeviceComponentQuality = {
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

const componentActionAfterPassQueuePayload: DeviceComponentQualityQueue = {
  ...componentPayload,
  devices_with_issues: 0,
  quality_status_summary: [
    {
      quality_status: "PASS",
      component_count: 2,
      device_count: 1,
    },
  ],
  primary_quality_status_summary: [
    {
      primary_quality_status: "PASS",
      device_count: 1,
    },
  ],
  component_quality_gate_summary: [
    {
      passes_component_quality_gate: true,
      device_count: 1,
    },
  ],
  blocking_component_type_summary: [],
  primary_blocking_component_type_summary: [],
  recommended_action_summary: [
    {
      recommended_action: "NO_ACTION",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...componentPayload.devices[0],
      passes_component_quality_gate: true,
      primary_quality_status: "PASS",
      primary_blocking_component_type: null,
      primary_blocking_component_serial_number: null,
      recommended_action: "NO_ACTION",
      blocked_components: 0,
      passing_components: 2,
    },
  ],
};

const componentActionAfterPassShipmentDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentActionDetailsPayload,
  device_serial_number: "COMP-001",
  bom_compliance: {
    ...componentActionShipmentDetailsPayload.bom_compliance,
  },
  can_transition_to_ready_for_shipment: true,
  primary_blocking_code: null,
  primary_blocking_message: null,
  recommended_action: "MARK_READY_FOR_SHIPMENT",
  blocking_reasons: [],
  blocking_checks: [],
};

const componentActionAfterPassComponentDetailsPayload: DeviceComponentQuality = {
  ...componentActionComponentDetailsPayload,
  passing_components: 2,
  blocked_components: 0,
  passes_component_quality_gate: true,
  primary_quality_status: "PASS",
  primary_blocking_component_type: null,
  primary_blocking_component_serial_number: null,
  recommended_action: "NO_ACTION",
  components: componentActionComponentDetailsPayload.components?.map((component) =>
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

const shipmentAssemblyQueuePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  ready_count: 0,
  blocked_count: 1,
  recommended_action_summary: [
    {
      recommended_action: "COMPLETE_ASSEMBLY",
      device_count: 1,
    },
  ],
  latest_shipment_gate_result_summary: [
    {
      result: "BLOCKED",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...shipmentPayload.devices[0],
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

const shipmentAssemblyDetailsPayload: DeviceShipmentReadiness = {
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

const componentAssemblyDetailsPayload: DeviceComponentQuality = {
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

const shipmentAssemblyAfterQueuePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  ready_count: 1,
  blocked_count: 0,
  recommended_action_summary: [
    {
      recommended_action: "MARK_READY_FOR_SHIPMENT",
      device_count: 1,
    },
  ],
  latest_shipment_gate_result_summary: [
    {
      result: "PASS",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...shipmentPayload.devices[0],
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

const shipmentAssemblyAfterDetailsPayload: DeviceShipmentReadiness = {
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

const componentAssemblyAfterDetailsPayload: DeviceComponentQuality = {
  ...componentAssemblyDetailsPayload,
  device_updated_at: "2026-05-02T08:20:00Z",
  total_installed_components: 2,
  passing_components: 2,
  components: [
    ...(componentAssemblyDetailsPayload.components ?? []),
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

const shipmentDetailsReadyPayload: DeviceShipmentReadiness = {
  ...shipmentActionDetailsPayload,
  production_status: "READY_FOR_SHIPMENT",
  device_updated_at: "2026-05-01T10:15:00Z",
  latest_shipment_gate_decision: {
    event_type: "SHIPMENT_GATE_PASSED",
    result: "PASS",
    message: "Shipment gate passed",
    recommended_action: "MARK_READY_FOR_SHIPMENT",
    created_at: "2026-05-01T10:15:00Z",
  },
};

const shipmentGateHistoryReadyPayload: AuditEvent[] = [
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
  ...shipmentGateHistoryPayload,
];

const shipmentDetailsWithoutDeviceNcrPayload: DeviceShipmentReadiness = {
  ...shipmentDetailsPayload,
  has_critical_open_ncr: false,
  critical_open_ncr_ids: [],
  blocking_reasons: ["FAN_MODULE"],
  blocking_checks: [
    {
      code: "BOM_REQUIRED_COMPONENTS_MISSING",
      is_blocking: true,
      message: "Brak wymaganego komponentu FAN_MODULE",
      details: ["FAN_MODULE"],
    },
  ],
};

const shipmentComponentDetailsWithoutNcrPayload: DeviceComponentQuality = {
  ...shipmentComponentDetailsPayload,
  primary_quality_status: "QC_NOT_PASSED",
  primary_blocking_component_type: "FAN_MODULE",
  primary_blocking_component_serial_number: "FAN-900",
  recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
  components: shipmentComponentDetailsPayload.components?.map((component) =>
    component.component_serial_number === "FAN-900"
      ? {
          ...component,
          has_critical_open_ncr: false,
          critical_open_ncr_ids: [],
          quality_status: "QC_NOT_PASSED",
        }
      : component,
  ),
};

const shipmentShippedQueuePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  production_status_summary: [
    {
      production_status: "SHIPPED",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...shipmentPayload.devices[0],
      production_status: "SHIPPED",
      device_updated_at: "2026-05-01T11:00:00Z",
    },
  ],
};

const shipmentDetailsShippedPayload: DeviceShipmentReadiness = {
  ...shipmentActionDetailsPayload,
  production_status: "SHIPPED",
  device_updated_at: "2026-05-01T11:00:00Z",
  latest_shipment_gate_decision: {
    event_type: "SHIPMENT_GATE_PASSED",
    result: "PASS",
    message: "Shipment gate passed",
    recommended_action: "MARK_READY_FOR_SHIPMENT",
    created_at: "2026-05-01T10:15:00Z",
  },
};

const shipmentGateHistoryShippedPayload: AuditEvent[] = [
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
  ...shipmentGateHistoryReadyPayload,
];

const operatorsPayload: OperatorRead[] = [
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
    created_at: "2026-05-01T07:40:00Z",
  },
  {
    id: "OP-ROW-QA-001",
    operator_id: "OP-QA-001",
    full_name: "Quality Inspector",
    role: "QUALITY_INSPECTOR",
    rfid_uid_hash: "RFID-QA-001",
    is_active: true,
    created_at: "2026-05-01T07:45:00Z",
  },
];

const workSessionsPayload: WorkSessionRead[] = [
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

const shipmentFinalTestQueuePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  ready_count: 0,
  blocked_count: 1,
  recommended_action_summary: [
    {
      recommended_action: "RUN_FINAL_TEST",
      device_count: 1,
    },
  ],
  latest_shipment_gate_result_summary: [],
  production_status_summary: [
    {
      production_status: "CREATED",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...shipmentPayload.devices[0],
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
    },
  ],
};

const shipmentFinalTestDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentFinalTestQueuePayload.devices[0],
  bom_compliance: {
    ...shipmentActionDetailsPayload.bom_compliance,
    device_serial_number: "TEST-001",
    production_status: "CREATED",
  },
  blocking_checks: [
    {
      code: "FINAL_TEST_NOT_PASSED",
      is_blocking: true,
      message: "Final test not passed",
      details: [],
    },
  ],
};

const shipmentFinalTestComponentDetailsPayload: DeviceComponentQuality = {
  ...shipmentActionComponentDetailsPayload,
  device_serial_number: "TEST-001",
  production_status: "CREATED",
};

const shipmentAfterFinalTestPassQueuePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  ready_count: 1,
  blocked_count: 0,
  recommended_action_summary: [
    {
      recommended_action: "MARK_READY_FOR_SHIPMENT",
      device_count: 1,
    },
  ],
  latest_shipment_gate_result_summary: [],
  production_status_summary: [
    {
      production_status: "FINAL_TEST_PASSED",
      device_count: 1,
    },
  ],
  devices: [
    {
      ...shipmentPayload.devices[0],
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
    },
  ],
};

const shipmentAfterFinalTestPassDetailsPayload: DeviceShipmentReadiness = {
  ...shipmentAfterFinalTestPassQueuePayload.devices[0],
  bom_compliance: {
    ...shipmentActionDetailsPayload.bom_compliance,
    device_serial_number: "TEST-001",
    production_status: "FINAL_TEST_PASSED",
  },
  blocking_checks: [],
};

const paginatedShipmentPageOnePayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  total_devices: 3,
  ready_count: 2,
  blocked_count: 1,
  returned_count: 1,
  limit: 1,
  has_more: true,
  next_offset: 1,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-001",
    },
  ],
};

const paginatedShipmentPageTwoPayload: DeviceShipmentQueue = {
  ...paginatedShipmentPageOnePayload,
  offset: 1,
  next_offset: 2,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-002",
      device_updated_at: "2026-05-01T10:00:00Z",
    },
  ],
};

const paginatedComponentPageOnePayload: DeviceComponentQualityQueue = {
  ...componentPayload,
  total_devices: 2,
  devices_with_issues: 2,
  returned_count: 1,
  limit: 1,
  has_more: true,
  next_offset: 1,
  devices: [
    {
      ...componentPayload.devices[0],
      device_serial_number: "COMP-001",
    },
  ],
};

const paginatedComponentPageTwoPayload: DeviceComponentQualityQueue = {
  ...paginatedComponentPageOnePayload,
  offset: 1,
  has_more: false,
  next_offset: null,
  devices: [
    {
      ...componentPayload.devices[0],
      device_serial_number: "COMP-002",
      primary_blocking_component_serial_number: "FAN-002",
    },
  ],
};

const emptyComponentPayload: DeviceComponentQualityQueue = {
  ...componentPayload,
  total_devices: 0,
  devices_with_issues: 0,
  returned_count: 0,
  devices: [],
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
};

const staleShipmentPayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-OLD",
    },
  ],
};

const freshShipmentPayload: DeviceShipmentQueue = {
  ...shipmentPayload,
  devices: [
    {
      ...shipmentPayload.devices[0],
      device_serial_number: "SHIP-NEW",
      device_updated_at: "2026-05-01T11:00:00Z",
    },
  ],
};

function createJsonResponse(
  payload: unknown,
  init: { status?: number; statusText?: string } = {},
): Response {
  const status = init.status ?? 200;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? (status >= 200 && status < 300 ? "OK" : "Error"),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function createDeferredResponse() {
  let resolveResponse!: (response: Response) => void;
  let rejectResponse!: (error?: unknown) => void;

  const promise = new Promise<Response>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });

  return {
    promise,
    resolveResponse,
    rejectResponse,
  };
}

function createErrorResponse(
  status: number,
  statusText: string,
  detail: string,
): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({ detail }),
    text: async () => detail,
  } as Response;
}

afterEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders shipment queue data from API", async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(screen.getByText("API OK")).toBeInTheDocument();
    const shipmentActionsPanel = screen.getByText("Akcje operacyjne").closest("section");
    expect(shipmentActionsPanel).not.toBeNull();
    expect(
      within(shipmentActionsPanel as HTMLElement).getByText(/Oznacz gotowe do wys/i),
    ).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("switches to component view and renders component queue data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByText("FAN-001")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Główny status jakości" }),
    ).toBeInTheDocument();
    const componentActionsPanel = screen.getByText("Akcje operacyjne").closest("section");
    expect(componentActionsPanel).not.toBeNull();
    expect(
      within(componentActionsPanel as HTMLElement).getByText(
        /Uruchom QC komponentu \/ rework/i,
      ),
    ).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("filters shipment queue immediately from summary action buttons", async () => {
    const shipmentSummaryPayload: DeviceShipmentQueue = {
      ...shipmentPayload,
      total_devices: 1,
      ready_count: 0,
      blocked_count: 1,
      recommended_action_summary: [
        {
          recommended_action: "RUN_FINAL_TEST",
          device_count: 1,
        },
      ],
      latest_shipment_gate_result_summary: [
        {
          result: "BLOCKED",
          device_count: 1,
        },
      ],
      devices: [
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "TEST-001",
          production_status: "CREATED",
          final_test_passed: false,
          can_transition_to_ready_for_shipment: false,
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_BLOCKED",
            result: "BLOCKED",
            message: "Final test wymagany",
            recommended_action: "RUN_FINAL_TEST",
            created_at: "2026-05-01T09:05:00Z",
          },
          primary_blocking_code: "FINAL_TEST_NOT_PASSED",
          primary_blocking_message: "Final test wymagany",
          recommended_action: "RUN_FINAL_TEST",
          blocking_reasons: ["Final test wymagany"],
        },
      ],
    };
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentSummaryPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("TEST-001")).toBeInTheDocument();

    const shipmentActionsPanel = screen
      .getByText("Akcje operacyjne")
      .closest("section");
    expect(shipmentActionsPanel).not.toBeNull();

    fireEvent.click(
      within(shipmentActionsPanel as HTMLElement).getByRole("button", {
        name: /Uruchom final test/i,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?recommended_action=RUN_FINAL_TEST&only_blocked=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("filters shipment queue immediately from metric cards", async () => {
    const shipmentReadyPayload: DeviceShipmentQueue = {
      ...shipmentPayload,
      total_devices: 2,
      ready_count: 1,
      blocked_count: 1,
      devices: [
        shipmentPayload.devices[0],
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BLOCK-001",
          production_status: "CREATED",
          final_test_passed: false,
          can_transition_to_ready_for_shipment: false,
          latest_shipment_gate_decision: {
            event_type: "SHIPMENT_GATE_BLOCKED",
            result: "BLOCKED",
            message: "Final test wymagany",
            recommended_action: "RUN_FINAL_TEST",
            created_at: "2026-05-01T09:05:00Z",
          },
          primary_blocking_code: "FINAL_TEST_NOT_PASSED",
          primary_blocking_message: "Final test wymagany",
          recommended_action: "RUN_FINAL_TEST",
          blocking_reasons: ["Final test wymagany"],
        },
      ],
    };
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentReadyPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Gotowe$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?only_ready=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("filters component queue immediately from summary action buttons", async () => {
    const componentSummaryPayload: DeviceComponentQualityQueue = {
      ...componentPayload,
      recommended_action_summary: [
        {
          recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
          device_count: 1,
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentSummaryPayload))
      .mockResolvedValueOnce(createJsonResponse(componentSummaryPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    const componentActionsPanel = screen
      .getByText("Akcje operacyjne")
      .closest("section");
    expect(componentActionsPanel).not.toBeNull();

    fireEvent.click(
      within(componentActionsPanel as HTMLElement).getByRole("button", {
        name: /Uruchom QC komponentu \/ rework/i,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?recommended_action=RUN_COMPONENT_QC_OR_REWORK&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("filters component queue immediately from metric cards", async () => {
    const componentSummaryPayload: DeviceComponentQualityQueue = {
      ...componentPayload,
      total_devices: 2,
      devices_with_issues: 1,
      devices: [
        componentPayload.devices[0],
        {
          ...componentPayload.devices[0],
          device_serial_number: "PASS-001",
          passes_component_quality_gate: true,
          blocked_components: 0,
          passing_components: 2,
          primary_quality_status: "PASS",
          primary_blocking_component_type: null,
          primary_blocking_component_serial_number: null,
          recommended_action: "NO_ACTION",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentSummaryPayload))
      .mockResolvedValueOnce(createJsonResponse(componentSummaryPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /^Przechodzą gate$/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?passes_component_quality_gate=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("shows removable shipment filter chips and refreshes the queue immediately", async () => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        primary_blocking_code: "FINAL_TEST_NOT_PASSED",
        only_blocked: true,
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const activeFilters = await screen.findByRole("group", {
      name: "Aktywne filtry wysyłki",
    });
    expect(activeFilters).toHaveTextContent("Typ urządzenia: DEMO-OPS");
    expect(activeFilters).toHaveTextContent(
      "Główna blokada: Final test niezaliczony",
    );
    expect(activeFilters).toHaveTextContent("Tylko zablokowane");

    fireEvent.click(
      within(activeFilters).getByRole("button", {
        name: /Usuń filtr: Tylko zablokowane/i,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&primary_blocking_code=FINAL_TEST_NOT_PASSED&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(activeFilters).not.toHaveTextContent("Tylko zablokowane");
  });

  it("shows removable component filter chips and refreshes the queue immediately", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");
    localStorage.setItem(
      COMPONENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        passes_component_quality_gate: "true",
        only_blocking: false,
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const activeFilters = await screen.findByRole("group", {
      name: "Aktywne filtry komponentów",
    });
    expect(activeFilters).toHaveTextContent("Typ urządzenia: DEMO-OPS");
    expect(activeFilters).toHaveTextContent("Gate komponentów: Tak");
    expect(activeFilters).toHaveTextContent("Pokaż także nieblokujące");

    fireEvent.click(
      within(activeFilters).getByRole("button", {
        name: /Usuń filtr: Pokaż także nieblokujące/i,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?device_type=DEMO-OPS&passes_component_quality_gate=true&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(activeFilters).not.toHaveTextContent("Pokaż także nieblokujące");
  });

  it("opens device details drawer from shipment queue and renders fetched details", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(createJsonResponse(shipmentDetailsPayload));
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(createJsonResponse(shipmentComponentDetailsPayload));
      }

      if (url === "/api/service-sessions?device_serial_number=SHIP-001") {
        return Promise.resolve(createJsonResponse(serviceSessionPayload));
      }

      if (
        url ===
        "/api/audit-events?entity_type=SERVICE_SESSION&service_session_device_serial_number=SHIP-001"
      ) {
        return Promise.resolve(createJsonResponse(serviceSessionAuditPayload));
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse(shipmentGateHistoryPayload));
      }

      if (url === "/api/work-sessions") {
        return Promise.resolve(createJsonResponse(workSessionsPayload));
      }

      if (url === "/api/operators") {
        return Promise.resolve(createJsonResponse(operatorsPayload));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SHIP-001" })).toBeInTheDocument();
    expect(await screen.findByText(/Brak.*komponenty BOM/i)).toBeInTheDocument();
    expect(
      await screen.findByText("Gate zablokowany przez brak FAN_MODULE"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Pobierz paczkę ZIP" }),
    ).toHaveAttribute("href", "/api/service-sessions/SVC-9001/package");

    expect(screen.getByText("Historia uploadów i synchronizacji")).toBeInTheDocument();
    expect(
      screen.getByText("Service session package reuploaded"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Licznik uploadów backendu:/)).toHaveLength(2);
    const sessionDownloadLinks = screen
      .getAllByRole("link")
      .filter(
        (element) =>
          element.textContent?.includes("tej sesji") &&
          element.getAttribute("href") === "/api/service-sessions/SVC-9001/package",
      );
    expect(sessionDownloadLinks).toHaveLength(2);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/devices/SHIP-001/shipment-readiness",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/devices/SHIP-001/component-quality",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/service-sessions?device_serial_number=SHIP-001",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/devices/SHIP-001/shipment-gate-history?limit=10",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hydrates active tab, filters and selected device from URL", async () => {
    window.history.replaceState(
      {},
      "",
      "/?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_serial=COMP-001&device_type=DEMO-OPS&device_variant=DEFAULT",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Komponenty" })).toHaveClass(
      "is-active",
    );
    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("DEMO-OPS");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "COMP-001" }),
    ).toBeInTheDocument();
  });

  it("hydrates service view and selected commissioning session from URL", async () => {
    window.history.replaceState(
      {},
      "",
      "/?view=service&svc_device_type=DEMO-SVC&svc_sort_by=uploaded_at&svc_sort_desc=true&svc_limit=100&svc_offset=0&svc_session_id=SVC-001",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/service-sessions/queue?device_type=DEMO-SVC&sort_by=uploaded_at&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(serviceQueuePayload));
      }

      if (url === "/api/service-sessions/SVC-001") {
        return Promise.resolve(createJsonResponse(serviceSessionDetailsPayload));
      }

      if (
        url ===
        "/api/audit-events?entity_type=SERVICE_SESSION&entity_id=SVC-001"
      ) {
        return Promise.resolve(createJsonResponse(serviceSessionAuditPayload));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SVC-001")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Commissioning i serwis" }),
    ).toHaveClass("is-active");
    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("DEMO-SVC");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "SVC-001" }),
    ).toBeInTheDocument();
  });

  it("syncs active tab, filters and selected device into URL", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (
        url ===
        "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "COMP-001" }));

    await waitFor(() =>
      expect(window.location.search).toContain("view=components"),
    );
    expect(window.location.search).toContain("comp_device_type=DEMO-OPS");
    expect(window.location.search).toContain("device_serial=COMP-001");
    expect(window.location.search).toContain("device_type=DEMO-OPS");
    expect(window.location.search).toContain("device_variant=DEFAULT");

    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));

    await waitFor(() =>
      expect(window.location.search).not.toContain("device_serial=COMP-001"),
    );
  });

  it("opens full device details page directly from route", async () => {
    window.history.replaceState(
      {},
      "",
      "/devices/COMP-001?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "COMP-001" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText("Pełny widok urządzenia"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do dashboardu" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/?view=components&ship_sort_by=created_at&ship_sort_desc=true",
      ),
    );
    expect(
      screen.getByRole("link", { name: "Wróć do dashboardu" }),
    ).toHaveAttribute("href", expect.stringContaining("device_serial=COMP-001"));
  });

  it("copies current dashboard link with active filters", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");
    localStorage.setItem(
      COMPONENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        passes_component_quality_gate: "true",
        only_blocking: false,
      }),
    );

    const writeTextMock = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });

    const fetchMock = vi.fn(async () => createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(window.location.search).toContain("view=components");
    expect(window.location.search).toContain("comp_device_type=DEMO-OPS");
    expect(window.location.search).toContain(
      "comp_passes_component_quality_gate=true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Kopiuj link dashboardu" }),
    );

    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(window.location.href),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Link skopiowany.");
  });

  it("exports the active shipment queue to CSV", async () => {
    const createObjectURLMock = vi.fn((_blob: Blob) => {
      return "blob:shipment-export";
    });
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });

    const clickedDownloads: Array<{ download: string; href: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function click(this: HTMLAnchorElement) {
        clickedDownloads.push({
          download: this.download,
          href: this.href,
        });
      },
    );

    const shipmentExportPageOne: DeviceShipmentQueue = {
      ...shipmentPayload,
      total_devices: 3,
      returned_count: 2,
      limit: 500,
      has_more: true,
      next_offset: 500,
      devices: [
        shipmentPayload.devices[0],
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "SHIP-002",
        },
      ],
    };
    const shipmentExportPageTwo: DeviceShipmentQueue = {
      ...shipmentPayload,
      total_devices: 3,
      returned_count: 1,
      offset: 500,
      limit: 500,
      has_more: false,
      next_offset: null,
      devices: [
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "SHIP-003",
        },
      ],
    };
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (
        url ===
        "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=500"
      ) {
        return Promise.resolve(createJsonResponse(shipmentExportPageOne));
      }

      if (
        url ===
        "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=500&offset=500"
      ) {
        return Promise.resolve(createJsonResponse(shipmentExportPageTwo));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eksport CSV" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(createObjectURLMock).toHaveBeenCalledTimes(1));
    const csvBlob = createObjectURLMock.mock.calls[0]?.[0] as unknown as Blob;
    const csvText = await csvBlob.text();
    expect(csvText).toContain("device_serial_number");
    expect(csvText).toContain("SHIP-001");
    expect(csvText).toContain("SHIP-002");
    expect(csvText).toContain("SHIP-003");
    expect(csvText).toContain("MARK_READY_FOR_SHIPMENT");
    expect(clickedDownloads).toHaveLength(1);
    expect(clickedDownloads[0]?.download).toMatch(
      /^servicetrace-wysylka-\d{8}-\d{6}\.csv$/,
    );
    expect(clickedDownloads[0]?.href).toBe("blob:shipment-export");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:shipment-export");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Wyeksportowano CSV kolejki wysyłki (3 urządzeń).",
    );
  });

  it("exports the active component queue to CSV", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");

    const createObjectURLMock = vi.fn((_blob: Blob) => {
      return "blob:component-export";
    });
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });

    const clickedDownloads: Array<{ download: string; href: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function click(this: HTMLAnchorElement) {
        clickedDownloads.push({
          download: this.download,
          href: this.href,
        });
      },
    );

    const componentExportPageOne: DeviceComponentQualityQueue = {
      ...componentPayload,
      total_devices: 3,
      returned_count: 2,
      limit: 500,
      has_more: true,
      next_offset: 500,
      devices: [
        componentPayload.devices[0],
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-002",
        },
      ],
    };
    const componentExportPageTwo: DeviceComponentQualityQueue = {
      ...componentPayload,
      total_devices: 3,
      returned_count: 1,
      offset: 500,
      limit: 500,
      has_more: false,
      next_offset: null,
      devices: [
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-003",
        },
      ],
    };
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (
        url ===
        "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=500"
      ) {
        return Promise.resolve(createJsonResponse(componentExportPageOne));
      }

      if (
        url ===
        "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=500&offset=500"
      ) {
        return Promise.resolve(createJsonResponse(componentExportPageTwo));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("COMP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eksport CSV" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(createObjectURLMock).toHaveBeenCalledTimes(1));
    const csvBlob = createObjectURLMock.mock.calls[0]?.[0] as unknown as Blob;
    const csvText = await csvBlob.text();
    expect(csvText).toContain("device_serial_number");
    expect(csvText).toContain("COMP-001");
    expect(csvText).toContain("COMP-002");
    expect(csvText).toContain("COMP-003");
    expect(csvText).toContain("RUN_COMPONENT_QC_OR_REWORK");
    expect(clickedDownloads).toHaveLength(1);
    expect(clickedDownloads[0]?.download).toMatch(
      /^servicetrace-komponenty-\d{8}-\d{6}\.csv$/,
    );
    expect(clickedDownloads[0]?.href).toBe("blob:component-export");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:component-export");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Wyeksportowano CSV kolejki komponentów (3 urządzeń).",
    );
  });

  it("marks selected shipment devices ready from bulk actions", async () => {
    let readyMarked = false;
    const initialQueuePayload: DeviceShipmentQueue = {
      ...shipmentPayload,
      total_devices: 3,
      ready_count: 0,
      blocked_count: 3,
      returned_count: 3,
      devices: [
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BULK-READY-001",
          can_transition_to_ready_for_shipment: true,
          recommended_action: "MARK_READY_FOR_SHIPMENT",
          production_status: "FINAL_TEST_PASSED",
        },
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BULK-READY-002",
          can_transition_to_ready_for_shipment: true,
          recommended_action: "MARK_READY_FOR_SHIPMENT",
          production_status: "FINAL_TEST_PASSED",
        },
        {
          ...shipmentPayload.devices[0],
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
    const refreshedQueuePayload: DeviceShipmentQueue = {
      ...initialQueuePayload,
      ready_count: 2,
      blocked_count: 1,
      devices: [
        {
          ...initialQueuePayload.devices[0],
          production_status: "READY_FOR_SHIPMENT",
        },
        {
          ...initialQueuePayload.devices[1],
          production_status: "READY_FOR_SHIPMENT",
        },
        initialQueuePayload.devices[2],
      ],
    };

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(readyMarked ? refreshedQueuePayload : initialQueuePayload),
        );
      }

      if (
        (url === "/api/devices/BULK-READY-001/status" ||
          url === "/api/devices/BULK-READY-002/status") &&
        method === "PATCH"
      ) {
        readyMarked = true;
        const serialNumber = url.includes("BULK-READY-001")
          ? "BULK-READY-001"
          : "BULK-READY-002";
        return Promise.resolve(
          createJsonResponse({
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
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("BULK-READY-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Zaznacz wszystkie urządzenia w kolejce wysyłki na stronie",
      }),
    );

    expect(screen.getByText("Zaznaczone: 3")).toBeInTheDocument();
    expect(screen.getByText("Gotowe do oznaczenia: 2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Oznacz gotowe (2)" }),
    );

    expect(
      await screen.findByText("Oznaczono jako gotowe do wysyłki 2 urządzeń."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/BULK-READY-001/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ production_status: "READY_FOR_SHIPMENT" }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/BULK-READY-002/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ production_status: "READY_FOR_SHIPMENT" }),
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/devices/BULK-BLOCK-001/status",
      expect.anything(),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Zaznacz BULK-READY-001",
        }),
      ).not.toBeChecked();
    });
  });

  it("marks selected ready shipment devices as shipped from bulk actions", async () => {
    let shipped = false;
    const initialQueuePayload: DeviceShipmentQueue = {
      ...shipmentPayload,
      total_devices: 3,
      ready_count: 2,
      blocked_count: 1,
      returned_count: 3,
      devices: [
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BULK-SHIP-001",
          can_transition_to_ready_for_shipment: false,
          production_status: "READY_FOR_SHIPMENT",
        },
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BULK-SHIP-002",
          can_transition_to_ready_for_shipment: false,
          production_status: "READY_FOR_SHIPMENT",
        },
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BULK-SHIP-BLOCK-001",
          can_transition_to_ready_for_shipment: false,
          production_status: "CREATED",
          recommended_action: "RUN_FINAL_TEST",
        },
      ],
    };
    const refreshedQueuePayload: DeviceShipmentQueue = {
      ...initialQueuePayload,
      ready_count: 0,
      blocked_count: 1,
      devices: [
        {
          ...initialQueuePayload.devices[0],
          production_status: "SHIPPED",
        },
        {
          ...initialQueuePayload.devices[1],
          production_status: "SHIPPED",
        },
        initialQueuePayload.devices[2],
      ],
    };

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(shipped ? refreshedQueuePayload : initialQueuePayload),
        );
      }

      if (
        (url === "/api/devices/BULK-SHIP-001/status" ||
          url === "/api/devices/BULK-SHIP-002/status") &&
        method === "PATCH"
      ) {
        shipped = true;
        const serialNumber = url.includes("BULK-SHIP-001")
          ? "BULK-SHIP-001"
          : "BULK-SHIP-002";
        return Promise.resolve(
          createJsonResponse({
            id: `DEV-${serialNumber}`,
            device_serial_number: serialNumber,
            device_type: "DEMO-OPS",
            variant_code: "DEFAULT",
            hardware_version: null,
            firmware_version: null,
            bootloader_version: null,
            created_by: null,
            production_status: "SHIPPED",
            created_at: "2026-05-01T08:00:00Z",
            updated_at: "2026-05-01T11:15:00Z",
          }),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("BULK-SHIP-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Zaznacz wszystkie urządzenia w kolejce wysyłki na stronie",
      }),
    );

    expect(screen.getByText("Gotowe do wysłania: 2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Oznacz wysłane (2)" }),
    );

    expect(
      await screen.findByText("Oznaczono jako wysłane 2 urządzeń."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/BULK-SHIP-001/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ production_status: "SHIPPED" }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/BULK-SHIP-002/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ production_status: "SHIPPED" }),
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/devices/BULK-SHIP-BLOCK-001/status",
      expect.anything(),
    );
  });

  it("closes selected shipment device critical NCRs from bulk actions", async () => {
    let ncrClosed = false;
    const initialQueuePayload: DeviceShipmentQueue = {
      ...shipmentPayload,
      total_devices: 3,
      ready_count: 0,
      blocked_count: 3,
      returned_count: 3,
      devices: [
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BULK-NCR-001",
          has_critical_open_ncr: true,
          critical_open_ncr_ids: ["NCR-DEVICE-BULK-001"],
          primary_blocking_code: "CRITICAL_OPEN_NCR",
          primary_blocking_message: "Urządzenie ma otwartą krytyczną NCR.",
          recommended_action: "RESOLVE_CRITICAL_NCR",
          can_transition_to_ready_for_shipment: false,
        },
        {
          ...shipmentPayload.devices[0],
          device_serial_number: "BULK-NCR-002",
          has_critical_open_ncr: true,
          critical_open_ncr_ids: ["NCR-DEVICE-BULK-002"],
          primary_blocking_code: "CRITICAL_OPEN_NCR",
          primary_blocking_message: "Urządzenie ma otwartą krytyczną NCR.",
          recommended_action: "RESOLVE_CRITICAL_NCR",
          can_transition_to_ready_for_shipment: false,
        },
        {
          ...shipmentPayload.devices[0],
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
    const refreshedQueuePayload: DeviceShipmentQueue = {
      ...initialQueuePayload,
      devices: [
        {
          ...initialQueuePayload.devices[0],
          has_critical_open_ncr: false,
          critical_open_ncr_ids: [],
          primary_blocking_code: null,
          primary_blocking_message: null,
          recommended_action: "MARK_READY_FOR_SHIPMENT",
          can_transition_to_ready_for_shipment: true,
        },
        {
          ...initialQueuePayload.devices[1],
          has_critical_open_ncr: false,
          critical_open_ncr_ids: [],
          primary_blocking_code: null,
          primary_blocking_message: null,
          recommended_action: "MARK_READY_FOR_SHIPMENT",
          can_transition_to_ready_for_shipment: true,
        },
        initialQueuePayload.devices[2],
      ],
    };

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(ncrClosed ? refreshedQueuePayload : initialQueuePayload),
        );
      }

      if (url === "/api/nonconformities/NCR-DEVICE-BULK-001" && method === "PATCH") {
        ncrClosed = true;
        return Promise.resolve(
          createJsonResponse({
            id: "NCR-ROW-BULK-001",
            ncr_id: "NCR-DEVICE-BULK-001",
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki wysyłki dla BULK-NCR-001.",
          }),
        );
      }

      if (url === "/api/nonconformities/NCR-DEVICE-BULK-002" && method === "PATCH") {
        ncrClosed = true;
        return Promise.resolve(
          createJsonResponse({
            id: "NCR-ROW-BULK-002",
            ncr_id: "NCR-DEVICE-BULK-002",
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki wysyłki dla BULK-NCR-002.",
          }),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("BULK-NCR-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Zaznacz wszystkie urządzenia w kolejce wysyłki na stronie",
      }),
    );

    expect(screen.getByText("Zaznaczone: 3")).toBeInTheDocument();
    expect(screen.getByText("Z krytycznym NCR: 2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Zamknij NCR urządzeń (2)" }),
    );

    expect(
      await screen.findByText("Zamknięto 2 krytyczne NCR urządzeń w 2 urządzeniach."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nonconformities/NCR-DEVICE-BULK-001",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki wysyłki dla BULK-NCR-001.",
          }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nonconformities/NCR-DEVICE-BULK-002",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki wysyłki dla BULK-NCR-002.",
          }),
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/nonconformities/BULK-NCR-BLOCK-001",
      expect.anything(),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Zaznacz BULK-NCR-001",
        }),
      ).not.toBeChecked();
    });
  });

  it("closes selected component critical NCRs from bulk actions", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");

    let ncrClosed = false;
    const initialQueuePayload: DeviceComponentQualityQueue = {
      ...componentPayload,
      total_devices: 3,
      devices_with_issues: 3,
      returned_count: 3,
      devices: [
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-NCR-001",
          primary_quality_status: "CRITICAL_NCR_OPEN",
          primary_blocking_component_type: "FAN_MODULE",
          primary_blocking_component_serial_number: "FAN-001",
          recommended_action: "RESOLVE_COMPONENT_QUALITY",
        },
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-NCR-002",
          primary_quality_status: "CRITICAL_NCR_OPEN",
          primary_blocking_component_type: "FAN_MODULE",
          primary_blocking_component_serial_number: "FAN-002",
          recommended_action: "RESOLVE_COMPONENT_QUALITY",
        },
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-QC-001",
          primary_quality_status: "QC_NOT_PASSED",
          primary_blocking_component_type: "CONTROL_PCB",
          primary_blocking_component_serial_number: "PCB-001",
          recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
        },
      ],
    };
    const refreshedQueuePayload: DeviceComponentQualityQueue = {
      ...initialQueuePayload,
      devices_with_issues: 1,
      devices: [
        {
          ...initialQueuePayload.devices[0],
          passes_component_quality_gate: true,
          primary_quality_status: "PASS",
          primary_blocking_component_type: null,
          primary_blocking_component_serial_number: null,
          recommended_action: "NONE",
          blocked_components: 0,
          passing_components: 2,
        },
        {
          ...initialQueuePayload.devices[1],
          passes_component_quality_gate: true,
          primary_quality_status: "PASS",
          primary_blocking_component_type: null,
          primary_blocking_component_serial_number: null,
          recommended_action: "NONE",
          blocked_components: 0,
          passing_components: 2,
        },
        initialQueuePayload.devices[2],
      ],
    };
    const componentDetailsPayloads: Record<string, DeviceComponentQuality> = {
      "COMP-NCR-001": {
        ...shipmentComponentDetailsPayload,
        device_serial_number: "COMP-NCR-001",
        primary_quality_status: "CRITICAL_NCR_OPEN",
        primary_blocking_component_serial_number: "FAN-001",
        recommended_action: "RESOLVE_COMPONENT_QUALITY",
        components: [
          {
            ...shipmentComponentDetailsPayload.components![0],
            component_serial_number: "CTRL-001",
            critical_open_ncr_ids: [],
            has_critical_open_ncr: false,
          },
          {
            ...shipmentComponentDetailsPayload.components![1],
            component_serial_number: "FAN-001",
            critical_open_ncr_ids: ["NCR-COMP-BULK-001"],
            has_critical_open_ncr: true,
          },
        ],
      },
      "COMP-NCR-002": {
        ...shipmentComponentDetailsPayload,
        device_serial_number: "COMP-NCR-002",
        primary_quality_status: "CRITICAL_NCR_OPEN",
        primary_blocking_component_serial_number: "FAN-002",
        recommended_action: "RESOLVE_COMPONENT_QUALITY",
        components: [
          {
            ...shipmentComponentDetailsPayload.components![0],
            component_serial_number: "CTRL-002",
            critical_open_ncr_ids: [],
            has_critical_open_ncr: false,
          },
          {
            ...shipmentComponentDetailsPayload.components![1],
            component_serial_number: "FAN-002",
            critical_open_ncr_ids: ["NCR-COMP-BULK-002"],
            has_critical_open_ncr: true,
          },
        ],
      },
    };

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url.startsWith("/api/component-quality")) {
        return Promise.resolve(
          createJsonResponse(ncrClosed ? refreshedQueuePayload : initialQueuePayload),
        );
      }

      if (url === "/api/devices/COMP-NCR-001/component-quality" && method === "GET") {
        return Promise.resolve(createJsonResponse(componentDetailsPayloads["COMP-NCR-001"]));
      }

      if (url === "/api/devices/COMP-NCR-002/component-quality" && method === "GET") {
        return Promise.resolve(createJsonResponse(componentDetailsPayloads["COMP-NCR-002"]));
      }

      if (url === "/api/nonconformities/NCR-COMP-BULK-001" && method === "PATCH") {
        ncrClosed = true;
        return Promise.resolve(
          createJsonResponse({
            id: "NCR-ROW-BULK-001",
            ncr_id: "NCR-COMP-BULK-001",
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki komponentów dla COMP-NCR-001.",
          }),
        );
      }

      if (url === "/api/nonconformities/NCR-COMP-BULK-002" && method === "PATCH") {
        ncrClosed = true;
        return Promise.resolve(
          createJsonResponse({
            id: "NCR-ROW-BULK-002",
            ncr_id: "NCR-COMP-BULK-002",
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki komponentów dla COMP-NCR-002.",
          }),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-NCR-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Zaznacz wszystkie urządzenia w kolejce komponentów na stronie",
      }),
    );

    expect(screen.getByText("Zaznaczone: 3")).toBeInTheDocument();
    expect(screen.getByText("Z krytycznym NCR: 2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Zamknij NCR komponentów (2)" }),
    );

    expect(
      await screen.findByText(
        "Zamknięto 2 krytyczne NCR komponentów w 2 urządzeniach.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nonconformities/NCR-COMP-BULK-001",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki komponentów dla COMP-NCR-001.",
          }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nonconformities/NCR-COMP-BULK-002",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "CLOSED",
            corrective_action:
              "Zamknięte zbiorczo z kolejki komponentów dla COMP-NCR-002.",
          }),
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/nonconformities/COMP-QC-001",
      expect.anything(),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Zaznacz COMP-NCR-001",
        }),
      ).not.toBeChecked();
    });
  });

  it("records bulk component QC PASS for selected devices", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");

    let componentQcRecorded = false;
    const createdRunIds: string[] = [];
    const completedRunIds: string[] = [];
    const initialQueuePayload: DeviceComponentQualityQueue = {
      ...componentPayload,
      total_devices: 3,
      devices_with_issues: 3,
      returned_count: 3,
      devices: [
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-QC-001",
          primary_quality_status: "QC_NOT_PASSED",
          primary_blocking_component_type: "FAN_MODULE",
          primary_blocking_component_serial_number: "FAN-001",
          recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
        },
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-QC-002",
          primary_quality_status: "QC_NOT_PASSED",
          primary_blocking_component_type: "FAN_MODULE",
          primary_blocking_component_serial_number: "FAN-002",
          recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
        },
        {
          ...componentPayload.devices[0],
          device_serial_number: "COMP-NCR-001",
          primary_quality_status: "CRITICAL_NCR_OPEN",
          primary_blocking_component_type: "FAN_MODULE",
          primary_blocking_component_serial_number: "FAN-900",
          recommended_action: "RESOLVE_COMPONENT_QUALITY",
        },
      ],
    };
    const refreshedQueuePayload: DeviceComponentQualityQueue = {
      ...initialQueuePayload,
      devices_with_issues: 1,
      devices: [
        {
          ...initialQueuePayload.devices[0],
          passes_component_quality_gate: true,
          primary_quality_status: "PASS",
          primary_blocking_component_type: null,
          primary_blocking_component_serial_number: null,
          recommended_action: "NO_ACTION",
          blocked_components: 0,
          passing_components: 2,
        },
        {
          ...initialQueuePayload.devices[1],
          passes_component_quality_gate: true,
          primary_quality_status: "PASS",
          primary_blocking_component_type: null,
          primary_blocking_component_serial_number: null,
          recommended_action: "NO_ACTION",
          blocked_components: 0,
          passing_components: 2,
        },
        initialQueuePayload.devices[2],
      ],
    };
    const componentDetailsPayloads: Record<string, DeviceComponentQuality> = {
      "COMP-QC-001": {
        ...shipmentComponentDetailsPayload,
        device_serial_number: "COMP-QC-001",
        primary_quality_status: "QC_NOT_PASSED",
        primary_blocking_component_serial_number: "FAN-001",
        recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
        components: [
          {
            ...shipmentComponentDetailsPayload.components![0],
            component_serial_number: "CTRL-001",
            critical_open_ncr_ids: [],
            has_critical_open_ncr: false,
          },
          {
            ...shipmentComponentDetailsPayload.components![1],
            component_serial_number: "FAN-001",
            child_barcode_value: "BC-FAN-001",
            critical_open_ncr_ids: [],
            has_critical_open_ncr: false,
          },
        ],
      },
      "COMP-QC-002": {
        ...shipmentComponentDetailsPayload,
        device_serial_number: "COMP-QC-002",
        primary_quality_status: "QC_NOT_PASSED",
        primary_blocking_component_serial_number: "FAN-002",
        recommended_action: "RUN_COMPONENT_QC_OR_REWORK",
        components: [
          {
            ...shipmentComponentDetailsPayload.components![0],
            component_serial_number: "CTRL-002",
            critical_open_ncr_ids: [],
            has_critical_open_ncr: false,
          },
          {
            ...shipmentComponentDetailsPayload.components![1],
            component_serial_number: "FAN-002",
            child_barcode_value: "BC-FAN-002",
            critical_open_ncr_ids: [],
            has_critical_open_ncr: false,
          },
        ],
      },
    };

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url.startsWith("/api/component-quality")) {
        return Promise.resolve(
          createJsonResponse(
            componentQcRecorded ? refreshedQueuePayload : initialQueuePayload,
          ),
        );
      }

      if (url === "/api/work-sessions") {
        return Promise.resolve(createJsonResponse(workSessionsPayload));
      }

      if (url === "/api/operators") {
        return Promise.resolve(createJsonResponse(operatorsPayload));
      }

      if (url === "/api/devices/COMP-QC-001/component-quality" && method === "GET") {
        return Promise.resolve(createJsonResponse(componentDetailsPayloads["COMP-QC-001"]));
      }

      if (url === "/api/devices/COMP-QC-002/component-quality" && method === "GET") {
        return Promise.resolve(createJsonResponse(componentDetailsPayloads["COMP-QC-002"]));
      }

      if (url === "/api/qc-runs" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as {
          run_id: string;
          device_serial_number: string;
          item_serial_number: string;
          barcode_value: string;
          process_stage: string;
          work_session_id: string;
        };
        createdRunIds.push(body.run_id);

        expect(body.work_session_id).toBe("WS-QA-001");
        expect(body.process_stage).toBe("COMPONENT_QC");
        expect(
          ["COMP-QC-001", "COMP-QC-002"].includes(body.device_serial_number),
        ).toBe(true);
        expect(["FAN-001", "FAN-002"].includes(body.item_serial_number)).toBe(true);
        expect(["BC-FAN-001", "BC-FAN-002"].includes(body.barcode_value)).toBe(true);

        return Promise.resolve(
          createJsonResponse({
            id: `QC-ROW-${body.item_serial_number}`,
            run_id: body.run_id,
            device_serial_number: body.device_serial_number,
            item_serial_number: body.item_serial_number,
            barcode_value: body.barcode_value,
            checklist_id: null,
            process_stage: "COMPONENT_QC",
            operator_id: "OP-QA-001",
            work_session_id: "WS-QA-001",
            status: "IN_PROGRESS",
            result: null,
            started_at: "2026-05-01T09:20:00Z",
            ended_at: null,
          }),
        );
      }

      const completeMatch = url.match(/^\/api\/qc-runs\/([^/]+)\/complete$/);
      if (completeMatch && method === "POST") {
        componentQcRecorded = true;
        completedRunIds.push(completeMatch[1]);
        expect(init?.body).toBe("result=PASS");

        return Promise.resolve(
          createJsonResponse({
            id: `QC-ROW-${completeMatch[1]}`,
            run_id: completeMatch[1],
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
          }),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-QC-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Zaznacz wszystkie urządzenia w kolejce komponentów na stronie",
      }),
    );

    expect(screen.getByText("Zaznaczone: 3")).toBeInTheDocument();
    expect(screen.getByText("Gotowe do QC PASS: 2")).toBeInTheDocument();

    const qualitySessionSelect = await screen.findByLabelText(
      "Sesja QC dla akcji zbiorczej",
    );
    await waitFor(() => expect(qualitySessionSelect).toHaveValue("WS-QA-001"));

    fireEvent.click(
      screen.getByRole("button", { name: "Zapisz QC PASS (2)" }),
    );

    expect(
      await screen.findByText("Zapisano zbiorczy komponentowy QC PASS dla 2 urządzeń."),
    ).toBeInTheDocument();
    expect(createdRunIds).toHaveLength(2);
    expect(completedRunIds).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/devices/COMP-NCR-001/component-quality",
      expect.anything(),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Zaznacz COMP-QC-001",
        }),
      ).not.toBeChecked();
    });
  });

  it("copies current device page link with the active hash section", async () => {
    window.history.replaceState(
      {},
      "",
      "/devices/COMP-001?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT#bom",
    );

    const writeTextMock = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "COMP-001" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#bom");

    fireEvent.click(
      screen.getByRole("button", { name: "Kopiuj link urządzenia" }),
    );

    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(window.location.href),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Link skopiowany.");
  });

  it("shows filtered queue shortcuts on the full device page", async () => {
    window.history.replaceState(
      {},
      "",
      "/devices/COMP-001?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "COMP-001" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: /Pokaż podobne blokady w kolejce wysyłki/,
      }),
    ).toHaveAttribute(
      "href",
      "/?view=shipment&ship_sort_by=created_at&ship_sort_desc=true&ship_limit=100&ship_offset=0&ship_only_blocked=true&ship_only_ready=false&ship_device_type=DEMO-OPS&ship_primary_blocking_code=COMPONENT_QC_NOT_PASSED&comp_sort_by=blocked_components&comp_sort_desc=true&comp_limit=100&comp_offset=0&comp_only_blocking=true&comp_device_type=DEMO-OPS&svc_sort_by=uploaded_at&svc_sort_desc=true&svc_limit=100&svc_offset=0",
    );
    expect(
      screen.getByRole("link", {
        name: /Pokaż podobne blokady w kolejce komponentów/,
      }),
    ).toHaveAttribute(
      "href",
      "/?view=components&ship_sort_by=created_at&ship_sort_desc=true&ship_limit=100&ship_offset=0&ship_only_blocked=false&ship_only_ready=false&comp_sort_by=blocked_components&comp_sort_desc=true&comp_limit=100&comp_offset=0&comp_only_blocking=true&comp_device_type=DEMO-OPS&comp_blocking_component_type=FAN_MODULE&svc_sort_by=uploaded_at&svc_sort_desc=true&svc_limit=100&svc_offset=0",
    );
    expect(
      screen.getByRole("link", {
        name: /Pokaż tę samą akcję w kolejce komponentów/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("comp_recommended_action=RUN_COMPONENT_QC_OR_REWORK"),
    );
    expect(
      screen.getByRole("link", {
        name: /Pokaż tę samą akcję w kolejce komponentów/,
      }),
    ).not.toHaveAttribute("href", expect.stringContaining("device_serial="));
  });

  it("shows BOM-specific shipment queue shortcuts on the full device page", async () => {
    window.history.replaceState(
      {},
      "",
      "/devices/ASM-001?view=shipment&ship_device_type=DEMO-OPS&ship_sort_by=created_at&ship_sort_desc=true&ship_limit=100&ship_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT#bom",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(shipmentAssemblyQueuePayload));
      }

      if (url === "/api/devices/ASM-001/shipment-readiness") {
        return Promise.resolve(createJsonResponse(shipmentAssemblyDetailsPayload));
      }

      if (url === "/api/devices/ASM-001/component-quality") {
        return Promise.resolve(createJsonResponse(componentAssemblyDetailsPayload));
      }

      if (url === "/api/devices/ASM-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "ASM-001" }),
    ).toBeInTheDocument();

    const bomShortcut = screen.getByRole("link", {
      name: /Pokaż braki BOM dla/i,
    });
    expect(bomShortcut).toHaveAttribute(
      "href",
      expect.stringContaining(
        "ship_primary_blocking_code=BOM_REQUIRED_COMPONENTS_MISSING",
      ),
    );
    expect(bomShortcut).toHaveAttribute(
      "href",
      expect.stringContaining("ship_missing_component_type=FAN_MODULE"),
    );
    expect(bomShortcut).not.toHaveAttribute(
      "href",
      expect.stringContaining("device_serial="),
    );
  });

  it("shows shipment gate history queue shortcuts on the full device page", async () => {
    window.history.replaceState(
      {},
      "",
      "/devices/COMP-001?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT#historia-gate",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse(shipmentGateHistoryPayload));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "COMP-001" }),
    ).toBeInTheDocument();

    const resultLinks = screen.getAllByRole("link", {
      name: /Pokaż urządzenia z tym samym wynikiem gate/,
    });
    expect(resultLinks).toHaveLength(2);
    expect(resultLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("ship_latest_gate_result=BLOCKED"),
    );
    expect(resultLinks[1]).toHaveAttribute(
      "href",
      expect.stringContaining("ship_latest_gate_result=PASS"),
    );

    const requestedStatusLinks = screen.getAllByRole("link", {
      name: /Pokaż urządzenia z tym samym żądanym statusem/,
    });
    expect(requestedStatusLinks).toHaveLength(2);
    expect(requestedStatusLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("ship_production_status=READY_FOR_SHIPMENT"),
    );
    expect(requestedStatusLinks[0]).not.toHaveAttribute(
      "href",
      expect.stringContaining("device_serial="),
    );
  });

  it("highlights active section for direct device page hash links", async () => {
    window.history.replaceState(
      {},
      "",
      "/devices/COMP-001?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT#bom",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "COMP-001" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#bom");
    expect(screen.getByRole("link", { name: "BOM" })).toHaveClass("is-active");
    expect(
      screen.getByRole("link", { name: "Historia gate" }),
    ).toHaveAttribute("href", "#historia-gate");
  });

  it("highlights blocking component deep link on full device page", async () => {
    window.history.replaceState(
      {},
      "",
      "/devices/COMP-001?view=components&comp_device_type=DEMO-OPS&comp_sort_by=blocked_components&comp_sort_desc=true&comp_only_blocking=true&comp_limit=100&comp_offset=0&device_type=DEMO-OPS&device_variant=DEFAULT#komponent-fan-001",
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "COMP-001" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#komponent-fan-001");
    expect(
      screen.getByRole("link", { name: "Jakość komponentów" }),
    ).toHaveClass("is-active");
    expect(
      screen.getByRole("link", { name: "Przejdź do blokującego komponentu" }),
    ).toHaveAttribute("href", "#komponent-fan-001");
  });

  it("shows full page link in the details drawer", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (
        url ===
        "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (
        url ===
        "/api/component-quality?device_type=DEMO-OPS&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100"
      ) {
        return Promise.resolve(createJsonResponse(componentPayload));
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(componentActionShipmentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(componentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "COMP-001" }));

    const pageLink = await screen.findByRole("link", { name: "Pełna strona" });
    expect(pageLink).toHaveAttribute("href", "/devices/COMP-001?view=components&ship_sort_by=created_at&ship_sort_desc=true&ship_limit=100&ship_offset=0&ship_only_blocked=false&ship_only_ready=false&comp_sort_by=blocked_components&comp_sort_desc=true&comp_limit=100&comp_offset=0&comp_only_blocking=true&comp_device_type=DEMO-OPS&svc_sort_by=uploaded_at&svc_sort_desc=true&svc_limit=100&svc_offset=0&device_serial=COMP-001&device_type=DEMO-OPS&device_variant=DEFAULT");
  });

  it("marks device as ready for shipment from the details drawer", async () => {
    let readyMarked = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(readyMarked ? shipmentReadyQueuePayload : shipmentPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(
            readyMarked ? shipmentDetailsReadyPayload : shipmentActionDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(shipmentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(
          createJsonResponse(
            readyMarked ? shipmentGateHistoryReadyPayload : shipmentGateHistoryPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/status" && method === "PATCH") {
        readyMarked = true;
        return Promise.resolve(
          createJsonResponse({
            id: "DEV-001",
            device_serial_number: "SHIP-001",
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
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));
    const actionButton = await screen.findByRole("button", {
      name: "Oznacz gotowe do wysyłki",
    });
    fireEvent.click(actionButton);

    expect(
      await screen.findByText("Urządzenie oznaczone jako gotowe do wysyłki."),
    ).toBeInTheDocument();
    await waitFor(() => {
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
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Oznacz gotowe do wysyłki" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows action error in the details drawer when mark-ready is rejected", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(createJsonResponse(shipmentActionDetailsPayload));
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(shipmentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse(shipmentGateHistoryPayload));
      }

      if (url === "/api/devices/SHIP-001/status" && method === "PATCH") {
        return Promise.resolve(
          createJsonResponse(
            { detail: "Open critical NCR blocks shipment" },
            { status: 400, statusText: "Bad Request" },
          ),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Oznacz gotowe do wysyłki" }),
    );

    expect(
      await screen.findByText(/Open critical NCR blocks shipment/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Oznacz gotowe do wysyłki" }),
    ).toBeEnabled();
  });

  it("marks ready device as shipped from the details drawer", async () => {
    let shipped = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(shipped ? shipmentShippedQueuePayload : shipmentReadyQueuePayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(
            shipped ? shipmentDetailsShippedPayload : shipmentDetailsReadyPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(shipmentActionComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(
          createJsonResponse(
            shipped ? shipmentGateHistoryShippedPayload : shipmentGateHistoryReadyPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/status" && method === "PATCH") {
        shipped = true;
        return Promise.resolve(
          createJsonResponse({
            id: "DEV-001",
            device_serial_number: "SHIP-001",
            device_type: "DEMO-OPS",
            variant_code: "DEFAULT",
            hardware_version: null,
            firmware_version: null,
            bootloader_version: null,
            created_by: null,
            production_status: "SHIPPED",
            created_at: "2026-05-01T08:00:00Z",
            updated_at: "2026-05-01T11:00:00Z",
          }),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Oznacz jako wysłane" }),
    );

    expect(
      await screen.findByText("Urządzenie oznaczone jako wysłane."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/SHIP-001/status",
        expect.objectContaining({
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ production_status: "SHIPPED" }),
        }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices/SHIP-001/shipment-readiness",
        expect.anything(),
      );
    });
    expect(
      screen.queryByRole("button", { name: "Oznacz jako wysłane" }),
    ).not.toBeInTheDocument();
  });

  it("records final test PASS from the details drawer with an active work session", async () => {
    let finalTestRecorded = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(
            finalTestRecorded
              ? shipmentAfterFinalTestPassQueuePayload
              : shipmentFinalTestQueuePayload,
          ),
        );
      }

      if (url === "/api/devices/TEST-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(
            finalTestRecorded
              ? shipmentAfterFinalTestPassDetailsPayload
              : shipmentFinalTestDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/TEST-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(shipmentFinalTestComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/TEST-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      if (url === "/api/work-sessions") {
        return Promise.resolve(createJsonResponse(workSessionsPayload));
      }

      if (url === "/api/operators") {
        return Promise.resolve(createJsonResponse(operatorsPayload));
      }

      if (url === "/api/final-tests" && method === "POST") {
        finalTestRecorded = true;
        const body = JSON.parse(String(init?.body)) as {
          test_run_id: string;
          device_serial_number: string;
          result: string;
          work_session_id: string;
        };

        expect(body.device_serial_number).toBe("TEST-001");
        expect(body.result).toBe("PASS");
        expect(body.work_session_id).toBe("WS-FT-001");
        expect(body.test_run_id).toMatch(/^FT-WEB-TEST-001-/);

        return Promise.resolve(
          createJsonResponse({
            id: "FT-ROW-001",
            test_run_id: body.test_run_id,
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
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "TEST-001" }));

    const finalTestSessionSelect = await screen.findByLabelText(
      "Sesja final test",
    );
    await waitFor(() =>
      expect(finalTestSessionSelect).toHaveValue("WS-FT-001"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Zapisz final test PASS" }),
    );

    expect(
      await screen.findByText("Zapisano final test PASS."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Zapisz final test PASS" }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/final-tests",
        expect.objectContaining({
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }),
      );
    });
  });

  it("completes assembly from the details drawer with an active production session", async () => {
    let assemblyCompleted = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(
          createJsonResponse(
            assemblyCompleted
              ? shipmentAssemblyAfterQueuePayload
              : shipmentAssemblyQueuePayload,
          ),
        );
      }

      if (url === "/api/devices/ASM-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(
            assemblyCompleted
              ? shipmentAssemblyAfterDetailsPayload
              : shipmentAssemblyDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/ASM-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(
            assemblyCompleted
              ? componentAssemblyAfterDetailsPayload
              : componentAssemblyDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/ASM-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      if (url === "/api/work-sessions") {
        return Promise.resolve(createJsonResponse(workSessionsPayload));
      }

      if (url === "/api/operators") {
        return Promise.resolve(createJsonResponse(operatorsPayload));
      }

      if (
        url === "/api/devices/ASM-001/assembly/scan-component" &&
        method === "POST"
      ) {
        assemblyCompleted = true;
        const body = JSON.parse(String(init?.body)) as {
          child_barcode_value: string;
          component_type: string;
          installed_by: string;
          workstation_id: string;
          work_session_id: string;
        };

        expect(body.child_barcode_value).toBe("BC-FAN-777");
        expect(body.component_type).toBe("FAN_MODULE_V2");
        expect(body.installed_by).toBe("OP-PROD-001");
        expect(body.workstation_id).toBe("PR-ST-01");
        expect(body.work_session_id).toBe("WS-PROD-001");

        return Promise.resolve(
          createJsonResponse({
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
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "ASM-001" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Sesja montażu")).toHaveValue(
        "WS-PROD-001",
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Typ komponentu")).toHaveValue(
        "FAN_MODULE",
      ),
    );

    fireEvent.change(screen.getByLabelText("Typ komponentu"), {
      target: { value: "FAN_MODULE_V2" },
    });
    fireEvent.change(screen.getByLabelText("Barcode komponentu"), {
      target: { value: "BC-FAN-777" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Zamontuj komponent" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Zamontuj komponent" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("records component QC PASS from the details drawer with an active quality session", async () => {
    let componentQcRecorded = false;
    let qcRunId = "";
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (
        url.startsWith("/api/component-quality?only_blocking=true")
      ) {
        return Promise.resolve(
          createJsonResponse(
            componentQcRecorded
              ? componentActionAfterPassQueuePayload
              : componentPayload,
          ),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(
            componentQcRecorded
              ? componentActionAfterPassShipmentDetailsPayload
              : componentActionShipmentDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/COMP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(
            componentQcRecorded
              ? componentActionAfterPassComponentDetailsPayload
              : componentActionComponentDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/COMP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse([]));
      }

      if (url === "/api/work-sessions") {
        return Promise.resolve(createJsonResponse(workSessionsPayload));
      }

      if (url === "/api/operators") {
        return Promise.resolve(createJsonResponse(operatorsPayload));
      }

      if (url === "/api/qc-runs" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as {
          run_id: string;
          device_serial_number: string;
          item_serial_number: string;
          barcode_value: string;
          process_stage: string;
          work_session_id: string;
        };
        qcRunId = body.run_id;

        expect(body.device_serial_number).toBe("COMP-001");
        expect(body.item_serial_number).toBe("FAN-001");
        expect(body.barcode_value).toBe("BC-FAN-001");
        expect(body.process_stage).toBe("COMPONENT_QC");
        expect(body.work_session_id).toBe("WS-QA-001");
        expect(body.run_id).toMatch(/^QC-WEB-FAN-001-/);

        return Promise.resolve(
          createJsonResponse({
            id: "QC-ROW-001",
            run_id: body.run_id,
            device_serial_number: "COMP-001",
            item_serial_number: "FAN-001",
            barcode_value: "BC-FAN-001",
            checklist_id: null,
            process_stage: "COMPONENT_QC",
            operator_id: "OP-QA-001",
            work_session_id: "WS-QA-001",
            status: "IN_PROGRESS",
            result: null,
            started_at: "2026-05-01T09:20:00Z",
            ended_at: null,
          }),
        );
      }

      if (
        qcRunId &&
        url === `/api/qc-runs/${qcRunId}/complete` &&
        method === "POST"
      ) {
        componentQcRecorded = true;
        expect(init?.body).toBe("result=PASS");

        return Promise.resolve(
          createJsonResponse({
            id: "QC-ROW-001",
            run_id: qcRunId,
            device_serial_number: "COMP-001",
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
          }),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "COMP-001" }));

    const qualitySessionSelect = await screen.findByLabelText(
      "Sesja QC komponentów",
    );
    await waitFor(() =>
      expect(qualitySessionSelect).toHaveValue("WS-QA-001"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Zapisz komponentowy QC PASS" }),
    );

    expect(
      await screen.findByText("Zapisano komponentowy QC PASS."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Zapisz komponentowy QC PASS" }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/qc-runs",
        expect.objectContaining({
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/qc-runs\/QC-WEB-FAN-001-.*\/complete$/),
        expect.objectContaining({
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: "result=PASS",
        }),
      );
    });
  });

  it("closes device critical NCRs from the details drawer", async () => {
    let deviceNcrClosed = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(
          createJsonResponse(
            deviceNcrClosed
              ? shipmentDetailsWithoutDeviceNcrPayload
              : shipmentDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(shipmentComponentDetailsPayload),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse(shipmentGateHistoryPayload));
      }

      if (url === "/api/nonconformities/NCR-DEVICE-001" && method === "PATCH") {
        deviceNcrClosed = true;
        return Promise.resolve(
          createJsonResponse({
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
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Zamknij krytyczne NCR urządzenia",
      }),
    );

    expect(
      await screen.findByText("Zamknięto 1 krytyczne NCR urządzenia."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nonconformities/NCR-DEVICE-001",
        expect.objectContaining({
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "CLOSED",
            corrective_action:
              "Zamknięte z panelu operacyjnego dla SHIP-001.",
          }),
        }),
      );
    });
    expect(
      screen.queryByRole("button", {
        name: "Zamknij krytyczne NCR urządzenia",
      }),
    ).not.toBeInTheDocument();
  });

  it("closes component critical NCRs from the details drawer", async () => {
    let componentNcrClosed = false;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/shipment-readiness")) {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url === "/api/devices/SHIP-001/shipment-readiness") {
        return Promise.resolve(createJsonResponse(shipmentActionDetailsPayload));
      }

      if (url === "/api/devices/SHIP-001/component-quality") {
        return Promise.resolve(
          createJsonResponse(
            componentNcrClosed
              ? shipmentComponentDetailsWithoutNcrPayload
              : shipmentComponentDetailsPayload,
          ),
        );
      }

      if (url === "/api/devices/SHIP-001/shipment-gate-history?limit=10") {
        return Promise.resolve(createJsonResponse(shipmentGateHistoryPayload));
      }

      if (url === "/api/nonconformities/NCR-COMP-001" && method === "PATCH") {
        componentNcrClosed = true;
        return Promise.resolve(
          createJsonResponse({
            id: "NCR-ROW-002",
            ncr_id: "NCR-COMP-001",
            device_serial_number: "SHIP-001",
            component_serial_number: "FAN-900",
            process_stage: "COMPONENT_QC",
            description: "Otwarte NCR komponentu",
            severity: "CRITICAL",
            detected_by: "OP-20",
            corrective_action: "Zamknięte z panelu operacyjnego dla SHIP-001.",
            status: "CLOSED",
            detected_at: "2026-05-01T09:12:00Z",
            closed_at: "2026-05-01T09:46:00Z",
          }),
        );
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "SHIP-001" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Zamknij krytyczne NCR komponentów",
      }),
    );

    expect(
      await screen.findByText("Zamknięto 1 krytyczne NCR komponentów."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nonconformities/NCR-COMP-001",
        expect.objectContaining({
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "CLOSED",
            corrective_action:
              "Zamknięte z panelu operacyjnego dla SHIP-001.",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Zamknij krytyczne NCR komponentów",
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("loads last active view from localStorage and persists tab changes", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Komponenty" })).toHaveClass("is-active");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Wysyłka" }));

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("shipment");
  });

  it("shows API error banner when request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createErrorResponse(503, "Service Unavailable", "backend temporarily down"),
      ),
    );

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/API .* problem/i);
    expect(alert).toHaveTextContent(
      "API 503 Service Unavailable: backend temporarily down",
    );
  });

  it("clears stale shipment data when api base becomes empty", async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("/api"), {
      target: { value: "" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Podaj bazowy adres API.");
    expect(screen.queryByText("SHIP-001")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores stale shipment success after a newer response wins", async () => {
    const firstResponse = createDeferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(createJsonResponse(freshShipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("np. ZSS-VENT"), {
      target: { value: "DEMO-OPS" },
    });

    expect(await screen.findByText("SHIP-NEW")).toBeInTheDocument();
    expect(screen.queryByText("SHIP-OLD")).not.toBeInTheDocument();

    await act(async () => {
      firstResponse.resolveResponse(createJsonResponse(staleShipmentPayload));
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-NEW")).toBeInTheDocument();
    expect(screen.queryByText("SHIP-OLD")).not.toBeInTheDocument();
  });

  it("ignores stale shipment error after a newer response wins", async () => {
    const firstResponse = createDeferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(createJsonResponse(freshShipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("np. ZSS-VENT"), {
      target: { value: "DEMO-OPS" },
    });

    expect(await screen.findByText("SHIP-NEW")).toBeInTheDocument();

    await act(async () => {
      firstResponse.resolveResponse(
        createErrorResponse(503, "Service Unavailable", "stale shipment failure"),
      );
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-NEW")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("debounces shipment text filters before sending request", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });

    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("DEMO-OPS");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.queryByText("Oczekuje na zastosowanie")).not.toBeInTheDocument();
  });

  it("flushes pending shipment text filters when a non-text filter changes", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_blocked=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("flushes pending shipment text filters before manual refresh", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const apiControls = screen.getByRole("region", { name: /API/i });
    fireEvent.click(within(apiControls).getByRole("button", { name: "Odśwież" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("auto-refreshes the active queue when enabled", async () => {
    vi.useFakeTimers();
    localStorage.setItem(AUTO_REFRESH_ENABLED_STORAGE_KEY, "true");
    localStorage.setItem(AUTO_REFRESH_INTERVAL_STORAGE_KEY, "5000");

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByRole("checkbox", { name: /Auto-od/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: /Interwa/i }),
    ).toHaveValue("5000");
    expect(screen.getByText(/Ostatnia aktualizacja:/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("flushes pending shipment text filters on Enter", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const deviceTypeInput = screen.getByLabelText("Typ urządzenia");
    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(deviceTypeInput, {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    fireEvent.keyDown(deviceTypeInput, { key: "Enter", code: "Enter" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.queryByText("Oczekuje na zastosowanie")).not.toBeInTheDocument();
  });

  it("flushes pending component text filters on Enter", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValue(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("COMP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const blockingComponentInput = screen.getByLabelText("Typ blokującego komponentu");
    fireEvent.change(blockingComponentInput, {
      target: { value: "FAN_MODULE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Oczekuje na zastosowanie")).toBeInTheDocument();

    fireEvent.keyDown(blockingComponentInput, { key: "Enter", code: "Enter" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?blocking_component_type=FAN_MODULE&only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.queryByText("Oczekuje na zastosowanie")).not.toBeInTheDocument();
  });

  it("does not refetch component view when hidden shipment debounce settles", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValue(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText("np. ZSS-VENT"), {
      target: { value: "DEMO-OPS" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("COMP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not refetch shipment view when hidden component debounce settles", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("COMP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByPlaceholderText("np. CONTROL_PCB"), {
      target: { value: "FAN_MODULE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /Wysy/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("applies shipment filters and keeps blocked and ready toggles exclusive", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "  DEMO-OPS  " },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_blocked=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByLabelText("Tylko gotowe"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_ready=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    expect(screen.getByLabelText("Tylko zablokowane")).not.toBeChecked();
    expect(screen.getByLabelText("Tylko gotowe")).toBeChecked();
  });

  it("clears incompatible shipment filters when only ready is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Główna blokada"), {
      target: { value: "FINAL_TEST_NOT_PASSED" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Akcja"), {
      target: { value: "COMPLETE_ASSEMBLY" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByLabelText("Tylko gotowe"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?only_ready=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    expect(screen.getByLabelText("Główna blokada")).toHaveValue("");
    expect(screen.getByLabelText("Akcja")).toHaveValue("");
    expect(screen.getByLabelText("Tylko gotowe")).toBeChecked();
    expect(screen.getByLabelText("Tylko zablokowane")).not.toBeChecked();
  });

  it("disables incompatible shipment filter controls when only ready is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Tylko gotowe"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText("Główna blokada")).toBeDisabled();

    const actionSelect = screen.getByLabelText("Akcja") as HTMLSelectElement;
    const readyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "MARK_READY_FOR_SHIPMENT",
    );
    const assemblyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "COMPLETE_ASSEMBLY",
    );

    if (!readyOption || !assemblyOption) {
      throw new Error("Expected shipment action options to exist.");
    }

    expect(readyOption.disabled).toBe(false);
    expect(assemblyOption.disabled).toBe(true);
  });

  it("disables ready-for-shipment action when only blocked is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const actionSelect = screen.getByLabelText("Akcja") as HTMLSelectElement;
    const readyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "MARK_READY_FOR_SHIPMENT",
    );
    const assemblyOption = Array.from(actionSelect.options).find(
      (option) => option.value === "COMPLETE_ASSEMBLY",
    );

    if (!readyOption || !assemblyOption) {
      throw new Error("Expected shipment action options to exist.");
    }

    expect(readyOption.disabled).toBe(true);
    expect(assemblyOption.disabled).toBe(false);
  });

  it("renders empty state for component queue when API returns no devices", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(emptyComponentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));

    expect(
      await screen.findByText("Brak urządzeń w kolejce jakości komponentów."),
    ).toBeInTheDocument();
    const emptyState = screen
      .getByText("Brak urządzeń w kolejce jakości komponentów.")
      .closest("section");
    expect(emptyState).not.toBeNull();
    expect(
      within(emptyState as HTMLElement).getByText(
        "Jeśli backend działa, zawęź lub wyczyść filtry i odśwież kolejkę.",
      ),
    ).toBeInTheDocument();
  });

  it("loads API base from localStorage and persists manual changes", async () => {
    localStorage.setItem(API_STORAGE_KEY, "http://localhost:9100/api");

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const apiBaseInput = screen.getByDisplayValue("http://localhost:9100/api");
    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9100/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.change(apiBaseInput, {
      target: { value: "http://localhost:9200/api" },
    });

    await waitFor(() =>
      expect(localStorage.getItem(API_STORAGE_KEY)).toBe("http://localhost:9200/api"),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:9200/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("clears saved dashboard state back to defaults", async () => {
    localStorage.setItem(API_STORAGE_KEY, "http://localhost:9100/api");
    localStorage.setItem(VIEW_STORAGE_KEY, "components");
    localStorage.setItem(AUTO_REFRESH_ENABLED_STORAGE_KEY, "true");
    localStorage.setItem(AUTO_REFRESH_INTERVAL_STORAGE_KEY, "60000");
    localStorage.setItem(
      COMPONENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        only_blocking: false,
        limit: 25,
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://localhost:9100/api")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Auto-od/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: /Interwa/i }),
    ).toHaveValue(
      "60000",
    );

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść zapisany stan" }));

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wysyłka" })).toHaveClass("is-active");
    expect(screen.getByDisplayValue("/api")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Auto-od/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("combobox", { name: /Interwa/i }),
    ).toHaveValue(
      "30000",
    );
    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("");
    expect(screen.getByLabelText("Limit")).toHaveValue(100);

    await waitFor(() =>
      expect(localStorage.getItem(API_STORAGE_KEY)).toBe("/api"),
    );
    await waitFor(() =>
      expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("shipment"),
    );
    await waitFor(() =>
      expect(localStorage.getItem(AUTO_REFRESH_ENABLED_STORAGE_KEY)).toBe(
        "false",
      ),
    );
    await waitFor(() =>
      expect(localStorage.getItem(AUTO_REFRESH_INTERVAL_STORAGE_KEY)).toBe(
        "30000",
      ),
    );
    await waitFor(() =>
      expect(localStorage.getItem(COMPONENT_FILTERS_STORAGE_KEY)).toBe(
        JSON.stringify({
          device_type: "",
          variant_code: "",
          production_status: "",
          blocking_component_type: "",
          primary_quality_status: "",
          stale_bucket: "",
          recommended_action: "",
          passes_component_quality_gate: "",
          only_blocking: true,
          sort_by: "blocked_components",
          sort_desc: true,
          limit: 100,
          offset: 0,
        }),
      ),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("loads shipment filters from localStorage and persists reset state", async () => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        only_blocked: true,
        sort_desc: false,
        limit: 25,
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_blocked=true&sort_by=created_at&sort_desc=false&limit=25",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść" }));

    await waitFor(() =>
      expect(localStorage.getItem(SHIPMENT_FILTERS_STORAGE_KEY)).toBe(
        JSON.stringify({
          device_type: "",
          variant_code: "",
          production_status: "",
          primary_blocking_code: "",
          missing_component_type: "",
          recommended_action: "",
          latest_gate_result: "",
          only_blocked: false,
          only_ready: false,
          sort_by: "created_at",
          sort_desc: true,
          limit: 100,
          offset: 0,
        }),
      ),
    );
  });

  it("falls back for unsupported shipment filter options restored from localStorage", async () => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        production_status: "BROKEN",
        primary_blocking_code: "UNKNOWN_BLOCKER",
        recommended_action: "UNSUPPORTED_ACTION",
        latest_gate_result: "INVALID_GATE",
        sort_by: "unknown_field",
        sort_desc: false,
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=false&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("sanitizes incompatible shipment filters restored from localStorage", async () => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
        JSON.stringify({
          device_type: "DEMO-OPS",
          only_blocked: true,
          only_ready: true,
          primary_blocking_code: "FINAL_TEST_NOT_PASSED",
          missing_component_type: "CONTROL_PCB",
          recommended_action: "COMPLETE_ASSEMBLY",
        }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&only_ready=true&sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    await waitFor(() =>
      expect(localStorage.getItem(SHIPMENT_FILTERS_STORAGE_KEY)).toBe(
        JSON.stringify({
          device_type: "DEMO-OPS",
          variant_code: "",
          production_status: "",
          primary_blocking_code: "",
          missing_component_type: "",
          recommended_action: "",
          latest_gate_result: "",
          only_blocked: false,
          only_ready: true,
          sort_by: "created_at",
          sort_desc: true,
          limit: 100,
          offset: 0,
        }),
      ),
    );
  });

  it("loads component filters from localStorage and falls back for malformed values", async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "components");
    localStorage.setItem(
      COMPONENT_FILTERS_STORAGE_KEY,
      JSON.stringify({
        device_type: "DEMO-OPS",
        production_status: "BROKEN",
        primary_quality_status: "INVALID_STATUS",
        stale_bucket: "LAST_MONTH",
        recommended_action: "UNSUPPORTED_ACTION",
        passes_component_quality_gate: "maybe",
        only_blocking: false,
        sort_by: "mystery_field",
        limit: 0,
        offset: -5,
        sort_desc: "nope",
      }),
    );

    const fetchMock = vi.fn(async () => createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/component-quality?device_type=DEMO-OPS&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("blocks fetch and shows validation when api base is empty", async () => {
    localStorage.setItem(API_STORAGE_KEY, "");

    const blockedFetch = vi.fn();
    vi.stubGlobal("fetch", blockedFetch);

    render(<App />);

    const emptyApiAlert = await screen.findByRole("alert");
    expect(emptyApiAlert).toHaveTextContent("Podaj bazowy adres API.");
    expect(blockedFetch).not.toHaveBeenCalled();
  });

  it("clears stale component data when refresh ends with API error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(
        createErrorResponse(503, "Service Unavailable", "component queue offline"),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    const apiControls = screen.getByRole("region", { name: /API/i });
    fireEvent.click(within(apiControls).getByRole("button", { name: "Odśwież" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("API 503 Service Unavailable: component queue offline");
    expect(screen.queryByText("COMP-001")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("restores default shipment filters after reset", async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(shipmentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });
    fireEvent.click(screen.getByLabelText("Tylko zablokowane"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("Typ urządzenia")).toHaveValue("");
    expect(screen.getByLabelText("Tylko zablokowane")).not.toBeChecked();
    expect(screen.getByLabelText("Tylko gotowe")).not.toBeChecked();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("pages through shipment queue and resets offset after filter changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(paginatedShipmentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedShipmentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedShipmentPageTwoPayload))
      .mockResolvedValue(createJsonResponse(paginatedShipmentPageOnePayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();
    expect(screen.getByText("1-1 z 3 urządzeń")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "1" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Następna strona" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=1&offset=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText("SHIP-002")).toBeInTheDocument();
    expect(screen.getByText("2-2 z 3 urządzeń")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Typ urządzenia"), {
      target: { value: "DEMO-OPS" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?device_type=DEMO-OPS&sort_by=created_at&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("clamps shipment limit in UI state before sending request", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(paginatedShipmentPageOnePayload),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "999" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Limit")).toHaveValue(500);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=500",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("pages through component queue in both directions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageOnePayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageTwoPayload))
      .mockResolvedValueOnce(createJsonResponse(paginatedComponentPageOnePayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "1" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Następna strona" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1&offset=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText("COMP-002")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Poprzednia strona" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();
  });

  it("clamps component limit to minimum value before sending request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload))
      .mockResolvedValueOnce(createJsonResponse(componentPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Komponenty" }));
    expect(await screen.findByText("COMP-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Limit"), {
      target: { value: "0" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText("Limit")).toHaveValue(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/component-quality?only_blocking=true&sort_by=blocked_components&sort_desc=true&limit=1",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("loads commissioning queue after switching to service view", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(serviceQueuePayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Commissioning i serwis" }),
    );

    expect(await screen.findByText("SVC-001")).toBeInTheDocument();
    expect(await screen.findByText("SVC-DEVICE-001")).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/service-sessions/queue?sort_by=uploaded_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("opens commissioning session details drawer from service queue", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/shipment-readiness?sort_by=created_at&sort_desc=true&limit=100") {
        return Promise.resolve(createJsonResponse(shipmentPayload));
      }

      if (url === "/api/service-sessions/queue?sort_by=uploaded_at&sort_desc=true&limit=100") {
        return Promise.resolve(createJsonResponse(serviceQueuePayload));
      }

      if (url === "/api/service-sessions/SVC-001") {
        return Promise.resolve(createJsonResponse(serviceSessionDetailsPayload));
      }

      if (
        url ===
        "/api/audit-events?entity_type=SERVICE_SESSION&entity_id=SVC-001"
      ) {
        return Promise.resolve(createJsonResponse(serviceSessionAuditPayload));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Commissioning i serwis" }),
    );

    expect(await screen.findByText("SVC-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "SVC-001" }));

    const drawer = await screen.findByRole("dialog");
    expect(
      within(drawer).getByRole("heading", { name: "SVC-001" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByText("Szczegóły sesji commissioning"),
    ).toBeInTheDocument();
    expect(within(drawer).getByText("TECH-DETAIL-001")).toBeInTheDocument();
    expect(
      within(drawer).getByText("Service session package reuploaded"),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("link", { name: "Pobierz paczkę ZIP" }),
    ).toHaveAttribute("href", "/api/service-sessions/SVC-001/package");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/service-sessions/SVC-001",
        expect.objectContaining({
          headers: { Accept: "application/json" },
          signal: expect.any(AbortSignal),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audit-events?entity_type=SERVICE_SESSION&entity_id=SVC-001",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );

    await waitFor(() =>
      expect(window.location.search).toContain("svc_session_id=SVC-001"),
    );

    fireEvent.click(within(drawer).getByRole("button", { name: "Zamknij" }));

    await waitFor(() =>
      expect(window.location.search).not.toContain("svc_session_id=SVC-001"),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("applies trigger filter from commissioning summary cards", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(shipmentPayload))
      .mockResolvedValueOnce(createJsonResponse(serviceQueuePayload))
      .mockResolvedValueOnce(createJsonResponse(serviceQueuePayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("SHIP-001")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Commissioning i serwis" }),
    );

    expect(await screen.findByText("SVC-001")).toBeInTheDocument();

    const triggerPanel = screen
      .getAllByText("Trigger synchronizacji")
      .find((heading) => heading.closest(".summary-panel"));
    expect(triggerPanel).toBeDefined();

    fireEvent.click(
      within(triggerPanel!.closest(".summary-panel") as HTMLElement).getByRole(
        "button",
        { name: /Auto po sieci/i },
      ),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/service-sessions/queue?client_trigger_source=AUTO_NETWORK&sort_by=uploaded_at&sort_desc=true&limit=100",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});


