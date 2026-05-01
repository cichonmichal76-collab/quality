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


def create_qc_passed_item(
    session: dict,
    item_type: str = "PCB",
    part_number: str | None = None,
    revision: str | None = None,
    drawing_number: str | None = None,
    drawing_revision: str | None = None,
) -> dict:
    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")

    created = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": item_type,
            "part_number": part_number,
            "revision": revision,
            "drawing_number": drawing_number,
            "drawing_revision": drawing_revision,
            "work_session_id": session["work_session_id"],
            "workstation_id": session["workstation_id"],
        },
    )
    assert created.status_code == 200

    for status in ("PRODUCED", "QC_IN_PROGRESS", "QC_PASSED"):
        updated = client.patch(
            f"/api/production-items/{item_serial_number}/status",
            json={"current_status": status},
        )
        assert updated.status_code == 200

    return {"item_serial_number": item_serial_number, "barcode_value": barcode_value}


def ensure_device_bom_template(
    device_type: str,
    component_type: str = "CONTROL_PCB",
    quantity_required: int = 1,
    version: str = "1.0",
    is_active: bool = True,
    required_part_number: str | None = None,
    required_revision: str | None = None,
    required_drawing_number: str | None = None,
    required_drawing_revision: str | None = None,
) -> None:
    template_response = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "name": f"{device_type} Default BOM",
            "version": version,
            "is_active": is_active,
        },
    )
    assert template_response.status_code in {200, 409}

    item_response = client.post(
        f"/api/device-bom-templates/{device_type}/items?version={version}",
        json={
            "component_type": component_type,
            "required_part_number": required_part_number,
            "required_revision": required_revision,
            "required_drawing_number": required_drawing_number,
            "required_drawing_revision": required_drawing_revision,
            "quantity_required": quantity_required,
            "is_required": True,
        },
    )
    assert item_response.status_code in {200, 409}


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

    listed = client.get("/api/devices")
    assert listed.status_code == 200
    assert any(row["device_serial_number"] == serial_number for row in listed.json())

    response = client.patch(
        f"/api/devices/{serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert response.status_code == 400


def test_manual_device_components_can_be_added_and_listed():
    serial_number = unique_id("ZSS")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": serial_number, "device_type": "ZSS"},
    )
    assert created.status_code == 200

    added = client.post(
        f"/api/devices/{serial_number}/components",
        json={
            "component_type": "FAN",
            "component_serial_number": unique_id("CMP"),
            "component_part_number": "FAN-120",
            "component_revision": "A",
            "installed_by": "pytest",
        },
    )
    assert added.status_code == 200
    assert added.json()["device_serial_number"] == serial_number
    assert added.json()["component_type"] == "FAN"

    listed = client.get(f"/api/devices/{serial_number}/components")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["component_part_number"] == "FAN-120"


def test_device_bom_template_can_be_created_and_listed():
    device_type = unique_id("DT")

    created = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "name": "Custom Device BOM",
            "version": "2.0",
            "is_active": True,
        },
    )
    assert created.status_code == 200
    template = created.json()
    assert template["device_type"] == device_type
    assert template["version"] == "2.0"

    bom_item = client.post(
        f"/api/device-bom-templates/{device_type}/items",
        json={
            "component_type": "SENSOR_MODULE",
            "quantity_required": 2,
            "is_required": True,
        },
    )
    assert bom_item.status_code == 200
    assert bom_item.json()["component_type"] == "SENSOR_MODULE"
    assert bom_item.json()["quantity_required"] == 2

    listed_templates = client.get("/api/device-bom-templates")
    assert listed_templates.status_code == 200
    assert any(row["device_type"] == device_type for row in listed_templates.json())

    listed_items = client.get(f"/api/device-bom-templates/{device_type}/items")
    assert listed_items.status_code == 200
    assert len(listed_items.json()) == 1
    assert listed_items.json()[0]["component_type"] == "SENSOR_MODULE"

    versioned_items = client.get(f"/api/device-bom-templates/{device_type}/items?version=2.0")
    assert versioned_items.status_code == 200
    assert versioned_items.json()[0]["component_type"] == "SENSOR_MODULE"

    invalid_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=2.0",
        json={
            "component_type": "INVALID_MODULE",
            "quantity_required": 0,
            "is_required": True,
        },
    )
    assert invalid_item.status_code == 422


