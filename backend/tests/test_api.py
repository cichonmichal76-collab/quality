from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import SessionLocal, utc_now
from app.main import app
from app.models import WorkSession

client = TestClient(app)


def unique_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def start_work_session(role: str = "PRODUCTION_OPERATOR", include_machine: bool = True) -> dict:
    operator_id = unique_id("OP")
    workstation_id = unique_id("WS")
    machine_id = unique_id("MC") if include_machine else None
    rfid_uid_hash = unique_id("RFID")

    operator_response = client.post(
        "/api/operators",
        json={
            "operator_id": operator_id,
            "full_name": "Pytest Operator",
            "role": role,
            "rfid_uid_hash": rfid_uid_hash,
        },
    )
    assert operator_response.status_code == 200

    workstation_response = client.post(
        "/api/workstations",
        json={"workstation_id": workstation_id, "name": "Station", "area": "QA"},
    )
    assert workstation_response.status_code == 200

    if machine_id:
        machine_response = client.post(
            "/api/machines",
            json={"machine_id": machine_id, "name": "Machine", "machine_type": "TEST"},
        )
        assert machine_response.status_code == 200

    login_response = client.post(
        "/api/auth/rfid-login",
        json={
            "rfid_uid_hash": rfid_uid_hash,
            "workstation_id": workstation_id,
            "machine_id": machine_id,
        },
    )
    assert login_response.status_code == 200
    session = login_response.json()
    session["rfid_uid_hash"] = rfid_uid_hash
    return session


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_device_lifecycle():
    serial_number = unique_id("ZSS")
    payload = {
        "device_serial_number": serial_number,
        "device_type": "ZSS",
        "hardware_version": "HW-1.0",
        "created_by": "pytest",
    }
    response = client.post("/api/devices", json=payload)
    assert response.status_code == 200

    response = client.get(f"/api/devices/{serial_number}")
    assert response.status_code == 200
    assert response.json()["device_serial_number"] == serial_number

    response = client.patch(
        f"/api/devices/{serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert response.status_code == 400


def test_rfid_work_session_lifecycle_and_audit_events():
    session = start_work_session(include_machine=False)

    reused_login = client.post(
        "/api/auth/rfid-login",
        json={
            "rfid_uid_hash": session["rfid_uid_hash"],
            "workstation_id": session["workstation_id"],
            "machine_id": None,
        },
    )
    assert reused_login.status_code == 200
    assert reused_login.json()["work_session_id"] == session["work_session_id"]

    listed = client.get("/api/work-sessions")
    assert listed.status_code == 200
    assert any(
        row["work_session_id"] == session["work_session_id"] and row["status"] == "ACTIVE"
        for row in listed.json()
    )

    closed = client.post(
        f"/api/work-sessions/{session['work_session_id']}/close",
        json={"reason": "Shift completed"},
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "CLOSED"
    assert closed.json()["ended_at"] is not None

    audit = client.get(f"/api/audit-events?work_session_id={session['work_session_id']}")
    assert audit.status_code == 200
    event_types = {row["event_type"] for row in audit.json()}
    assert "RFID_LOGIN" in event_types
    assert "RFID_LOGIN_REUSED" in event_types
    assert "WORK_SESSION_CLOSED" in event_types


def test_traceability_operations_pick_up_active_work_session_context():
    session = start_work_session()

    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")
    item_response = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "PCB",
            "work_session_id": session["work_session_id"],
            "workstation_id": session["workstation_id"],
        },
    )
    assert item_response.status_code == 200
    item = item_response.json()
    assert item["created_by_operator_id"] == session["operator_id"]
    assert item["machine_id"] == session["machine_id"]

    scan_response = client.post(
        "/api/scan-events",
        json={
            "scan_event_id": unique_id("SCAN"),
            "barcode_value": barcode_value,
            "context": "QC_SCAN",
            "result": "ACCEPTED",
            "work_session_id": session["work_session_id"],
        },
    )
    assert scan_response.status_code == 200
    event = scan_response.json()
    assert event["operator_id"] == session["operator_id"]
    assert event["workstation_id"] == session["workstation_id"]

    audit = client.get(f"/api/audit-events?work_session_id={session['work_session_id']}")
    assert audit.status_code == 200
    event_types = {row["event_type"] for row in audit.json()}
    assert "PRODUCTION_ITEM_CREATED" in event_types
    assert "SCAN_EVENT_RECORDED" in event_types


