export { fulfillImage, fulfillJson } from "./e2e-response-helpers";

type OperatorFixture = {
  id: string;
  operator_id: string;
  full_name: string;
  role: string;
  login_name: string;
  rfid_uid_hash: string;
  is_active: boolean;
  created_at: string;
};

type WorkstationFixture = {
  id: string;
  workstation_id: string;
  name: string;
  area: string;
  station_type: string;
  is_active: boolean;
};

type ChecklistFixture = {
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
};

const baseOperator: OperatorFixture = {
  id: "OP-ROW-001",
  operator_id: "QCOP-EXISTING",
  full_name: "Istniejacy operator",
  role: "QUALITY_INSPECTOR",
  login_name: "qc-existing",
  rfid_uid_hash: "RFID-EXISTING",
  is_active: true,
  created_at: "2026-05-03T08:00:00Z",
};

const baseWorkstation: WorkstationFixture = {
  id: "WS-ROW-001",
  workstation_id: "QCWS-001",
  name: "Stacja QC 1",
  area: "QA",
  station_type: "QC",
  is_active: true,
};

const baseChecklist: ChecklistFixture = {
  id: "CHK-001",
  checklist_code: "QC-DEMO-OPS-DEFAULT-SCREW-M4",
  name: "Kontrola sruby M4",
  process_stage: "COMPONENT_QC",
  version: "1.0",
  device_type: "DEMO-OPS",
  variant_code: "DEFAULT",
  component_type: "SCREW_M4",
  skip_component_qc: false,
  reference_image_file_id: null,
  is_active: true,
  created_at: "2026-05-03T11:00:00Z",
};

export function buildAdminOperator(
  overrides: Partial<OperatorFixture> = {},
): OperatorFixture {
  return { ...baseOperator, ...overrides };
}

export function buildAdminWorkstation(
  overrides: Partial<WorkstationFixture> = {},
): WorkstationFixture {
  return { ...baseWorkstation, ...overrides };
}

export function buildAdminChecklist(
  overrides: Partial<ChecklistFixture> = {},
): ChecklistFixture {
  return { ...baseChecklist, ...overrides };
}
