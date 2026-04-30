# API Guide

This document describes the currently implemented MVP API flow in the backend.

It focuses on the traceability-first workflow that already exists in code:

1. operator and workstation bootstrap
2. RFID login and `work_session_id`
3. production item creation
4. scan event ledger
5. QC checklist and QC run
6. assembly by scan
7. final test upload
8. audit trail lookup

## Base URL

Local development default:

```text
http://localhost:8000
```

API prefix:

```text
/api
```

Health check:

```text
GET /health
```

Generated FastAPI docs are also available at:

```text
/docs
/openapi.json
```

## Content types

Most endpoints use JSON request bodies.

Exceptions:

- `POST /api/qc-runs/{run_id}/complete` expects form data
- `POST /api/service-sessions/upload` uses multipart form data
- `POST /api/files/upload` uses multipart form data

## Core workflow conventions

- production and quality actions rely on `work_session_id`
- `work_session_id` must reference an active RFID-authenticated workstation session
- operator roles are validated against the action being executed
- audit events are written for important workflow actions and failures

## Common HTTP responses

- `200` success
- `400` invalid state, invalid transition, inactive session, missing active session
- `401` inactive or unknown RFID operator
- `403` operator role is not allowed for the action
- `404` requested entity does not exist
- `409` duplicate identifier or already-installed component

## 1. Bootstrap master data

Create an operator:

```bash
curl -X POST http://localhost:8000/api/operators \
  -H "Content-Type: application/json" \
  -d '{
    "operator_id": "OP-001",
    "full_name": "Jan Kowalski",
    "role": "PRODUCTION_OPERATOR",
    "rfid_uid_hash": "RFID-001"
  }'
```

Create a workstation:

```bash
curl -X POST http://localhost:8000/api/workstations \
  -H "Content-Type: application/json" \
  -d '{
    "workstation_id": "WS-01",
    "name": "Station 01",
    "area": "MECHANICAL",
    "station_type": "PRODUCTION"
  }'
```

Create a machine:

```bash
curl -X POST http://localhost:8000/api/machines \
  -H "Content-Type: application/json" \
  -d '{
    "machine_id": "MC-01",
    "name": "Laser Marker",
    "machine_type": "MARKING",
    "location": "Line A"
  }'
```

## 2. RFID login and work session

Start an RFID session:

```bash
curl -X POST http://localhost:8000/api/auth/rfid-login \
  -H "Content-Type: application/json" \
  -d '{
    "rfid_uid_hash": "RFID-001",
    "workstation_id": "WS-01",
    "machine_id": "MC-01"
  }'
```

Typical response:

```json
{
  "id": "9a5d3d46-6a6d-4af7-b2a7-17b4d0a6d7f4",
  "work_session_id": "WS-9f58f6efc49b",
  "operator_id": "OP-001",
  "workstation_id": "WS-01",
  "machine_id": "MC-01",
  "status": "ACTIVE",
  "started_at": "2026-04-30T10:00:00Z",
  "ended_at": null
}
```

Important:

- repeated login with the same active context reuses the existing session
- timed-out sessions are marked as `TIMEOUT`
- production and QC flows fail if the session is not active

Close a session:

```bash
curl -X POST http://localhost:8000/api/work-sessions/WS-9f58f6efc49b/close \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Shift completed"
  }'
```

## 3. Create a production item

You can create a barcode explicitly, but the current backend also creates a barcode automatically when a production item is created and the barcode does not already exist.

Optional explicit barcode creation:

```bash
curl -X POST http://localhost:8000/api/barcodes/create \
  -H "Content-Type: application/json" \
  -d '{
    "barcode_value": "BC-1001",
    "entity_type": "PRODUCTION_ITEM",
    "entity_serial_number": "ITEM-1001",
    "printed_by": "OP-001"
  }'
```

Create the production item:

```bash
curl -X POST http://localhost:8000/api/production-items \
  -H "Content-Type: application/json" \
  -d '{
    "item_serial_number": "ITEM-1001",
    "barcode_value": "BC-1001",
    "item_type": "PCB",
    "part_number": "PCB-CTRL-01",
    "revision": "A",
    "production_order": "PO-2026-001",
    "work_session_id": "WS-9f58f6efc49b",
    "workstation_id": "WS-01"
  }'
```

