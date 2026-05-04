import type { Route } from "@playwright/test";

type JsonStatus = {
  status?: number;
  contentType?: string;
};

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

type SessionFixture = {
  id: string;
  work_session_id: string;
  operator_id: string;
  workstation_id: string;
  machine_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
};

type ItemFixture = {
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
  current_status: string;
  produced_at: string;
  created_at: string;
  qc_reserved_by_operator_id?: string | null;
  qc_reserved_by_workstation_id?: string | null;
  qc_reserved_at?: string | null;
};

const baseOperator: OperatorFixture = {
  id: "ROW-OP-001",
  operator_id: "QCOP-DEMO-LOCAL",
  full_name: "Anna Kontrola",
  role: "QUALITY_INSPECTOR",
  login_name: "qc-demo-local",
  rfid_uid_hash: "QCRFID-DEMO-LOCAL",
  is_active: true,
  created_at: "2026-05-03T07:55:00Z",
};

const baseWorkstation: WorkstationFixture = {
  id: "ROW-WS-001",
  workstation_id: "QCWS-DEMO-LOCAL",
  name: "QC Station Demo",
  area: "QA",
  station_type: "QC",
  is_active: true,
};

const baseChecklist: ChecklistFixture = {
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
  created_at: "2026-05-03T08:05:00Z",
};

const baseSession: SessionFixture = {
  id: "ROW-SESSION-001",
  work_session_id: "WS-QA-001",
  operator_id: "QCOP-DEMO-LOCAL",
  workstation_id: "QCWS-DEMO-LOCAL",
  machine_id: null,
  status: "ACTIVE",
  started_at: "2026-05-03T08:00:00Z",
  ended_at: null,
};

const baseItem: ItemFixture = {
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
  current_status: "PRODUCED",
  produced_at: "2026-05-03T08:10:00Z",
  created_at: "2026-05-03T08:10:00Z",
  qc_reserved_by_operator_id: null,
  qc_reserved_by_workstation_id: null,
  qc_reserved_at: null,
};

export async function fulfillJson(route: Route, body: unknown, options: JsonStatus = {}) {
  await route.fulfill({
    status: options.status ?? 200,
    contentType: options.contentType ?? "application/json",
    body: JSON.stringify(body),
  });
}

export function buildQcDemoOperator(overrides: Partial<OperatorFixture> = {}): OperatorFixture {
  return { ...baseOperator, ...overrides };
}

export function buildQcDemoWorkstation(
  overrides: Partial<WorkstationFixture> = {},
): WorkstationFixture {
  return { ...baseWorkstation, ...overrides };
}

export function buildQcDemoChecklist(
  overrides: Partial<ChecklistFixture> = {},
): ChecklistFixture {
  return { ...baseChecklist, ...overrides };
}

export function buildQcDemoSession(overrides: Partial<SessionFixture> = {}): SessionFixture {
  return { ...baseSession, ...overrides };
}

export function buildQcDemoItem(overrides: Partial<ItemFixture> = {}): ItemFixture {
  return { ...baseItem, ...overrides };
}