def test_device_bom_template_versions_can_be_activated():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        version="2.0",
        is_active=False,
    )

    activated = client.post(
        f"/api/device-bom-templates/{device_type}/activate",
        json={"version": "2.0"},
    )
    assert activated.status_code == 200
    assert activated.json()["version"] == "2.0"
    assert activated.json()["is_active"] is True

    templates = client.get("/api/device-bom-templates")
    assert templates.status_code == 200
    device_templates = [row for row in templates.json() if row["device_type"] == device_type]
    assert len(device_templates) == 2
    assert sum(1 for row in device_templates if row["is_active"]) == 1
    assert next(row for row in device_templates if row["version"] == "2.0")["status"] == "ACTIVE"
    assert next(row for row in device_templates if row["version"] == "1.0")["status"] == "INACTIVE"
    assert next(row for row in device_templates if row["version"] == "2.0")["is_active"] is True
    assert next(row for row in device_templates if row["version"] == "1.0")["is_active"] is False


def test_device_bom_template_can_be_cloned_with_all_items():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        required_part_number="PCB-CTRL-001",
        required_revision="B",
    )
    extra_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "required_drawing_number": "DWG-FAN-010",
            "required_drawing_revision": "03",
            "quantity_required": 2,
            "is_required": True,
        },
    )
    assert extra_item.status_code == 200

    cloned = client.post(
        f"/api/device-bom-templates/{device_type}/clone",
        json={
            "source_version": "1.0",
            "target_version": "1.1",
            "name": "Cloned BOM",
            "activate": False,
        },
    )
    assert cloned.status_code == 200
    assert cloned.json()["version"] == "1.1"
    assert cloned.json()["name"] == "Cloned BOM"
    assert cloned.json()["status"] == "INACTIVE"
    assert cloned.json()["is_active"] is False

    cloned_items = client.get(f"/api/device-bom-templates/{device_type}/items?version=1.1")
    assert cloned_items.status_code == 200
    cloned_rows = {row["component_type"]: row for row in cloned_items.json()}
    assert set(cloned_rows) == {"CONTROL_PCB", "FAN_MODULE"}
    assert cloned_rows["CONTROL_PCB"]["required_part_number"] == "PCB-CTRL-001"
    assert cloned_rows["CONTROL_PCB"]["required_revision"] == "B"
    assert cloned_rows["FAN_MODULE"]["required_drawing_number"] == "DWG-FAN-010"
    assert cloned_rows["FAN_MODULE"]["required_drawing_revision"] == "03"
    assert cloned_rows["FAN_MODULE"]["quantity_required"] == 2


def test_cloned_bom_template_can_be_activated_immediately():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    cloned = client.post(
        f"/api/device-bom-templates/{device_type}/clone",
        json={
            "source_version": "1.0",
            "target_version": "2.0",
            "activate": True,
        },
    )
    assert cloned.status_code == 200
    assert cloned.json()["version"] == "2.0"
    assert cloned.json()["status"] == "ACTIVE"
    assert cloned.json()["is_active"] is True

    templates = client.get("/api/device-bom-templates")
    assert templates.status_code == 200
    device_templates = [row for row in templates.json() if row["device_type"] == device_type]
    assert len(device_templates) == 2
    assert next(row for row in device_templates if row["version"] == "2.0")["status"] == "ACTIVE"
    assert next(row for row in device_templates if row["version"] == "1.0")["status"] == "INACTIVE"


def test_device_bom_template_can_be_retired_and_cannot_be_reactivated():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        version="2.0",
        is_active=False,
    )

    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire",
        json={"version": "1.0", "reason": "Obsolete revision"},
    )
    assert retired.status_code == 200
    assert retired.json()["version"] == "1.0"
    assert retired.json()["status"] == "RETIRED"
    assert retired.json()["is_active"] is False

    activate_retired = client.post(
        f"/api/device-bom-templates/{device_type}/activate",
        json={"version": "1.0"},
    )
    assert activate_retired.status_code == 400
    assert activate_retired.json()["detail"] == "Retired BOM template cannot be activated"

    templates = client.get("/api/device-bom-templates")
    assert templates.status_code == 200
    retired_template = next(
        row
        for row in templates.json()
        if row["device_type"] == device_type and row["version"] == "1.0"
    )
    assert retired_template["status"] == "RETIRED"
    assert retired_template["is_active"] is False


def test_retired_bom_template_cannot_be_modified():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire",
        json={"version": "1.0", "reason": "Frozen for audit"},
    )
    assert retired.status_code == 200

    add_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert add_item.status_code == 400
    assert add_item.json()["detail"] == "Retired BOM template cannot be modified"