Notes:

- active work session is required
- the backend fills `created_by_operator_id` and `machine_id` from the active session if omitted
- duplicate `item_serial_number` or `barcode_value` returns `409`

## 4. Record scan events

Record an accepted scan:

```bash
curl -X POST http://localhost:8000/api/scan-events \
  -H "Content-Type: application/json" \
  -d '{
    "scan_event_id": "SCAN-1001",
    "barcode_value": "BC-1001",
    "context": "QC_SCAN",
    "result": "ACCEPTED",
    "work_session_id": "WS-9f58f6efc49b"
  }'
```

Get scan history for a barcode:

```bash
curl http://localhost:8000/api/barcodes/BC-1001/scan-history
```

Deactivate a barcode:

```bash
curl -X PATCH http://localhost:8000/api/barcodes/BC-1001/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "INACTIVE"
  }'
```

Barcode status rules:

- allowed barcode statuses: `ACTIVE`, `INACTIVE`, `VOID`
- inactive barcodes are blocked during scan
- blocked scans still create a rejected scan event and audit entry

## 5. QC checklist and QC run

Create a checklist:

```bash
curl -X POST http://localhost:8000/api/qc-checklists \
  -H "Content-Type: application/json" \
  -d '{
    "checklist_code": "CHK-MECH-01",
    "name": "Mechanical QC",
    "process_stage": "MECHANICAL_QC",
    "version": "1.0"
  }'
```

Add a checklist step:

```bash
curl -X POST http://localhost:8000/api/qc-checklists/CHK-MECH-01/steps \
  -H "Content-Type: application/json" \
  -d '{
    "step_order": 1,
    "title": "Measure width",
    "requires_measurement": true,
    "tolerance_min": 10.0,
    "tolerance_max": 20.0
  }'
```

Start a QC run for the item:

```bash
curl -X POST http://localhost:8000/api/qc-runs \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "QCRUN-1001",
    "item_serial_number": "ITEM-1001",
    "barcode_value": "BC-1001",
    "checklist_id": "CHECKLIST-ID",
    "process_stage": "MECHANICAL_QC",
    "work_session_id": "WS-9f58f6efc49b"
  }'
```

Submit step result:

```bash
curl -X POST http://localhost:8000/api/qc-runs/QCRUN-1001/steps/STEP-ID/result \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PASS",
    "measurement_value": 15.2,
    "comment": "Within tolerance"
  }'
```

Complete the run:

```bash
curl -X POST http://localhost:8000/api/qc-runs/QCRUN-1001/complete \
  -F "result=PASS"
```

You can also omit the explicit `result`. In that case the backend derives the run result from step results.

QC behavior in the current MVP:

- QC requires an active work session with a quality role
- measurement steps automatically return `FAIL` when outside tolerance
- item status changes to `QC_IN_PROGRESS`, then `QC_PASSED` or `QC_FAILED`
- a failed QC run creates a blocking NCR with id pattern `NCR-QC-{run_id}`

## 6. Assembly by scan

Create the device:

```bash
curl -X POST http://localhost:8000/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "device_serial_number": "ZSS-000123",
    "device_type": "ZSS",
    "hardware_version": "HW-1.0"
  }'
```

Install a component into the device:

```bash
curl -X POST http://localhost:8000/api/devices/ZSS-000123/assembly/scan-component \
  -H "Content-Type: application/json" \
  -d '{
    "child_barcode_value": "BC-1001",
    "component_type": "CONTROL_PCB",
    "work_session_id": "WS-9f58f6efc49b"
  }'
```

Read the assembly tree:

```bash
curl http://localhost:8000/api/devices/ZSS-000123/assembly-tree
```

Assembly rules:

- component barcode must exist
- component item status cannot be `QC_FAILED`, `SCRAPPED`, or `REWORK_REQUIRED`
- a component cannot be installed twice while already `INSTALLED`
- assembly writes both a scan event and an audit event

## 7. Final test

Record final test result:

```bash
curl -X POST http://localhost:8000/api/final-tests \
  -H "Content-Type: application/json" \
  -d '{
    "test_run_id": "FT-20260430-0001",
    "device_serial_number": "ZSS-000123",
    "result": "PASS",
    "firmware_version": "1.2.4",
    "bootloader_version": "0.9.8",
    "work_session_id": "WS-FT-01"
  }'
```