def test_traceability_requires_active_work_session():
    response = client.post(
        "/api/production-items",
        json={
            "item_serial_number": unique_id("ITEM"),
            "barcode_value": unique_id("BC"),
            "item_type": "PCB",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Active work session is required"


def test_traceability_blocks_wrong_operator_role():
    session = start_work_session(role="FINAL_TEST_OPERATOR")
    response = client.post(
        "/api/production-items",
        json={
            "item_serial_number": unique_id("ITEM"),
            "barcode_value": unique_id("BC"),
            "item_type": "PCB",
            "work_session_id": session["work_session_id"],
            "workstation_id": session["workstation_id"],
        },
    )
    assert response.status_code == 403
    assert "not allowed" in response.json()["detail"]


def test_barcode_can_be_deactivated_and_blocks_scan():
    session = start_work_session()
    barcode_value = unique_id("BC")
    item_serial_number = unique_id("ITEM")

    item_response = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "PCB",
            "work_session_id": session["work_session_id"],
            "workstation_id": session["workstation_id"],
        },
    )
    assert item_response.status_code == 200

    deactivate = client.patch(
        f"/api/barcodes/{barcode_value}/status",
        json={"status": "INACTIVE"},
    )
    assert deactivate.status_code == 200
    assert deactivate.json()["status"] == "INACTIVE"

    blocked_scan = client.post(
        "/api/scan-events",
        json={
            "scan_event_id": unique_id("SCAN"),
            "barcode_value": barcode_value,
            "context": "MANUAL_SCAN",
            "result": "ACCEPTED",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked_scan.status_code == 400
    assert blocked_scan.json()["detail"] == "Barcode is not active"

    history = client.get(f"/api/barcodes/{barcode_value}/scan-history")
    assert history.status_code == 200
    assert history.json()[0]["result"] == "REJECTED"


def test_production_item_status_transition_is_validated():
    session = start_work_session()
    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")

    create = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "PCB",
            "work_session_id": session["work_session_id"],
            "workstation_id": session["workstation_id"],
        },
    )
    assert create.status_code == 200

    invalid = client.patch(
        f"/api/production-items/{item_serial_number}/status",
        json={"current_status": "INSTALLED"},
    )
    assert invalid.status_code == 400
    assert "Invalid production item status transition" in invalid.json()["detail"]

    valid = client.patch(
        f"/api/production-items/{item_serial_number}/status",
        json={"current_status": "PRODUCED"},
    )
    assert valid.status_code == 200
    assert valid.json()["current_status"] == "PRODUCED"


def test_qc_run_fail_updates_item_and_creates_ncr():
    quality_session = start_work_session(role="QUALITY_INSPECTOR")
    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")

    create_item = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "PCB",
            "work_session_id": quality_session["work_session_id"],
            "workstation_id": quality_session["workstation_id"],
        },
    )
    assert create_item.status_code == 200

    checklist_code = unique_id("CHK")
    checklist = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": checklist_code,
            "name": "Mechanical QC",
            "process_stage": "MECHANICAL_QC",
            "version": "1.0",
        },
    )
    assert checklist.status_code == 200
    checklist_id = checklist.json()["id"]

    step = client.post(
        f"/api/qc-checklists/{checklist_code}/steps",
        json={
            "step_order": 1,
            "title": "Measure width",
            "requires_measurement": True,
            "tolerance_min": 10.0,
            "tolerance_max": 20.0,
        },
    )
    assert step.status_code == 200
    step_id = step.json()["id"]

    run_id = unique_id("QCRUN")
    qc_run = client.post(
        "/api/qc-runs",
        json={
            "run_id": run_id,
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "checklist_id": checklist_id,
            "process_stage": "MECHANICAL_QC",
            "work_session_id": quality_session["work_session_id"],
        },
    )
    assert qc_run.status_code == 200

    step_result = client.post(
        f"/api/qc-runs/{run_id}/steps/{step_id}/result",
        json={"status": "PASS", "measurement_value": 25.0},
    )
    assert step_result.status_code == 200
    assert step_result.json()["status"] == "FAIL"

    completed = client.post(f"/api/qc-runs/{run_id}/complete", data={})
    assert completed.status_code == 200
    assert completed.json()["result"] == "FAIL"

    item = client.get(f"/api/production-items/{item_serial_number}")
    assert item.status_code == 200
    assert item.json()["current_status"] == "QC_FAILED"

    ncr = client.get("/api/nonconformities")
    assert ncr.status_code == 200
    assert any(row["ncr_id"] == f"NCR-QC-{run_id}" for row in ncr.json())