def test_device_bom_audit_events_are_recorded():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        version="2.0",
        is_active=False,
    )

    activated = client.post(
        f"/api/device-bom-templates/{device_type}/activate",
        json={"version": "2.0"},
    )
    assert activated.status_code == 200

    template_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_TEMPLATE")
    assert template_audit.status_code == 200
    template_events = [
        row for row in template_audit.json() if row["payload"] and row["payload"].get("device_type") == device_type
    ]
    template_markers = {
        (row["event_type"], row["payload"].get("version"))
        for row in template_events
        if row["payload"]
    }
    assert ("DEVICE_BOM_TEMPLATE_CREATED", "1.0") in template_markers
    assert ("DEVICE_BOM_TEMPLATE_CREATED", "2.0") in template_markers
    assert ("DEVICE_BOM_TEMPLATE_ACTIVATED", "1.0") in template_markers
    assert ("DEVICE_BOM_TEMPLATE_ACTIVATED", "2.0") in template_markers
    assert ("DEVICE_BOM_TEMPLATE_DEACTIVATED", "1.0") in template_markers

    item_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_ITEM")
    assert item_audit.status_code == 200
    item_events = [
        row for row in item_audit.json() if row["payload"] and row["payload"].get("device_type") == device_type
    ]
    item_markers = {
        (row["event_type"], row["payload"].get("version"), row["payload"].get("component_type"))
        for row in item_events
        if row["payload"]
    }
    assert ("DEVICE_BOM_ITEM_ADDED", "1.0", "CONTROL_PCB") in item_markers
    assert ("DEVICE_BOM_ITEM_ADDED", "2.0", "FAN_MODULE") in item_markers


def test_device_bom_retire_audit_event_is_recorded():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire",
        json={"version": "1.0", "reason": "Superseded BOM"},
    )
    assert retired.status_code == 200

    template_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_TEMPLATE")
    assert template_audit.status_code == 200
    retire_event = next(
        row
        for row in template_audit.json()
        if row["event_type"] == "DEVICE_BOM_TEMPLATE_RETIRED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("version") == "1.0"
    )
    assert retire_event["result"] == "RETIRED"
    assert retire_event["payload"]["reason"] == "Superseded BOM"


def test_device_bom_clone_audit_event_is_recorded():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    cloned = client.post(
        f"/api/device-bom-templates/{device_type}/clone",
        json={
            "source_version": "1.0",
            "target_version": "1.1",
            "activate": False,
        },
    )
    assert cloned.status_code == 200

    template_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_TEMPLATE")
    assert template_audit.status_code == 200
    clone_event = next(
        row
        for row in template_audit.json()
        if row["event_type"] == "DEVICE_BOM_TEMPLATE_CLONED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("source_version") == "1.0"
        and row["payload"].get("target_version") == "1.1"
    )
    assert clone_event["result"] == "INACTIVE"
    assert clone_event["payload"]["copied_item_count"] == 1


def test_device_bom_item_can_store_part_number_and_revision_rules():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="3.0",
        required_part_number="PCB-CTRL-001",
        required_revision="B",
        required_drawing_number="DWG-CTRL-100",
        required_drawing_revision="02",
    )

    listed_items = client.get(f"/api/device-bom-templates/{device_type}/items?version=3.0")
    assert listed_items.status_code == 200
    assert len(listed_items.json()) == 1
    assert listed_items.json()[0]["required_part_number"] == "PCB-CTRL-001"
    assert listed_items.json()[0]["required_revision"] == "B"
    assert listed_items.json()[0]["required_drawing_number"] == "DWG-CTRL-100"
    assert listed_items.json()[0]["required_drawing_revision"] == "02"


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


def test_assembly_scan_installs_component_and_blocks_duplicate_use():
    ensure_device_bom_template("ZSS")
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("ZSS")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": "ZSS"},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    item_serial_number = item["item_serial_number"]
    barcode_value = item["barcode_value"]

    install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": barcode_value,
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert install.status_code == 200
    assert install.json()["parent_device_serial_number"] == device_serial_number
    assert install.json()["child_item_serial_number"] == item_serial_number
    assert install.json()["status"] == "INSTALLED"

    item = client.get(f"/api/production-items/{item_serial_number}")
    assert item.status_code == 200
    assert item.json()["current_status"] == "INSTALLED"

    tree = client.get(f"/api/devices/{device_serial_number}/assembly-tree")
    assert tree.status_code == 200
    assert len(tree.json()) == 1
    assert tree.json()[0]["child_barcode_value"] == barcode_value

    duplicate = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": barcode_value,
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Component already installed in another device"


