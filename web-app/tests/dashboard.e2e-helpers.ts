import type { Route } from "@playwright/test";

type ServiceSessionFixture = {
  session_id: string;
  device_serial_number: string;
  device_type: string;
  technician_id: string;
  result: string;
  upload_status: string;
  upload_count: number;
  firmware_version: string;
  bootloader_version: string;
  client_attempt_id: string;
  client_attempt_number: number;
  client_trigger_source: string;
  upload_correlation_id: string;
  uploaded_at: string;
  created_at: string;
};

type ServiceSessionAuditEvent = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  work_session_id: string | null;
  operator_id: string | null;
  workstation_id: string | null;
  machine_id: string | null;
  result: string | null;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const baseServiceSession: ServiceSessionFixture = {
  session_id: "SVC-001",
  device_serial_number: "SVC-DEVICE-001",
  device_type: "DEMO-SVC",
  technician_id: "TECH-001",
  result: "PASS",
  upload_status: "UPLOADED",
  upload_count: 1,
  firmware_version: "1.2.3",
  bootloader_version: "0.9.0",
  client_attempt_id: "ATTEMPT-001",
  client_attempt_number: 1,
  client_trigger_source: "MANUAL",
  upload_correlation_id: "CORR-001",
  uploaded_at: "2026-05-03T08:10:00Z",
  created_at: "2026-05-03T08:00:00Z",
};

const baseServiceSessionAuditEvent: ServiceSessionAuditEvent = {
  id: "AUD-SVC-001",
  event_type: "SERVICE_SESSION_PACKAGE_REUPLOADED",
  entity_type: "SERVICE_SESSION",
  entity_id: "SVC-SESSION-001",
  work_session_id: null,
  operator_id: "TECH-001",
  workstation_id: null,
  machine_id: null,
  result: "UPLOADED",
  message: "Service session package reuploaded",
  payload: {
    upload_count: 3,
    package_hash: "hash-001",
    upload_correlation_id: "CORR-001",
    client_attempt_id: "ATT-001",
    client_attempt_number: 3,
    client_trigger_source: "DEFERRED_WORKER",
  },
  created_at: "2026-05-03T08:05:00Z",
};

export function buildServiceSession(
  overrides: Partial<ServiceSessionFixture> = {},
): ServiceSessionFixture {
  return { ...baseServiceSession, ...overrides };
}

export function buildServiceSessionAuditEvent(
  overrides: Partial<ServiceSessionAuditEvent> = {},
): ServiceSessionAuditEvent {
  return {
    ...baseServiceSessionAuditEvent,
    ...overrides,
    payload: {
      ...baseServiceSessionAuditEvent.payload,
      ...(overrides.payload ?? {}),
    },
  };
}

export async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function fulfillServiceSessionsQueue(
  route: Route,
  sessions: ServiceSessionFixture[],
  filters: Record<string, unknown> = {},
) {
  const resultValues = [...new Set(sessions.map((session) => session.result))];
  const deviceTypes = [...new Set(sessions.map((session) => session.device_type))];
  const triggerSources = [
    ...new Set(sessions.map((session) => session.client_trigger_source)),
  ];

  await fulfillJson(route, {
    total_sessions: sessions.length,
    reuploaded_sessions: sessions.filter((session) => session.upload_count > 1).length,
    returned_count: sessions.length,
    offset: 0,
    limit: 100,
    has_more: false,
    next_offset: null,
    filters,
    upload_status_summary: [
      { upload_status: "UPLOADED", session_count: sessions.length },
    ].filter((item) => item.session_count > 0),
    result_summary: resultValues.map((result) => ({
      result,
      session_count: sessions.filter((session) => session.result === result).length,
    })).filter((item) => item.session_count > 0),
    device_type_summary: deviceTypes.map((deviceType) => ({
      device_type: deviceType,
      session_count: sessions.filter((session) => session.device_type === deviceType).length,
    })),
    technician_summary: sessions.map((session) => ({
      technician_id: session.technician_id,
      session_count: 1,
    })),
    trigger_source_summary: triggerSources.map((source) => ({
      client_trigger_source: source,
      session_count: sessions.filter(
        (session) => session.client_trigger_source === source,
      ).length,
    })).filter((item) => item.session_count > 0),
    sessions,
  });
}