Final test rules:

- final test requires an active work session with a final-test role
- device must already exist
- `PASS` sets device `production_status` to `FINAL_TEST_PASSED`
- `FAIL` sets device `production_status` to `FINAL_TEST_FAILED`
- `FAIL` also creates a critical NCR with id pattern `NCR-{test_run_id}`

Mark the device ready for shipment:

```bash
curl -X PATCH http://localhost:8000/api/devices/ZSS-000123/status \
  -H "Content-Type: application/json" \
  -d '{
    "production_status": "READY_FOR_SHIPMENT"
  }'
```

Shipment gate in the current MVP:

- `READY_FOR_SHIPMENT` requires `FINAL_TEST_PASSED`
- open critical NCR blocks shipment

## 8. Audit trail

List all audit events:

```bash
curl http://localhost:8000/api/audit-events
```

Filter by work session:

```bash
curl "http://localhost:8000/api/audit-events?work_session_id=WS-9f58f6efc49b"
```

Filter by entity:

```bash
curl "http://localhost:8000/api/audit-events?entity_type=FINAL_TEST&entity_id=FT-20260430-0001"
```

Typical audit event types in the implemented flow:

- `RFID_LOGIN`
- `RFID_LOGIN_REUSED`
- `RFID_LOGIN_FAILED`
- `WORK_SESSION_CLOSED`
- `WORK_SESSION_TIMED_OUT`
- `PRODUCTION_ITEM_CREATED`
- `PRODUCTION_ITEM_STATUS_UPDATED`
- `BARCODE_STATUS_UPDATED`
- `SCAN_EVENT_RECORDED`
- `SCAN_EVENT_REJECTED`
- `QC_RUN_STARTED`
- `QC_RUN_COMPLETED`
- `ASSEMBLY_COMPONENT_INSTALLED`
- `FINAL_TEST_RECORDED`
- `DEVICE_STATUS_UPDATED`

## Status rules worth knowing

Production item transitions currently allowed:

- `LABELED` -> `PRODUCED`, `QC_IN_PROGRESS`, `BLOCKED`, `SCRAPPED`
- `PRODUCED` -> `QC_IN_PROGRESS`, `BLOCKED`, `SCRAPPED`
- `QC_IN_PROGRESS` -> `QC_PASSED`, `QC_FAILED`, `REWORK_REQUIRED`, `BLOCKED`
- `QC_FAILED` -> `REWORK_REQUIRED`, `BLOCKED`, `SCRAPPED`
- `REWORK_REQUIRED` -> `QC_IN_PROGRESS`, `BLOCKED`, `SCRAPPED`
- `QC_PASSED` -> `INSTALLED`, `BLOCKED`
- `BLOCKED` -> `REWORK_REQUIRED`, `QC_IN_PROGRESS`, `SCRAPPED`

Terminal item states:

- `INSTALLED`
- `SCRAPPED`

## Role gates in the current MVP

- production and traceability actions: `ADMIN`, `PRODUCTION_OPERATOR`, `QUALITY_INSPECTOR`
- QC actions: `ADMIN`, `QUALITY_INSPECTOR`, `QUALITY_MANAGER`
- final test actions: `ADMIN`, `FINAL_TEST_OPERATOR`, `QUALITY_MANAGER`

## Additional endpoints outside the main flow

- `GET /api/devices`
- `GET /api/production-items/{item_serial_number}`
- `GET /api/production-items/by-barcode/{barcode_value}`
- `GET /api/nonconformities`
- `POST /api/nonconformities`
- `PATCH /api/nonconformities/{ncr_id}`
- `POST /api/service-sessions/upload`
- `GET /api/service-sessions`
- `GET /api/service-sessions/{session_id}`
- `GET /api/service-sessions/{session_id}/package`
- `POST /api/files/upload`
- `GET /api/files/{file_id}`

## Current caveats

- there is now a practical API guide in this repo, but no versioned contract documentation process yet
- some implemented endpoints still live in legacy routing code while the module split continues
- shipment validation is still narrower than the full PRD target
- web and Android clients are not yet using a generated API client contract