def test_assembly_scan_blocks_component_type_not_in_active_bom():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type=device_type, component_type="CONTROL_PCB")
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="FAN_MODULE")
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Component type is not allowed by device BOM"


def test_assembly_scan_blocks_item_type_mismatch():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type=device_type, component_type="CONTROL_PCB")
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="SENSOR_MODULE")
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Scanned item type does not match requested component type"


def test_assembly_scan_blocks_component_count_above_bom_quantity():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        quantity_required=1,
    )
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    first_item = create_qc_passed_item(session, item_type="FAN_MODULE")
    second_item = create_qc_passed_item(session, item_type="FAN_MODULE")

    first_install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": first_item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": session["work_session_id"],
        },
    )
    assert first_install.status_code == 200

    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": second_item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "Device BOM quantity already satisfied for component type"


def test_assembly_scan_blocks_part_number_mismatch():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        required_part_number="PCB-CTRL-001",
    )
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(
        session,
        item_type="CONTROL_PCB",
        part_number="PCB-CTRL-999",
    )
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Scanned item part number does not match device BOM"


def test_assembly_scan_blocks_revision_mismatch():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        required_revision="B",
    )
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(
        session,
        item_type="CONTROL_PCB",
        revision="A",
    )
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Scanned item revision does not match device BOM"


def test_assembly_scan_accepts_matching_part_number_and_revision():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        required_part_number="PCB-CTRL-001",
        required_revision="B",
        required_drawing_number="DWG-CTRL-100",
        required_drawing_revision="02",
    )
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(
        session,
        item_type="CONTROL_PCB",
        part_number="PCB-CTRL-001",
        revision="B",
        drawing_number="DWG-CTRL-100",
        drawing_revision="02",
    )
    installed = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert installed.status_code == 200
    assert installed.json()["bom_version"] == "1.0"


def test_assembly_scan_blocks_drawing_number_mismatch():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        required_drawing_number="DWG-CTRL-100",
    )
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(
        session,
        item_type="CONTROL_PCB",
        drawing_number="DWG-CTRL-999",
    )
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Scanned item drawing number does not match device BOM"


def test_assembly_scan_blocks_drawing_revision_mismatch():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        required_drawing_revision="02",
    )
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(
        session,
        item_type="CONTROL_PCB",
        drawing_revision="01",
    )
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Scanned item drawing revision does not match device BOM"


def test_assembly_scan_blocks_when_device_type_has_no_active_bom():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )
    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire",
        json={"version": "1.0", "reason": "Pending successor"},
    )
    assert retired.status_code == 200

    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")
    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "No active BOM template available for device type"


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
    ensure_device_bom_template("ZSS")
    device_serial_number = unique_id("ZSS")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": "ZSS"},
    )
    assert device_response.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

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


def test_shipment_is_blocked_when_required_component_is_missing():
    ensure_device_bom_template("ZSS")
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

    response = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == (
        "READY_FOR_SHIPMENT requires installed components: CONTROL_PCB"
    )


def test_shipment_reads_bom_requirements_from_database():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        quantity_required=2,
    )
    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert device_response.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    first_item = create_qc_passed_item(production_session, item_type="FAN_MODULE")
    second_item = create_qc_passed_item(production_session, item_type="FAN_MODULE")

    first_install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": first_item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert first_install.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    blocked = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == (
        "READY_FOR_SHIPMENT requires installed components: FAN_MODULE x2"
    )

    second_install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": second_item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert second_install.status_code == 200

    ready = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert ready.status_code == 200
    assert ready.json()["production_status"] == "READY_FOR_SHIPMENT"


def test_shipment_blocks_when_device_type_has_no_active_bom():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )
    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire",
        json={"version": "1.0", "reason": "Pending successor"},
    )
    assert retired.status_code == 200

    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert device_response.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    blocked = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "READY_FOR_SHIPMENT requires an active BOM template"


def test_shipment_uses_bound_bom_even_after_template_retirement():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert device_response.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200
    assert install.json()["bom_version"] == "1.0"

    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire",
        json={"version": "1.0", "reason": "Superseded after build start"},
    )
    assert retired.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    ready = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert ready.status_code == 200
    assert ready.json()["production_status"] == "READY_FOR_SHIPMENT"