def test_qc_run_pass_updates_item_status():
    quality_session = start_work_session(role="QUALITY_INSPECTOR")
    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")

    create_item = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "PCB",
            "work_session_id": quality_session["work_session_id"],
            "workstation_id": quality_session["workstation_id"],
        },
    )
    assert create_item.status_code == 200

    checklist_code = unique_id("CHK")
    checklist = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": checklist_code,
            "name": "Electrical QC",
            "process_stage": "ELECTRONICS_QC",
            "version": "1.0",
        },
    )
    assert checklist.status_code == 200
    checklist_id = checklist.json()["id"]

    step = client.post(
        f"/api/qc-checklists/{checklist_code}/steps",
        json={
            "step_order": 1,
            "title": "Measure voltage",
            "requires_measurement": True,
            "tolerance_min": 4.9,
            "tolerance_max": 5.1,
        },
    )
    assert step.status_code == 200
    step_id = step.json()["id"]

    run_id = unique_id("QCRUN")
    qc_run = client.post(
        "/api/qc-runs",
        json={
            "run_id": run_id,
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "checklist_id": checklist_id,
            "process_stage": "ELECTRONICS_QC",
            "work_session_id": quality_session["work_session_id"],
        },
    )
    assert qc_run.status_code == 200

    step_result = client.post(
        f"/api/qc-runs/{run_id}/steps/{step_id}/result",
        json={"status": "FAIL", "measurement_value": 5.0},
    )
    assert step_result.status_code == 200
    assert step_result.json()["status"] == "PASS"

    completed = client.post(f"/api/qc-runs/{run_id}/complete", data={})
    assert completed.status_code == 200
    assert completed.json()["result"] == "PASS"

    item = client.get(f"/api/production-items/{item_serial_number}")
    assert item.status_code == 200
    assert item.json()["current_status"] == "QC_PASSED"


def test_expired_work_session_is_timed_out_and_blocked():
    session = start_work_session()
    db = SessionLocal()
    try:
        work_session = (
            db.query(WorkSession)
            .filter(WorkSession.work_session_id == session["work_session_id"])
            .first()
        )
        assert work_session is not None
        work_session.started_at = utc_now() - timedelta(hours=24)
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/scan-events",
        json={
            "scan_event_id": unique_id("SCAN"),
            "barcode_value": unique_id("BC"),
            "context": "QC_SCAN",
            "result": "ACCEPTED",
            "work_session_id": session["work_session_id"],
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Work session is not active"

    audit = client.get(f"/api/audit-events?work_session_id={session['work_session_id']}")
    assert audit.status_code == 200
    assert any(row["event_type"] == "WORK_SESSION_TIMED_OUT" for row in audit.json())


def test_final_test_pass_sets_status_and_audit_context():
    device_serial_number = unique_id("ZSS")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": "ZSS"},
    )
    assert device_response.status_code == 200

    session = start_work_session(role="FINAL_TEST_OPERATOR")
    test_run_id = unique_id("FT")
    final_test_response = client.post(
        "/api/final-tests",
        json={
            "test_run_id": test_run_id,
            "device_serial_number": device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": session["work_session_id"],
        },
    )
    assert final_test_response.status_code == 200
    assert final_test_response.json()["operator_id"] == session["operator_id"]

    response = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert response.status_code == 200
    assert response.json()["production_status"] == "READY_FOR_SHIPMENT"

    audit = client.get(f"/api/audit-events?entity_type=FINAL_TEST&entity_id={test_run_id}")
    assert audit.status_code == 200
    assert audit.json()[0]["work_session_id"] == session["work_session_id"]
    assert audit.json()[0]["result"] == "PASS"
