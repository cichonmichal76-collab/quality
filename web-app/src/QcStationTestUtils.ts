export function buildDemoOperator(
  overrides: Partial<{
    id: string;
    operator_id: string;
    full_name: string;
    role: string;
    login_name: string;
    rfid_uid_hash: string;
    is_active: boolean;
    created_at: string;
  }> = {},
) {
  return {
    id: "OP-ROW-001",
    operator_id: "QCOP-DEMO-LOCAL",
    full_name: "Demo QC Inspector",
    role: "QUALITY_INSPECTOR",
    login_name: "qc-demo-local",
    rfid_uid_hash: "QCRFID-DEMO-LOCAL",
    is_active: true,
    created_at: "2026-05-03T08:00:00Z",
    ...overrides,
  };
}

export function buildDemoWorkstation(
  overrides: Partial<{
    id: string;
    workstation_id: string;
    name: string;
    area: string;
    station_type: string;
    is_active: boolean;
  }> = {},
) {
  return {
    id: "WS-ROW-001",
    workstation_id: "QCWS-DEMO-LOCAL",
    name: "QC Station Demo",
    area: "QA",
    station_type: "QC",
    is_active: true,
    ...overrides,
  };
}

export function buildDemoChecklist(
  overrides: Partial<{
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
  }> = {},
) {
  return {
    id: "CHK-001",
    checklist_code: "QC-STATION-DEMO-LOCAL",
    name: "Kontrola wentylatora",
    process_stage: "COMPONENT_QC",
    version: "1.0",
    device_type: null,
    variant_code: null,
    component_type: null,
    skip_component_qc: false,
    reference_image_file_id: null,
    is_active: true,
    created_at: "2026-05-03T08:00:00Z",
    ...overrides,
  };
}

export function buildDemoSession(
  overrides: Partial<{
    id: string;
    work_session_id: string;
    operator_id: string;
    workstation_id: string;
    machine_id: string | null;
    status: string;
    started_at: string;
    ended_at: string | null;
  }> = {},
) {
  return {
    id: "SESSION-ROW-001",
    work_session_id: "WS-QA-001",
    operator_id: "QCOP-DEMO-LOCAL",
    workstation_id: "QCWS-DEMO-LOCAL",
    machine_id: null,
    status: "ACTIVE",
    started_at: "2026-05-03T08:10:00Z",
    ended_at: null,
    ...overrides,
  };
}

export function buildDemoItem(
  overrides: Partial<{
    id: string;
    item_serial_number: string;
    barcode_value: string;
    item_type: string;
    part_number: string;
    revision: string;
    drawing_number: string | null;
    drawing_revision: string | null;
    production_order: string | null;
    material_batch: string | null;
    machine_id: string | null;
    created_by_operator_id: string;
    qc_reserved_by_operator_id: string | null;
    qc_reserved_by_workstation_id: string | null;
    qc_reserved_at: string | null;
    current_status: string;
    produced_at: string | null;
    created_at: string;
  }> = {},
) {
  return {
    id: "ITEM-ROW-001",
    item_serial_number: "QCITEM-DEMO-LOCAL",
    barcode_value: "QCBC-DEMO-LOCAL",
    item_type: "FAN_MODULE",
    part_number: "PN-FAN-001",
    revision: "A",
    drawing_number: null,
    drawing_revision: null,
    production_order: null,
    material_batch: null,
    machine_id: null,
    created_by_operator_id: "QCOP-DEMO-LOCAL",
    qc_reserved_by_operator_id: null,
    qc_reserved_by_workstation_id: null,
    qc_reserved_at: null,
    current_status: "PRODUCED",
    produced_at: "2026-05-03T08:10:00Z",
    created_at: "2026-05-03T08:10:00Z",
    ...overrides,
  };
}

export function buildDemoStep(
  overrides: Partial<{
    id: string;
    checklist_id: string;
    step_order: number;
    title: string;
    instruction: string;
    control_area: string | null;
    evaluation_mode: string | null;
    result_input_label: string | null;
    region_x: number | null;
    region_y: number | null;
    region_width: number | null;
    region_height: number | null;
    requires_photo: boolean;
    requires_measurement: boolean;
    blocking_on_fail: boolean;
    expected_value: string | null;
    unit: string | null;
    tolerance_min: number | null;
    tolerance_max: number | null;
  }> = {},
) {
  return {
    id: "STEP-001",
    checklist_id: "CHK-001",
    step_order: 1,
    title: "Kontrola manualna",
    instruction: "Wykonaj kontrole.",
    control_area: "Obszar kontroli",
    evaluation_mode: "MANUAL",
    result_input_label: null,
    region_x: null,
    region_y: null,
    region_width: null,
    region_height: null,
    requires_photo: false,
    requires_measurement: false,
    blocking_on_fail: true,
    expected_value: null,
    unit: null,
    tolerance_min: null,
    tolerance_max: null,
    ...overrides,
  };
}

export function buildDemoRun(
  overrides: Partial<{
    id: string;
    run_id: string;
    item_serial_number: string;
    barcode_value: string;
    checklist_id: string;
    process_stage: string;
    work_session_id: string;
    operator_id: string;
    status: string;
    result: string | null;
    started_at: string;
    ended_at: string | null;
  }> = {},
) {
  return {
    id: "QC-ROW-001",
    run_id: "QC-WEB-STATIC",
    item_serial_number: "QCITEM-DEMO-LOCAL",
    barcode_value: "QCBC-DEMO-LOCAL",
    checklist_id: "CHK-001",
    process_stage: "COMPONENT_QC",
    work_session_id: "WS-QA-001",
    operator_id: "QCOP-DEMO-LOCAL",
    status: "IN_PROGRESS",
    result: null,
    started_at: "2026-05-03T08:11:00Z",
    ended_at: null,
    ...overrides,
  };
}

export function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}