def test_device_keeps_bound_bom_version_after_new_version_activation():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        quantity_required=2,
        version="1.0",
        is_active=True,
    )
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        quantity_required=1,
        version="2.0",
        is_active=False,
    )

    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert device_response.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    first_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    second_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")

    first_install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": first_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert first_install.status_code == 200
    assert first_install.json()["bom_version"] == "1.0"

    activate_new_version = client.post(
        f"/api/device-bom-templates/{device_type}/activate",
        json={"version": "2.0"},
    )
    assert activate_new_version.status_code == 200
    assert activate_new_version.json()["version"] == "2.0"

    second_install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": second_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert second_install.status_code == 200
    assert second_install.json()["bom_version"] == "1.0"

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    ready = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert ready.status_code == 200
    assert ready.json()["production_status"] == "READY_FOR_SHIPMENT"


def test_final_test_fail_sets_device_status_and_creates_ncr():
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
            "result": "FAIL",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": session["work_session_id"],
        },
    )
    assert final_test_response.status_code == 200
    assert final_test_response.json()["result"] == "FAIL"

    device = client.get(f"/api/devices/{device_serial_number}")
    assert device.status_code == 200
    assert device.json()["production_status"] == "FINAL_TEST_FAILED"

    ncr = client.get(f"/api/nonconformities/{'NCR-' + test_run_id}")
    assert ncr.status_code == 200
    assert ncr.json()["device_serial_number"] == device_serial_number
    assert ncr.json()["severity"] == "CRITICAL"


def test_service_session_upload_list_and_download(tmp_path, monkeypatch):
    import app.services.files as file_storage

    monkeypatch.setattr(file_storage, "STORAGE_DIR", tmp_path)

    session_id = unique_id("SVC")
    upload = client.post(
        "/api/service-sessions/upload",
        data={
            "session_id": session_id,
            "device_serial_number": unique_id("ZSS"),
            "technician_id": "TECH-001",
            "device_type": "ZSS",
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
        },
        files={"file": ("service-package.zip", b"service-package-content", "application/zip")},
    )
    assert upload.status_code == 200
    payload = upload.json()
    assert payload["session_id"] == session_id
    assert payload["upload_status"] == "UPLOADED"
    assert payload["package_hash"]

    listed = client.get("/api/service-sessions")
    assert listed.status_code == 200
    assert any(row["session_id"] == session_id for row in listed.json())

    fetched = client.get(f"/api/service-sessions/{session_id}")
    assert fetched.status_code == 200
    assert fetched.json()["technician_id"] == "TECH-001"

    package_download = client.get(f"/api/service-sessions/{session_id}/package")
    assert package_download.status_code == 200
    assert package_download.content == b"service-package-content"


def test_file_upload_and_download(tmp_path, monkeypatch):
    import app.services.files as file_storage

    monkeypatch.setattr(file_storage, "STORAGE_DIR", tmp_path)

    upload = client.post(
        "/api/files/upload",
        data={
            "related_entity_type": "DEVICE",
            "related_entity_id": unique_id("ZSS"),
            "uploaded_by": "pytest",
        },
        files={"file": ("report.txt", b"traceability-report", "text/plain")},
    )
    assert upload.status_code == 200
    stored = upload.json()
    assert stored["file_name"] == "report.txt"
    assert stored["uploaded_by"] == "pytest"
    assert stored["file_hash"]

    downloaded = client.get(f"/api/files/{stored['id']}")
    assert downloaded.status_code == 200
    assert downloaded.content == b"traceability-report"


def test_manual_ncr_create_update_and_close():
    ncr_id = unique_id("NCR")
    created = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": ncr_id,
            "device_serial_number": unique_id("ZSS"),
            "process_stage": "MANUAL_REVIEW",
            "description": "Manual NCR for regression test",
            "severity": "MEDIUM",
            "detected_by": "pytest",
        },
    )
    assert created.status_code == 200
    assert created.json()["status"] == "OPEN"

    updated = client.patch(
        f"/api/nonconformities/{ncr_id}",
        json={"status": "CLOSED", "corrective_action": "Verified and closed"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "CLOSED"
    assert updated.json()["corrective_action"] == "Verified and closed"
    assert updated.json()["closed_at"] is not None

    fetched = client.get(f"/api/nonconformities/{ncr_id}")
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "CLOSED"
