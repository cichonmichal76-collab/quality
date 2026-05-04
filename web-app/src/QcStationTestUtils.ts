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

export function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}
