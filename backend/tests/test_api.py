from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import SessionLocal, utc_now
from app.main import app
from app.models import AssemblyLink, Device, DeviceBomTemplate, WorkSession
from app.services.demo_seed import seed_operations_dashboard_demo

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
    variant_code: str = "DEFAULT",
    effective_from: str | None = None,
    effective_to: str | None = None,
    substitution_group: str | None = None,
    required_part_number: str | None = None,
    required_revision: str | None = None,
    required_drawing_number: str | None = None,
    required_drawing_revision: str | None = None,
    approved_by: str = "PYTEST-APPROVER",
) -> None:
    template_response = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "variant_code": variant_code,
            "name": f"{device_type} Default BOM",
            "version": version,
            "is_active": False,
            "effective_from": effective_from,
            "effective_to": effective_to,
        },
    )
    assert template_response.status_code in {200, 409}

    item_response = client.post(
        f"/api/device-bom-templates/{device_type}/items?version={version}&variant_code={variant_code}",
        json={
            "component_type": component_type,
            "substitution_group": substitution_group,
            "required_part_number": required_part_number,
            "required_revision": required_revision,
            "required_drawing_number": required_drawing_number,
            "required_drawing_revision": required_drawing_revision,
            "quantity_required": quantity_required,
            "is_required": True,
        },
    )
    assert item_response.status_code in {200, 409}

    if is_active and template_response.status_code == 200:
        release_response = client.post(
            f"/api/device-bom-templates/{device_type}/release?variant_code={variant_code}",
            json={
                "version": version,
                "approved_by": approved_by,
                "release_note": "Pytest auto release",
            },
        )
        assert release_response.status_code == 200


def release_device_bom_template(
    device_type: str,
    version: str = "1.0",
    variant_code: str = "DEFAULT",
    approved_by: str = "PYTEST-APPROVER",
    release_note: str = "Pytest auto release",
) -> None:
    release_response = client.post(
        f"/api/device-bom-templates/{device_type}/release?variant_code={variant_code}",
        json={
            "version": version,
            "approved_by": approved_by,
            "release_note": release_note,
        },
    )
    assert release_response.status_code == 200


def create_device_bom_template_with_items(
    device_type: str,
    *,
    version: str = "1.0",
    variant_code: str = "DEFAULT",
    items: list[dict],
) -> None:
    template_response = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "variant_code": variant_code,
            "name": f"{device_type} BOM",
            "version": version,
            "is_active": False,
        },
    )
    assert template_response.status_code in {200, 409}

    for item in items:
        item_response = client.post(
            f"/api/device-bom-templates/{device_type}/items?version={version}&variant_code={variant_code}",
            json=item,
        )
        assert item_response.status_code in {200, 409}

    release_device_bom_template(
        device_type=device_type,
        version=version,
        variant_code=variant_code,
    )


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_device_lifecycle():
    serial_number = unique_id("ZSS")
    payload = {
        "device_serial_number": serial_number,
        "device_type": "ZSS",
        "variant_code": "DEFAULT",
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


def test_device_bom_resolution_reports_no_template_configuration():
    device_serial_number = unique_id("DEV")
    device_type = unique_id("DT")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert created.status_code == 200

    resolution = client.get(f"/api/devices/{device_serial_number}/bom-resolution")
    assert resolution.status_code == 200
    payload = resolution.json()
    assert payload["resolution_source"] == "NO_TEMPLATE_CONFIGURED"
    assert payload["resolved_template_id"] is None
    assert payload["blocks_assembly"] is False
    assert payload["blocks_shipment"] is False
    assert payload["blocking_reason"] is None
    assert payload["has_variant_templates"] is False
    assert payload["has_default_templates"] is False


def test_device_bom_resolution_prefers_active_variant_template():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
    )
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        version="2.0",
        is_active=True,
        variant_code="PREMIUM",
    )

    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={
            "device_serial_number": device_serial_number,
            "device_type": device_type,
            "variant_code": "PREMIUM",
        },
    )
    assert created.status_code == 200

    resolution = client.get(f"/api/devices/{device_serial_number}/bom-resolution")
    assert resolution.status_code == 200
    payload = resolution.json()
    assert payload["resolution_source"] == "ACTIVE_VARIANT"
    assert payload["resolved_variant_code"] == "PREMIUM"
    assert payload["resolved_version"] == "2.0"
    assert payload["is_default_fallback"] is False
    assert payload["blocks_assembly"] is False
    assert payload["blocks_shipment"] is False


def test_device_bom_resolution_falls_back_to_default_template():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
    )

    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={
            "device_serial_number": device_serial_number,
            "device_type": device_type,
            "variant_code": "PREMIUM",
        },
    )
    assert created.status_code == 200

    resolution = client.get(f"/api/devices/{device_serial_number}/bom-resolution")
    assert resolution.status_code == 200
    payload = resolution.json()
    assert payload["resolution_source"] == "ACTIVE_DEFAULT_FALLBACK"
    assert payload["resolved_variant_code"] == "DEFAULT"
    assert payload["resolved_version"] == "1.0"
    assert payload["is_default_fallback"] is True
    assert payload["has_variant_templates"] is False
    assert payload["has_default_templates"] is True


def test_device_bom_resolution_reports_bound_template_after_retirement():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
    )

    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert created.status_code == 200

    session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    installed = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert installed.status_code == 200

    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire",
        json={"version": "1.0", "reason": "Superseded after build start"},
    )
    assert retired.status_code == 200

    resolution = client.get(f"/api/devices/{device_serial_number}/bom-resolution")
    assert resolution.status_code == 200
    payload = resolution.json()
    assert payload["resolution_source"] == "BOUND_TEMPLATE"
    assert payload["resolved_version"] == "1.0"
    assert payload["resolved_status"] == "RETIRED"
    assert payload["is_bound_template"] is True
    assert payload["blocks_assembly"] is False
    assert payload["blocks_shipment"] is False


def test_device_bom_resolution_reports_missing_active_effective_template():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        effective_from=(utc_now() + timedelta(days=1)).isoformat(),
    )

    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert created.status_code == 200

    resolution = client.get(f"/api/devices/{device_serial_number}/bom-resolution")
    assert resolution.status_code == 200
    payload = resolution.json()
    assert payload["resolution_source"] == "NO_ACTIVE_EFFECTIVE_TEMPLATE"
    assert payload["resolved_template_id"] is None
    assert payload["blocks_assembly"] is True
    assert payload["blocks_shipment"] is True
    assert payload["blocking_reason"] == "No active effective BOM template available for device type"
    assert payload["has_variant_templates"] is True


def test_device_bom_compliance_passes_when_no_template_is_configured():
    device_serial_number = unique_id("DEV")
    device_type = unique_id("DT")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert created.status_code == 200

    compliance = client.get(f"/api/devices/{device_serial_number}/bom-compliance")
    assert compliance.status_code == 200
    payload = compliance.json()
    assert payload["resolution_source"] == "NO_TEMPLATE_CONFIGURED"
    assert payload["is_bom_resolved"] is False
    assert payload["passes_bom_gate"] is True
    assert payload["installed_component_count"] == 0
    assert payload["component_coverage"] == []


def test_device_bom_compliance_reports_missing_required_components():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        quantity_required=2,
        version="1.0",
        is_active=True,
    )

    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert created.status_code == 200

    session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    installed = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert installed.status_code == 200

    compliance = client.get(f"/api/devices/{device_serial_number}/bom-compliance")
    assert compliance.status_code == 200
    payload = compliance.json()
    assert payload["resolution_source"] == "BOUND_TEMPLATE"
    assert payload["passes_bom_gate"] is False
    assert payload["missing_required_components"] == ["CONTROL_PCB x2"]
    assert payload["over_installed_components"] == []
    assert payload["unexpected_component_types"] == []
    control_row = next(
        component
        for component in payload["component_coverage"]
        if component["component_type"] == "CONTROL_PCB"
    )
    assert control_row["status"] == "MISSING"
    assert control_row["installed_quantity"] == 1


def test_device_bom_compliance_reports_default_fallback_when_compliant():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
    )

    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={
            "device_serial_number": device_serial_number,
            "device_type": device_type,
            "variant_code": "PREMIUM",
        },
    )
    assert created.status_code == 200

    session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    installed = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert installed.status_code == 200

    compliance = client.get(f"/api/devices/{device_serial_number}/bom-compliance")
    assert compliance.status_code == 200
    payload = compliance.json()
    assert payload["resolution_source"] == "BOUND_TEMPLATE"
    assert payload["resolved_variant_code"] == "DEFAULT"
    assert payload["passes_bom_gate"] is True
    assert payload["missing_required_components"] == []
    assert payload["over_installed_components"] == []
    assert payload["unexpected_component_types"] == []


def test_device_bom_compliance_and_coverage_report_over_installed_components():
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
    first_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    first_install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": first_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert first_install.status_code == 200

    db = SessionLocal()
    try:
        template = (
            db.query(DeviceBomTemplate)
            .filter(
                DeviceBomTemplate.device_type == device_type,
                DeviceBomTemplate.variant_code == "DEFAULT",
                DeviceBomTemplate.version == "1.0",
            )
            .first()
        )
        assert template is not None
        db.add(
            AssemblyLink(
                parent_device_serial_number=device_serial_number,
                child_item_serial_number=unique_id("ITEM"),
                child_barcode_value=unique_id("BC"),
                component_type="CONTROL_PCB",
                installed_by="pytest",
                installed_at=utc_now(),
                bom_template_id=template.id,
                bom_version=template.version,
                scan_event_id=unique_id("SCAN"),
                status="INSTALLED",
            )
        )
        db.commit()
    finally:
        db.close()

    compliance = client.get(f"/api/devices/{device_serial_number}/bom-compliance")
    assert compliance.status_code == 200
    payload = compliance.json()
    assert payload["passes_bom_gate"] is False
    assert payload["over_installed_components"] == ["CONTROL_PCB x2/1"]
    control_row = next(
        component
        for component in payload["component_coverage"]
        if component["component_type"] == "CONTROL_PCB"
    )
    assert control_row["status"] == "OVER_INSTALLED"

    coverage = client.get(f"/api/device-bom-templates/{device_type}/coverage?version=1.0")
    assert coverage.status_code == 200
    row = next(entry for entry in coverage.json() if entry["device_serial_number"] == device_serial_number)
    assert row["is_complete"] is False
    assert row["over_installed_components"] == ["CONTROL_PCB x2/1"]


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
            "is_active": False,
        },
    )
    assert created.status_code == 200
    template = created.json()
    assert template["device_type"] == device_type
    assert template["version"] == "2.0"
    assert template["status"] == "INACTIVE"
    assert template["is_active"] is False

    bom_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=2.0",
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


def test_device_bom_template_rejects_invalid_version_format():
    device_type = unique_id("DT")
    created = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "name": "Invalid Version BOM",
            "version": "v1-beta",
            "is_active": False,
        },
    )
    assert created.status_code == 422


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
    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "2.0", "approved_by": "PYTEST-QA"},
    )
    assert approved.status_code == 200

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
    assert next(row for row in device_templates if row["version"] == "1.0")["status"] == "APPROVED"
    assert next(row for row in device_templates if row["version"] == "2.0")["is_active"] is True
    assert next(row for row in device_templates if row["version"] == "1.0")["is_active"] is False


def test_device_bom_template_usage_reports_active_template_as_clone_or_promote():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    usage = client.get(f"/api/device-bom-templates/{device_type}/usage?version=1.0")
    assert usage.status_code == 200
    payload = usage.json()
    assert payload["device_type"] == device_type
    assert payload["version"] == "1.0"
    assert payload["status"] == "ACTIVE"
    assert payload["bound_device_count"] == 0
    assert payload["is_bound"] is False
    assert payload["can_modify"] is False
    assert payload["recommended_action"] == "clone_or_promote"


def test_device_bom_template_readiness_reports_empty_template_as_blocked():
    device_type = unique_id("DT")
    created = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "name": "Empty BOM",
            "version": "1.0",
            "is_active": False,
        },
    )
    assert created.status_code == 200

    readiness = client.get(f"/api/device-bom-templates/{device_type}/readiness?version=1.0")
    assert readiness.status_code == 200
    payload = readiness.json()
    assert payload["item_count"] == 0
    assert payload["required_item_count"] == 0
    assert payload["has_any_items"] is False
    assert payload["can_activate"] is False
    assert payload["blocking_reasons"] == [
        "BOM template has no items",
        "BOM template has no required items",
        "BOM template is not approved",
    ]


def test_device_bom_template_activation_requires_required_items():
    device_type = unique_id("DT")
    created = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "name": "Optional Only BOM",
            "version": "1.0",
            "is_active": False,
        },
    )
    assert created.status_code == 200

    added = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": False,
        },
    )
    assert added.status_code == 200
    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "1.0", "approved_by": "PYTEST-QA"},
    )
    assert approved.status_code == 400
    assert approved.json()["detail"] == (
        "BOM template is not ready for approval: BOM template has no required items"
    )


def test_device_bom_template_bindings_list_bound_devices():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
    )
    extra_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": False,
        },
    )
    assert extra_item.status_code == 200
    release_device_bom_template(device_type=device_type, version="1.0")

    first_device_serial_number = unique_id("DEV")
    second_device_serial_number = unique_id("DEV")
    first_device = client.post(
        "/api/devices",
        json={"device_serial_number": first_device_serial_number, "device_type": device_type},
    )
    assert first_device.status_code == 200
    second_device = client.post(
        "/api/devices",
        json={"device_serial_number": second_device_serial_number, "device_type": device_type},
    )
    assert second_device.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    first_control_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    first_fan_item = create_qc_passed_item(production_session, item_type="FAN_MODULE")
    second_control_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")

    first_install = client.post(
        f"/api/devices/{first_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": first_control_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert first_install.status_code == 200

    second_install = client.post(
        f"/api/devices/{first_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": first_fan_item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert second_install.status_code == 200

    third_install = client.post(
        f"/api/devices/{second_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": second_control_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert third_install.status_code == 200

    bindings = client.get(f"/api/device-bom-templates/{device_type}/bindings?version=1.0")
    assert bindings.status_code == 200
    payload = bindings.json()
    assert len(payload) == 2

    rows = {row["device_serial_number"]: row for row in payload}
    assert rows[first_device_serial_number]["device_type"] == device_type
    assert rows[first_device_serial_number]["device_variant_code"] == "DEFAULT"
    assert rows[first_device_serial_number]["bom_variant_code"] == "DEFAULT"
    assert rows[first_device_serial_number]["bom_version"] == "1.0"
    assert rows[first_device_serial_number]["installed_component_count"] == 2
    assert rows[first_device_serial_number]["production_status"] == "CREATED"
    assert rows[first_device_serial_number]["first_bound_at"] is not None
    assert rows[second_device_serial_number]["installed_component_count"] == 1


def test_device_bom_template_coverage_reports_complete_and_incomplete_devices():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        quantity_required=2,
        version="1.0",
        is_active=False,
    )
    optional_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": False,
        },
    )
    assert optional_item.status_code == 200
    release_device_bom_template(device_type=device_type, version="1.0")

    incomplete_device_serial_number = unique_id("DEV")
    complete_device_serial_number = unique_id("DEV")
    incomplete_device = client.post(
        "/api/devices",
        json={"device_serial_number": incomplete_device_serial_number, "device_type": device_type},
    )
    assert incomplete_device.status_code == 200
    complete_device = client.post(
        "/api/devices",
        json={"device_serial_number": complete_device_serial_number, "device_type": device_type},
    )
    assert complete_device.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    incomplete_first_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    complete_first_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    complete_second_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    complete_optional_item = create_qc_passed_item(production_session, item_type="FAN_MODULE")

    incomplete_install = client.post(
        f"/api/devices/{incomplete_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": incomplete_first_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert incomplete_install.status_code == 200

    complete_install_first = client.post(
        f"/api/devices/{complete_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": complete_first_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert complete_install_first.status_code == 200

    complete_install_second = client.post(
        f"/api/devices/{complete_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": complete_second_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert complete_install_second.status_code == 200

    complete_optional_install = client.post(
        f"/api/devices/{complete_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": complete_optional_item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert complete_optional_install.status_code == 200

    coverage = client.get(f"/api/device-bom-templates/{device_type}/coverage?version=1.0")
    assert coverage.status_code == 200
    payload = coverage.json()
    assert len(payload) == 2

    rows = {row["device_serial_number"]: row for row in payload}

    incomplete_row = rows[incomplete_device_serial_number]
    assert incomplete_row["is_complete"] is False
    assert incomplete_row["device_variant_code"] == "DEFAULT"
    assert incomplete_row["bom_variant_code"] == "DEFAULT"
    assert incomplete_row["missing_required_components"] == ["CONTROL_PCB x2"]
    incomplete_components = {
        row["component_type"]: row for row in incomplete_row["component_coverage"]
    }
    assert incomplete_components["CONTROL_PCB"]["installed_quantity"] == 1
    assert incomplete_components["CONTROL_PCB"]["status"] == "MISSING"
    assert incomplete_components["FAN_MODULE"]["status"] == "OPTIONAL_MISSING"

    complete_row = rows[complete_device_serial_number]
    assert complete_row["is_complete"] is True
    assert complete_row["missing_required_components"] == []
    complete_components = {
        row["component_type"]: row for row in complete_row["component_coverage"]
    }
    assert complete_components["CONTROL_PCB"]["installed_quantity"] == 2
    assert complete_components["CONTROL_PCB"]["status"] == "SATISFIED"
    assert complete_components["FAN_MODULE"]["installed_quantity"] == 1
    assert complete_components["FAN_MODULE"]["status"] == "OPTIONAL_PRESENT"


def test_variant_specific_bom_overrides_default_variant():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
    )
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        version="1.0",
        is_active=True,
        variant_code="PREMIUM",
    )

    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={
            "device_serial_number": device_serial_number,
            "device_type": device_type,
            "variant_code": "PREMIUM",
        },
    )
    assert device_response.status_code == 200
    assert device_response.json()["variant_code"] == "PREMIUM"

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    premium_item = create_qc_passed_item(production_session, item_type="FAN_MODULE")
    install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": premium_item["barcode_value"],
            "component_type": "FAN_MODULE",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200
    assert install.json()["bom_version"] == "1.0"

    default_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": default_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Component type is not allowed by device BOM"


def test_variant_device_falls_back_to_default_bom_when_specific_variant_is_missing():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
    )

    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={
            "device_serial_number": device_serial_number,
            "device_type": device_type,
            "variant_code": "PREMIUM",
        },
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

    bindings = client.get(
        f"/api/device-bom-templates/{device_type}/bindings?version=1.0&variant_code=DEFAULT"
    )
    assert bindings.status_code == 200
    rows = {row["device_serial_number"]: row for row in bindings.json()}
    assert rows[device_serial_number]["device_variant_code"] == "PREMIUM"
    assert rows[device_serial_number]["bom_variant_code"] == "DEFAULT"


def test_future_effective_bom_reports_not_effective_yet():
    device_type = unique_id("DT")
    effective_from = (utc_now() + timedelta(days=1)).isoformat()
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
        effective_from=effective_from,
    )

    usage = client.get(
        f"/api/device-bom-templates/{device_type}/usage?version=1.0&variant_code=DEFAULT"
    )
    assert usage.status_code == 200
    usage_payload = usage.json()
    assert usage_payload["is_effective_now"] is False
    assert usage_payload["effective_from"] is not None
    assert usage_payload["effective_to"] is None

    readiness = client.get(
        f"/api/device-bom-templates/{device_type}/readiness?version=1.0&variant_code=DEFAULT"
    )
    assert readiness.status_code == 200
    readiness_payload = readiness.json()
    assert readiness_payload["is_effective_now"] is False
    assert readiness_payload["can_activate"] is True


def test_variant_device_falls_back_to_default_bom_when_specific_variant_is_not_effective_yet():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        variant_code="DEFAULT",
    )
    ensure_device_bom_template(
        device_type=device_type,
        component_type="FAN_MODULE",
        version="1.0",
        is_active=True,
        variant_code="PREMIUM",
        effective_from=(utc_now() + timedelta(days=1)).isoformat(),
    )

    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={
            "device_serial_number": device_serial_number,
            "device_type": device_type,
            "variant_code": "PREMIUM",
        },
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

    bindings = client.get(
        f"/api/device-bom-templates/{device_type}/bindings?version=1.0&variant_code=DEFAULT"
    )
    assert bindings.status_code == 200
    rows = {row["device_serial_number"]: row for row in bindings.json()}
    assert rows[device_serial_number]["device_variant_code"] == "PREMIUM"
    assert rows[device_serial_number]["bom_variant_code"] == "DEFAULT"


def test_substitution_group_allows_one_of_alternative_components():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB_A",
        substitution_group="CONTROL_PCB_SLOT",
        quantity_required=1,
        version="1.0",
        is_active=False,
    )
    alternative_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "CONTROL_PCB_B",
            "substitution_group": "CONTROL_PCB_SLOT",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert alternative_item.status_code == 200
    release_device_bom_template(device_type=device_type, version="1.0")

    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert created.status_code == 200

    item = create_qc_passed_item(session, item_type="CONTROL_PCB_B")
    install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB_B",
            "work_session_id": session["work_session_id"],
        },
    )
    assert install.status_code == 200

    coverage = client.get(f"/api/device-bom-templates/{device_type}/coverage?version=1.0")
    assert coverage.status_code == 200
    row = next(entry for entry in coverage.json() if entry["device_serial_number"] == device_serial_number)
    assert row["is_complete"] is True
    group_row = next(
        component
        for component in row["component_coverage"]
        if component["substitution_group"] == "CONTROL_PCB_SLOT"
    )
    assert sorted(group_row["allowed_component_types"]) == ["CONTROL_PCB_A", "CONTROL_PCB_B"]
    assert group_row["installed_quantity"] == 1
    assert group_row["status"] == "SATISFIED"


def test_substitution_group_blocks_second_alternative_after_slot_is_satisfied():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB_A",
        substitution_group="CONTROL_PCB_SLOT",
        quantity_required=1,
        version="1.0",
        is_active=False,
    )
    alternative_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "CONTROL_PCB_B",
            "substitution_group": "CONTROL_PCB_SLOT",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert alternative_item.status_code == 200
    release_device_bom_template(device_type=device_type, version="1.0")

    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")
    created = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert created.status_code == 200

    first_item = create_qc_passed_item(session, item_type="CONTROL_PCB_A")
    first_install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": first_item["barcode_value"],
            "component_type": "CONTROL_PCB_A",
            "work_session_id": session["work_session_id"],
        },
    )
    assert first_install.status_code == 200

    second_item = create_qc_passed_item(session, item_type="CONTROL_PCB_B")
    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": second_item["barcode_value"],
            "component_type": "CONTROL_PCB_B",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == (
        "Device BOM quantity already satisfied for substitution group CONTROL_PCB_SLOT"
    )


def test_device_bom_template_can_be_approved_with_release_metadata():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={
            "version": "1.0",
            "approved_by": "QA-LEAD",
            "release_note": "Checked for pilot release",
        },
    )
    assert approved.status_code == 200
    payload = approved.json()
    assert payload["status"] == "APPROVED"
    assert payload["approved_by"] == "QA-LEAD"
    assert payload["approved_at"] is not None
    assert payload["release_note"] == "Checked for pilot release"
    assert payload["is_active"] is False

    usage = client.get(
        f"/api/device-bom-templates/{device_type}/usage?version=1.0&variant_code=DEFAULT"
    )
    assert usage.status_code == 200
    assert usage.json()["status"] == "APPROVED"
    assert usage.json()["is_approved"] is True
    assert usage.json()["can_modify"] is True
    assert usage.json()["recommended_action"] == "activate_or_modify"


def test_empty_bom_template_cannot_be_approved():
    device_type = unique_id("DT")
    created = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "name": "Empty BOM",
            "version": "1.0",
            "is_active": False,
        },
    )
    assert created.status_code == 200

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert approved.status_code == 400
    assert approved.json()["detail"] == (
        "BOM template is not ready for approval: "
        "BOM template has no items; BOM template has no required items"
    )


def test_active_bom_template_cannot_be_approved_again():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert approved.status_code == 400
    assert approved.json()["detail"] == "Active BOM template cannot be approved again"


def test_approved_bom_template_cannot_be_approved_twice():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
    )

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert approved.status_code == 200

    approved_again = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert approved_again.status_code == 400
    assert approved_again.json()["detail"] == "BOM template is already approved"


def test_inactive_bom_template_approval_can_be_revoked_manually():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={
            "version": "1.0",
            "approved_by": "QA-LEAD",
            "release_note": "Ready before hold",
        },
    )
    assert approved.status_code == 200

    revoked = client.post(
        f"/api/device-bom-templates/{device_type}/revoke-approval?variant_code=DEFAULT",
        json={"version": "1.0", "reason": "Engineering hold"},
    )
    assert revoked.status_code == 200
    payload = revoked.json()
    assert payload["status"] == "INACTIVE"
    assert payload["approved_by"] is None
    assert payload["approved_at"] is None
    assert payload["release_note"] is None
    assert payload["is_active"] is False

    usage = client.get(
        f"/api/device-bom-templates/{device_type}/usage?version=1.0&variant_code=DEFAULT"
    )
    assert usage.status_code == 200
    assert usage.json()["is_approved"] is False

    readiness = client.get(
        f"/api/device-bom-templates/{device_type}/readiness?version=1.0&variant_code=DEFAULT"
    )
    assert readiness.status_code == 200
    assert "BOM template is not approved" in readiness.json()["blocking_reasons"]

    template_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_TEMPLATE")
    assert template_audit.status_code == 200
    revoke_event = next(
        row
        for row in template_audit.json()
        if row["event_type"] == "DEVICE_BOM_TEMPLATE_APPROVAL_REVOKED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("version") == "1.0"
    )
    assert revoke_event["payload"]["reason"] == "Engineering hold"
    assert revoke_event["payload"]["previous_approval"]["approved_by"] == "QA-LEAD"


def test_unapproved_bom_template_cannot_revoke_approval():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
    )

    revoked = client.post(
        f"/api/device-bom-templates/{device_type}/revoke-approval",
        json={"version": "1.0", "reason": "No-op"},
    )
    assert revoked.status_code == 400
    assert revoked.json()["detail"] == "BOM template is not approved"


def test_active_bom_template_cannot_revoke_approval():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    revoked = client.post(
        f"/api/device-bom-templates/{device_type}/revoke-approval",
        json={"version": "1.0", "reason": "Too late"},
    )
    assert revoked.status_code == 400
    assert revoked.json()["detail"] == "Active BOM template cannot have approval revoked"


def test_device_bom_template_can_be_released_and_activated():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )

    released = client.post(
        f"/api/device-bom-templates/{device_type}/release?variant_code=DEFAULT",
        json={
            "version": "1.0",
            "approved_by": "ENG-MFG",
            "release_note": "Approved for release line A",
        },
    )
    assert released.status_code == 200
    payload = released.json()
    assert payload["is_active"] is True
    assert payload["status"] == "ACTIVE"
    assert payload["approved_by"] == "ENG-MFG"
    assert payload["approved_at"] is not None
    assert payload["release_note"] == "Approved for release line A"

    readiness = client.get(
        f"/api/device-bom-templates/{device_type}/readiness?version=1.0&variant_code=DEFAULT"
    )
    assert readiness.status_code == 200
    assert readiness.json()["is_approved"] is True


def test_approved_bom_template_can_be_released_without_reapproval():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={
            "version": "1.0",
            "approved_by": "QA-LEAD",
            "release_note": "Reviewed before activation",
        },
    )
    assert approved.status_code == 200

    released = client.post(
        f"/api/device-bom-templates/{device_type}/release?variant_code=DEFAULT",
        json={"version": "1.0"},
    )
    assert released.status_code == 200
    payload = released.json()
    assert payload["status"] == "ACTIVE"
    assert payload["is_active"] is True
    assert payload["approved_by"] == "QA-LEAD"
    assert payload["release_note"] == "Reviewed before activation"


def test_unapproved_bom_template_release_requires_approved_by():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )

    released = client.post(
        f"/api/device-bom-templates/{device_type}/release?variant_code=DEFAULT",
        json={"version": "1.0"},
    )
    assert released.status_code == 400
    assert released.json()["detail"] == (
        "Release requires approved_by when BOM template is not yet approved"
    )


def test_release_rejects_conflicting_approved_by_for_approved_bom():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert approved.status_code == 200

    released = client.post(
        f"/api/device-bom-templates/{device_type}/release?variant_code=DEFAULT",
        json={"version": "1.0", "approved_by": "ENG-MFG"},
    )
    assert released.status_code == 400
    assert released.json()["detail"] == (
        "Release approved_by does not match existing BOM approval"
    )


def test_inactive_approved_bom_loses_approval_after_item_changes():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={
            "version": "1.0",
            "approved_by": "QA-LEAD",
            "release_note": "Approved before edits",
        },
    )
    assert approved.status_code == 200

    added = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0&variant_code=DEFAULT",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": False,
        },
    )
    assert added.status_code == 200

    usage_after_add = client.get(
        f"/api/device-bom-templates/{device_type}/usage?version=1.0&variant_code=DEFAULT"
    )
    assert usage_after_add.status_code == 200
    assert usage_after_add.json()["is_approved"] is False

    readiness_after_add = client.get(
        f"/api/device-bom-templates/{device_type}/readiness?version=1.0&variant_code=DEFAULT"
    )
    assert readiness_after_add.status_code == 200
    assert "BOM template is not approved" in readiness_after_add.json()["blocking_reasons"]

    reapproved = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert reapproved.status_code == 200

    updated = client.patch(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0&variant_code=DEFAULT",
        json={"quantity_required": 2},
    )
    assert updated.status_code == 200

    usage_after_update = client.get(
        f"/api/device-bom-templates/{device_type}/usage?version=1.0&variant_code=DEFAULT"
    )
    assert usage_after_update.status_code == 200
    assert usage_after_update.json()["is_approved"] is False

    reapproved_again = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert reapproved_again.status_code == 200

    removed = client.delete(
        f"/api/device-bom-templates/{device_type}/items/FAN_MODULE?version=1.0&variant_code=DEFAULT"
    )
    assert removed.status_code == 200

    usage_after_remove = client.get(
        f"/api/device-bom-templates/{device_type}/usage?version=1.0&variant_code=DEFAULT"
    )
    assert usage_after_remove.status_code == 200
    assert usage_after_remove.json()["is_approved"] is False

    template_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_TEMPLATE")
    assert template_audit.status_code == 200
    approval_cleared_events = [
        row
        for row in template_audit.json()
        if row["event_type"] == "DEVICE_BOM_TEMPLATE_APPROVAL_CLEARED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("version") == "1.0"
    ]
    assert len(approval_cleared_events) == 3
    assert {row["payload"]["mutation_type"] for row in approval_cleared_events} == {
        "BOM_ITEM_ADDED",
        "BOM_ITEM_UPDATED",
        "BOM_ITEM_REMOVED",
    }


def test_active_unbound_bom_cannot_be_modified_in_place():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    add_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert add_item.status_code == 400
    assert add_item.json()["detail"] == "Active BOM template cannot be modified; use clone or promote"

    updated = client.patch(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
        json={"quantity_required": 2},
    )
    assert updated.status_code == 400
    assert updated.json()["detail"] == "Active BOM template cannot be modified; use clone or promote"

    removed = client.delete(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
    )
    assert removed.status_code == 400
    assert removed.json()["detail"] == "Active BOM template cannot be modified; use clone or promote"


def test_device_bom_template_diff_reports_added_removed_modified_and_unchanged_items():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        required_part_number="PCB-CTRL-001",
        required_revision="A",
    )
    source_extra = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "SENSOR_MODULE",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert source_extra.status_code == 200
    unchanged_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": False,
        },
    )
    assert unchanged_item.status_code == 200
    release_device_bom_template(device_type=device_type, version="1.0")

    cloned = client.post(
        f"/api/device-bom-templates/{device_type}/clone",
        json={
            "source_version": "1.0",
            "target_version": "2.0",
            "activate": False,
        },
    )
    assert cloned.status_code == 200

    updated = client.patch(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=2.0",
        json={
            "required_revision": "B",
            "quantity_required": 2,
        },
    )
    assert updated.status_code == 200

    removed = client.delete(
        f"/api/device-bom-templates/{device_type}/items/SENSOR_MODULE?version=2.0",
    )
    assert removed.status_code == 200

    added = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=2.0",
        json={
            "component_type": "POWER_SUPPLY",
            "required_drawing_number": "DWG-PSU-001",
            "required_drawing_revision": "02",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert added.status_code == 200

    diff = client.get(
        f"/api/device-bom-templates/{device_type}/diff"
        "?source_version=1.0&target_version=2.0"
    )
    assert diff.status_code == 200
    payload = diff.json()
    assert payload["device_type"] == device_type
    assert payload["source_version"] == "1.0"
    assert payload["target_version"] == "2.0"
    assert payload["unchanged_count"] == 1

    added_rows = {row["component_type"]: row for row in payload["added"]}
    assert set(added_rows) == {"POWER_SUPPLY"}
    assert added_rows["POWER_SUPPLY"]["required_drawing_number"] == "DWG-PSU-001"

    removed_rows = {row["component_type"]: row for row in payload["removed"]}
    assert set(removed_rows) == {"SENSOR_MODULE"}

    modified_rows = {row["component_type"]: row for row in payload["modified"]}
    assert set(modified_rows) == {"CONTROL_PCB"}
    assert modified_rows["CONTROL_PCB"]["change_type"] == "MODIFIED"
    assert modified_rows["CONTROL_PCB"]["source"]["required_revision"] == "A"
    assert modified_rows["CONTROL_PCB"]["target"]["required_revision"] == "B"
    assert modified_rows["CONTROL_PCB"]["source"]["quantity_required"] == 1
    assert modified_rows["CONTROL_PCB"]["target"]["quantity_required"] == 2


def test_clone_with_activation_requires_ready_bom_template():
    device_type = unique_id("DT")
    created = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "name": "Optional Source BOM",
            "version": "1.0",
            "is_active": False,
        },
    )
    assert created.status_code == 200

    added = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": False,
        },
    )
    assert added.status_code == 200

    cloned = client.post(
        f"/api/device-bom-templates/{device_type}/clone",
        json={
            "source_version": "1.0",
            "target_version": "2.0",
            "activate": True,
            "approved_by": "PYTEST-QA",
        },
    )
    assert cloned.status_code == 400
    assert cloned.json()["detail"] == (
        "Cloned BOM template would not be ready for activation: "
        "BOM template has no required items"
    )


def test_mutable_bom_item_can_be_updated_and_deleted():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
    )

    updated = client.patch(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
        json={
            "required_part_number": "PCB-CTRL-002",
            "required_revision": "C",
            "quantity_required": 3,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["required_part_number"] == "PCB-CTRL-002"
    assert updated.json()["required_revision"] == "C"
    assert updated.json()["quantity_required"] == 3

    removed = client.delete(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
    )
    assert removed.status_code == 200
    assert removed.json()["component_type"] == "CONTROL_PCB"

    listed = client.get(f"/api/device-bom-templates/{device_type}/items?version=1.0")
    assert listed.status_code == 200
    assert listed.json() == []


def test_device_bom_template_can_be_cloned_with_all_items():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
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
    release_device_bom_template(device_type=device_type, version="1.0")

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

    lineage = client.get(f"/api/device-bom-templates/{device_type}/lineage?version=1.1")
    assert lineage.status_code == 200
    lineage_payload = lineage.json()
    assert lineage_payload["focus"]["version"] == "1.1"
    assert lineage_payload["focus"]["source_template_id"] is not None
    assert [row["version"] for row in lineage_payload["ancestors"]] == ["1.0"]
    assert lineage_payload["replacement"] is None


def test_device_bom_template_clone_requires_greater_target_version():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="2.0",
        is_active=True,
    )

    cloned = client.post(
        f"/api/device-bom-templates/{device_type}/clone",
        json={
            "source_version": "2.0",
            "target_version": "1.5",
            "activate": False,
        },
    )
    assert cloned.status_code == 400
    assert cloned.json()["detail"] == "Target BOM version must be greater than source version"


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
            "approved_by": "PYTEST-QA",
            "release_note": "Clone activation for pytest",
        },
    )
    assert cloned.status_code == 200
    assert cloned.json()["version"] == "2.0"
    assert cloned.json()["status"] == "ACTIVE"
    assert cloned.json()["is_active"] is True
    assert cloned.json()["approved_by"] == "PYTEST-QA"

    templates = client.get("/api/device-bom-templates")
    assert templates.status_code == 200
    device_templates = [row for row in templates.json() if row["device_type"] == device_type]
    assert len(device_templates) == 2
    assert next(row for row in device_templates if row["version"] == "2.0")["status"] == "ACTIVE"
    assert next(row for row in device_templates if row["version"] == "1.0")["status"] == "APPROVED"


def test_active_bom_template_can_be_promoted_in_one_operation():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        required_part_number="PCB-CTRL-001",
    )
    extra_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 2,
            "is_required": True,
        },
    )
    assert extra_item.status_code == 200
    release_device_bom_template(device_type=device_type, version="1.0")

    promoted = client.post(
        f"/api/device-bom-templates/{device_type}/promote",
        json={
            "source_version": "1.0",
            "target_version": "2.0",
            "name": "Promoted BOM",
            "retire_reason": "Production release update",
            "approved_by": "PYTEST-QA",
        },
    )
    assert promoted.status_code == 200
    assert promoted.json()["version"] == "2.0"
    assert promoted.json()["status"] == "ACTIVE"
    assert promoted.json()["is_active"] is True
    assert promoted.json()["name"] == "Promoted BOM"

    templates = client.get("/api/device-bom-templates")
    assert templates.status_code == 200
    device_templates = [row for row in templates.json() if row["device_type"] == device_type]
    assert len(device_templates) == 2
    assert next(row for row in device_templates if row["version"] == "1.0")["status"] == "RETIRED"
    assert next(row for row in device_templates if row["version"] == "1.0")["is_active"] is False
    assert next(row for row in device_templates if row["version"] == "2.0")["status"] == "ACTIVE"

    promoted_items = client.get(f"/api/device-bom-templates/{device_type}/items?version=2.0")
    assert promoted_items.status_code == 200
    promoted_rows = {row["component_type"]: row for row in promoted_items.json()}
    assert set(promoted_rows) == {"CONTROL_PCB", "FAN_MODULE"}
    assert promoted_rows["CONTROL_PCB"]["required_part_number"] == "PCB-CTRL-001"
    assert promoted_rows["FAN_MODULE"]["quantity_required"] == 2

    retired_lineage = client.get(f"/api/device-bom-templates/{device_type}/lineage?version=1.0")
    assert retired_lineage.status_code == 200
    retired_payload = retired_lineage.json()
    assert retired_payload["focus"]["replaced_by_template_id"] is not None
    assert retired_payload["replacement"] is not None
    assert retired_payload["replacement"]["version"] == "2.0"

    promoted_lineage = client.get(f"/api/device-bom-templates/{device_type}/lineage?version=2.0")
    assert promoted_lineage.status_code == 200
    promoted_payload = promoted_lineage.json()
    assert promoted_payload["focus"]["source_template_id"] == retired_payload["focus"]["template_id"]
    assert [row["version"] for row in promoted_payload["ancestors"]] == ["1.0"]


def test_bom_template_promotion_requires_greater_target_version():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="2.0",
        is_active=True,
    )

    promoted = client.post(
        f"/api/device-bom-templates/{device_type}/promote",
        json={
            "source_version": "2.0",
            "target_version": "1.9",
            "approved_by": "PYTEST-QA",
        },
    )
    assert promoted.status_code == 400
    assert promoted.json()["detail"] == "Target BOM version must be greater than source version"


def test_only_active_bom_template_can_be_promoted():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
    )

    promoted = client.post(
        f"/api/device-bom-templates/{device_type}/promote",
        json={
            "source_version": "1.0",
            "target_version": "2.0",
        },
    )
    assert promoted.status_code == 400
    assert promoted.json()["detail"] == "Only active BOM template can be promoted"


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

    updated = client.patch(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
        json={"quantity_required": 2},
    )
    assert updated.status_code == 400
    assert updated.json()["detail"] == "Retired BOM template cannot be modified"

    removed = client.delete(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
    )
    assert removed.status_code == 400
    assert removed.json()["detail"] == "Retired BOM template cannot be modified"


def test_active_bound_bom_template_cannot_be_modified():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")
    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    installed = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert installed.status_code == 200

    add_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "FAN_MODULE",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert add_item.status_code == 400
    assert add_item.json()["detail"] == "Active BOM template cannot be modified; use clone or promote"

    updated = client.patch(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
        json={"quantity_required": 2},
    )
    assert updated.status_code == 400
    assert updated.json()["detail"] == "Active BOM template cannot be modified; use clone or promote"

    removed = client.delete(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
    )
    assert removed.status_code == 400
    assert removed.json()["detail"] == "Active BOM template cannot be modified; use clone or promote"


def test_device_bom_template_usage_reports_bound_active_template():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")
    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    installed = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert installed.status_code == 200

    usage = client.get(f"/api/device-bom-templates/{device_type}/usage?version=1.0")
    assert usage.status_code == 200
    payload = usage.json()
    assert payload["status"] == "ACTIVE"
    assert payload["bound_device_count"] == 1
    assert payload["is_bound"] is True
    assert payload["can_modify"] is False
    assert payload["recommended_action"] == "clone_or_promote"


def test_device_bom_template_catalog_summarizes_lifecycle_versions():
    device_type = unique_id("DT")

    empty_draft = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "variant_code": "DEFAULT",
            "name": "Empty draft",
            "version": "0.9",
            "is_active": False,
        },
    )
    assert empty_draft.status_code == 200

    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
        variant_code="DEFAULT",
    )
    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve?variant_code=DEFAULT",
        json={"version": "1.0", "approved_by": "QA-LEAD"},
    )
    assert approved.status_code == 200

    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="2.0",
        is_active=True,
        variant_code="DEFAULT",
    )

    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")
    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    installed = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert installed.status_code == 200
    assert installed.json()["bom_version"] == "2.0"

    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="3.0",
        is_active=False,
        variant_code="DEFAULT",
    )
    retired = client.post(
        f"/api/device-bom-templates/{device_type}/retire?variant_code=DEFAULT",
        json={"version": "3.0", "reason": "Obsolete draft"},
    )
    assert retired.status_code == 200

    catalog = client.get(
        f"/api/device-bom-templates/{device_type}/catalog?variant_code=DEFAULT"
    )
    assert catalog.status_code == 200
    versions = {row["version"]: row for row in catalog.json()}

    empty_row = versions["0.9"]
    assert empty_row["status"] == "INACTIVE"
    assert empty_row["has_any_items"] is False
    assert empty_row["can_modify"] is True
    assert empty_row["can_activate"] is False
    assert empty_row["can_release"] is False
    assert empty_row["recommended_action"] == "modify_or_approve"
    assert "BOM template has no items" in empty_row["activation_blocking_reasons"]
    assert "BOM template is not approved" in empty_row["activation_blocking_reasons"]
    assert "BOM template has no items" in empty_row["release_blocking_reasons"]

    approved_row = versions["1.0"]
    assert approved_row["status"] == "APPROVED"
    assert approved_row["is_approved"] is True
    assert approved_row["can_modify"] is True
    assert approved_row["can_activate"] is True
    assert approved_row["can_release"] is True
    assert approved_row["recommended_action"] == "activate_or_modify"
    assert approved_row["bound_device_count"] == 0
    assert approved_row["activation_blocking_reasons"] == []
    assert approved_row["release_blocking_reasons"] == []

    active_row = versions["2.0"]
    assert active_row["status"] == "ACTIVE"
    assert active_row["is_bound"] is True
    assert active_row["bound_device_count"] == 1
    assert active_row["can_modify"] is False
    assert active_row["can_activate"] is False
    assert active_row["can_release"] is False
    assert active_row["recommended_action"] == "clone_or_promote"
    assert active_row["activation_blocking_reasons"] == ["BOM template is already active"]
    assert active_row["release_blocking_reasons"] == ["Active BOM template is already released"]

    retired_row = versions["3.0"]
    assert retired_row["status"] == "RETIRED"
    assert retired_row["can_modify"] is False
    assert retired_row["can_activate"] is False
    assert retired_row["can_release"] is False
    assert retired_row["recommended_action"] == "clone"
    assert retired_row["activation_blocking_reasons"] == [
        "Retired BOM template cannot be activated"
    ]
    assert retired_row["release_blocking_reasons"] == [
        "Retired BOM template cannot be released"
    ]


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
    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "2.0", "approved_by": "PYTEST-QA"},
    )
    assert approved.status_code == 200

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


def test_device_bom_item_update_and_remove_audit_events_are_recorded():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=False,
    )

    updated = client.patch(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
        json={"quantity_required": 2},
    )
    assert updated.status_code == 200

    removed = client.delete(
        f"/api/device-bom-templates/{device_type}/items/CONTROL_PCB?version=1.0",
    )
    assert removed.status_code == 200

    item_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_ITEM")
    assert item_audit.status_code == 200
    update_event = next(
        row
        for row in item_audit.json()
        if row["event_type"] == "DEVICE_BOM_ITEM_UPDATED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("component_type") == "CONTROL_PCB"
    )
    assert update_event["payload"]["after"]["quantity_required"] == 2

    remove_event = next(
        row
        for row in item_audit.json()
        if row["event_type"] == "DEVICE_BOM_ITEM_REMOVED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("component_type") == "CONTROL_PCB"
    )
    assert remove_event["result"] == "REMOVED"


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


def test_device_bom_promotion_audit_event_is_recorded():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    promoted = client.post(
        f"/api/device-bom-templates/{device_type}/promote",
        json={
            "source_version": "1.0",
            "target_version": "2.0",
            "retire_reason": "Release cutover",
            "approved_by": "PYTEST-QA",
        },
    )
    assert promoted.status_code == 200

    template_audit = client.get("/api/audit-events?entity_type=DEVICE_BOM_TEMPLATE")
    assert template_audit.status_code == 200
    promote_event = next(
        row
        for row in template_audit.json()
        if row["event_type"] == "DEVICE_BOM_TEMPLATE_PROMOTED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("source_version") == "1.0"
        and row["payload"].get("target_version") == "2.0"
    )
    assert promote_event["result"] == "ACTIVE"
    assert promote_event["payload"]["retire_reason"] == "Release cutover"

    retire_event = next(
        row
        for row in template_audit.json()
        if row["event_type"] == "DEVICE_BOM_TEMPLATE_RETIRED"
        and row["payload"]
        and row["payload"].get("device_type") == device_type
        and row["payload"].get("version") == "1.0"
        and row["payload"].get("replaced_by_version") == "2.0"
    )
    assert retire_event["payload"]["reason"] == "Release cutover"


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


def test_operator_password_login_creates_and_reuses_work_session():
    operator_id = unique_id("OP")
    workstation_id = unique_id("WS")
    login_name = f"login-{uuid4().hex[:6]}"
    password = "Secret123!"

    operator_response = client.post(
        "/api/operators",
        json={
            "operator_id": operator_id,
            "full_name": "QC Inspector",
            "role": "QUALITY_INSPECTOR",
            "login_name": login_name,
            "password": password,
        },
    )
    assert operator_response.status_code == 200
    assert operator_response.json()["login_name"] == login_name

    workstation_response = client.post(
        "/api/workstations",
        json={"workstation_id": workstation_id, "name": "QC Station", "area": "QA"},
    )
    assert workstation_response.status_code == 200

    login_response = client.post(
        "/api/auth/operator-login",
        json={
            "login": login_name,
            "password": password,
            "workstation_id": workstation_id,
        },
    )
    assert login_response.status_code == 200
    first_session = login_response.json()
    assert first_session["operator_id"] == operator_id

    reused_response = client.post(
        "/api/auth/operator-login",
        json={
            "login": login_name,
            "password": password,
            "workstation_id": workstation_id,
        },
    )
    assert reused_response.status_code == 200
    assert reused_response.json()["work_session_id"] == first_session["work_session_id"]

    invalid_password = client.post(
        "/api/auth/operator-login",
        json={
            "login": login_name,
            "password": "wrong-password",
            "workstation_id": workstation_id,
        },
    )
    assert invalid_password.status_code == 401

    audit = client.get(f"/api/audit-events?work_session_id={first_session['work_session_id']}")
    assert audit.status_code == 200
    event_types = {row["event_type"] for row in audit.json()}
    assert "OPERATOR_LOGIN" in event_types
    assert "OPERATOR_LOGIN_REUSED" in event_types


def test_admin_can_update_operator_and_workstation():
    operator_id = unique_id("OP")
    workstation_id = unique_id("WS")

    operator_response = client.post(
        "/api/operators",
        json={
            "operator_id": operator_id,
            "full_name": "Initial Operator",
            "role": "QUALITY_INSPECTOR",
            "login_name": f"admin-{uuid4().hex[:6]}",
            "password": "Secret123!",
            "rfid_uid_hash": unique_id("RFID"),
        },
    )
    assert operator_response.status_code == 200

    workstation_response = client.post(
        "/api/workstations",
        json={
            "workstation_id": workstation_id,
            "name": "Initial QC Station",
            "area": "QA",
            "station_type": "QC",
        },
    )
    assert workstation_response.status_code == 200

    updated_operator = client.patch(
        f"/api/operators/{operator_id}",
        json={
            "full_name": "Updated Operator",
            "role": "QUALITY_MANAGER",
            "login_name": f"updated-{uuid4().hex[:6]}",
            "password": "NewSecret123!",
            "rfid_uid_hash": unique_id("RFID"),
            "is_active": False,
        },
    )
    assert updated_operator.status_code == 200
    assert updated_operator.json()["full_name"] == "Updated Operator"
    assert updated_operator.json()["role"] == "QUALITY_MANAGER"
    assert updated_operator.json()["is_active"] is False

    updated_workstation = client.patch(
        f"/api/workstations/{workstation_id}",
        json={
            "name": "Updated QC Station",
            "area": "LAB",
            "station_type": "FINAL_QC",
            "is_active": False,
        },
    )
    assert updated_workstation.status_code == 200
    assert updated_workstation.json()["name"] == "Updated QC Station"
    assert updated_workstation.json()["area"] == "LAB"
    assert updated_workstation.json()["station_type"] == "FINAL_QC"
    assert updated_workstation.json()["is_active"] is False

    listed_operators = client.get("/api/operators")
    assert listed_operators.status_code == 200
    assert any(
        row["operator_id"] == operator_id
        and row["full_name"] == "Updated Operator"
        and row["is_active"] is False
        for row in listed_operators.json()
    )

    listed_workstations = client.get("/api/workstations")
    assert listed_workstations.status_code == 200
    assert any(
        row["workstation_id"] == workstation_id
        and row["name"] == "Updated QC Station"
        and row["is_active"] is False
        for row in listed_workstations.json()
    )

    login_blocked = client.post(
        "/api/auth/operator-login",
        json={
            "login": updated_operator.json()["login_name"],
            "password": "NewSecret123!",
            "workstation_id": workstation_id,
        },
    )
    assert login_blocked.status_code == 401


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

    steps = client.get(f"/api/qc-checklists/{checklist_code}/steps")
    assert steps.status_code == 200
    assert [row["title"] for row in steps.json()] == ["Measure width"]
    assert steps.json()[0]["requires_measurement"] is True

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

    completed = client.post(
        f"/api/qc-runs/{run_id}/complete",
        data={
            "failure_reason": "DIMENSION_OUT_OF_RANGE",
            "failure_comment": "Width measured above upper limit",
        },
    )
    assert completed.status_code == 200
    assert completed.json()["result"] == "FAIL"

    item = client.get(f"/api/production-items/{item_serial_number}")
    assert item.status_code == 200
    assert item.json()["current_status"] == "QC_FAILED"

    ncr = client.get("/api/nonconformities")
    assert ncr.status_code == 200
    created_ncr = next(row for row in ncr.json() if row["ncr_id"] == f"NCR-QC-{run_id}")
    assert created_ncr["description"] == (
        "QC failed: DIMENSION_OUT_OF_RANGE. Width measured above upper limit"
    )

    audit = client.get(f"/api/audit-events?entity_type=QC_RUN&entity_id={run_id}")
    assert audit.status_code == 200
    completed_event = next(
        row for row in audit.json() if row["event_type"] == "QC_RUN_COMPLETED"
    )
    assert completed_event["payload"]["failure_disposition"] == "OPEN_CRITICAL_NCR"
    assert completed_event["payload"]["failure_reason"] == "DIMENSION_OUT_OF_RANGE"
    assert (
        completed_event["payload"]["failure_comment"]
        == "Width measured above upper limit"
    )


def test_qc_run_fail_with_rework_disposition_marks_item_without_ncr():
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
            "name": "Visual QC",
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
            "title": "Inspect housing",
            "evaluation_mode": "MANUAL",
            "requires_photo": True,
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
        json={"status": "FAIL", "comment": "Scratch on the surface"},
    )
    assert step_result.status_code == 200
    assert step_result.json()["status"] == "FAIL"

    completed = client.post(
        f"/api/qc-runs/{run_id}/complete",
        data={
            "failure_reason": "VISUAL_DEFECT",
            "failure_comment": "Scratch on the surface",
            "failure_disposition": "REWORK_REQUIRED",
        },
    )
    assert completed.status_code == 200
    assert completed.json()["result"] == "FAIL"

    item = client.get(f"/api/production-items/{item_serial_number}")
    assert item.status_code == 200
    assert item.json()["current_status"] == "REWORK_REQUIRED"

    ncr = client.get("/api/nonconformities")
    assert ncr.status_code == 200
    assert not any(row["ncr_id"] == f"NCR-QC-{run_id}" for row in ncr.json())

    audit = client.get(f"/api/audit-events?entity_type=QC_RUN&entity_id={run_id}")
    assert audit.status_code == 200
    completed_event = next(
        row for row in audit.json() if row["event_type"] == "QC_RUN_COMPLETED"
    )
    assert completed_event["payload"]["failure_disposition"] == "REWORK_REQUIRED"
    assert completed_event["payload"]["failure_reason"] == "VISUAL_DEFECT"


def test_qc_item_can_close_open_ncr_and_return_to_rework():
    quality_session = start_work_session(role="QUALITY_INSPECTOR")
    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")

    created = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "FAN_MODULE",
            "work_session_id": quality_session["work_session_id"],
            "workstation_id": quality_session["workstation_id"],
        },
    )
    assert created.status_code == 200

    checklist_code = unique_id("CHK")
    checklist = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": checklist_code,
            "name": "Rework QC",
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
            "title": "Inspect housing",
            "evaluation_mode": "MANUAL",
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
        json={"status": "FAIL", "comment": "Housing cracked"},
    )
    assert step_result.status_code == 200

    completed = client.post(
        f"/api/qc-runs/{run_id}/complete",
        data={
            "failure_reason": "VISUAL_DEFECT",
            "failure_comment": "Housing cracked",
            "failure_disposition": "OPEN_CRITICAL_NCR",
        },
    )
    assert completed.status_code == 200

    evidence_upload = client.post(
        "/api/files/upload",
        data={
            "related_entity_type": "QC_RUN",
            "related_entity_id": run_id,
            "uploaded_by": quality_session["operator_id"],
        },
        files={"file": ("qc-fail.jpg", b"image-bytes", "image/jpeg")},
    )
    assert evidence_upload.status_code == 200

    ncr_rows = client.get(f"/api/qc-items/{item_serial_number}/open-critical-ncrs")
    assert ncr_rows.status_code == 200
    assert len(ncr_rows.json()) == 1
    assert ncr_rows.json()[0]["ncr_id"] == f"NCR-QC-{run_id}"

    run_history = client.get(f"/api/qc-items/{item_serial_number}/runs?limit=5")
    assert run_history.status_code == 200
    assert len(run_history.json()) == 1
    assert run_history.json()[0]["run_id"] == run_id
    assert run_history.json()[0]["result"] == "FAIL"

    run_details = client.get(f"/api/qc-runs/{run_id}/details")
    assert run_details.status_code == 200
    assert run_details.json()["run_id"] == run_id
    assert run_details.json()["failure_reason"] == "VISUAL_DEFECT"
    assert run_details.json()["failure_comment"] == "Housing cracked"
    assert run_details.json()["failure_disposition"] == "OPEN_CRITICAL_NCR"
    assert len(run_details.json()["step_results"]) == 1
    assert run_details.json()["step_results"][0]["step_title"] == "Inspect housing"
    assert run_details.json()["step_results"][0]["comment"] == "Housing cracked"
    assert len(run_details.json()["evidence_files"]) == 1
    assert run_details.json()["evidence_files"][0]["file_name"] == "qc-fail.jpg"

    released = client.post(
        f"/api/qc-items/{item_serial_number}/release-for-rework",
        json={
            "work_session_id": quality_session["work_session_id"],
            "operator_id": quality_session["operator_id"],
            "corrective_action": "Replaced housing and queued for reinspection",
        },
    )
    assert released.status_code == 200
    assert released.json()["current_status"] == "REWORK_REQUIRED"

    closed_ncr = client.get(f"/api/nonconformities/NCR-QC-{run_id}")
    assert closed_ncr.status_code == 200
    assert closed_ncr.json()["status"] == "CLOSED"
    assert (
        closed_ncr.json()["corrective_action"]
        == "Replaced housing and queued for reinspection"
    )
    assert closed_ncr.json()["closed_at"] is not None

    after_release_rows = client.get(f"/api/qc-items/{item_serial_number}/open-critical-ncrs")
    assert after_release_rows.status_code == 200
    assert after_release_rows.json() == []

    closed_ncr_rows = client.get(
        f"/api/qc-items/{item_serial_number}/closed-critical-ncrs?limit=5"
    )
    assert closed_ncr_rows.status_code == 200
    assert len(closed_ncr_rows.json()) == 1
    assert closed_ncr_rows.json()[0]["ncr_id"] == f"NCR-QC-{run_id}"
    assert (
        closed_ncr_rows.json()[0]["corrective_action"]
        == "Replaced housing and queued for reinspection"
    )

    audit = client.get(
        f"/api/audit-events?entity_type=PRODUCTION_ITEM&entity_id={item_serial_number}"
    )
    assert audit.status_code == 200
    rework_event = next(
        row for row in audit.json() if row["event_type"] == "QC_ITEM_RELEASED_FOR_REWORK"
    )
    assert rework_event["payload"]["previous_status"] == "QC_FAILED"
    assert rework_event["payload"]["current_status"] == "REWORK_REQUIRED"
    assert rework_event["payload"]["closed_ncr_ids"] == [f"NCR-QC-{run_id}"]
    assert (
        rework_event["payload"]["corrective_action"]
        == "Replaced housing and queued for reinspection"
    )


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


def test_qc_waiting_items_queue_returns_only_components_requiring_qc():
    session = start_work_session(role="PRODUCTION_OPERATOR")

    fan_checklist = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": unique_id("CHK"),
            "name": "Kontrola wentylatora",
            "process_stage": "COMPONENT_QC",
            "version": "1.0",
            "component_type": "FAN_MODULE",
        },
    )
    assert fan_checklist.status_code == 200

    skip_checklist = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": unique_id("CHK"),
            "name": "Silikon bez kontroli",
            "process_stage": "COMPONENT_QC",
            "version": "1.0",
            "component_type": "SILICONE_PACK",
            "skip_component_qc": True,
        },
    )
    assert skip_checklist.status_code == 200

    def create_waiting_item(item_type: str, status_path: list[str]) -> dict:
        item_serial_number = unique_id("ITEM")
        barcode_value = unique_id("BC")
        created = client.post(
            "/api/production-items",
            json={
                "item_serial_number": item_serial_number,
                "barcode_value": barcode_value,
                "item_type": item_type,
                "work_session_id": session["work_session_id"],
                "workstation_id": session["workstation_id"],
            },
        )
        assert created.status_code == 200

        for status in status_path:
            updated = client.patch(
                f"/api/production-items/{item_serial_number}/status",
                json={"current_status": status},
            )
            assert updated.status_code == 200

        return created.json()

    produced_fan = create_waiting_item("FAN_MODULE", ["PRODUCED"])
    rework_fan = create_waiting_item("FAN_MODULE", ["PRODUCED", "QC_IN_PROGRESS", "REWORK_REQUIRED"])
    skipped_silicone = create_waiting_item("SILICONE_PACK", ["PRODUCED"])
    unknown_sensor = create_waiting_item("SENSOR_MODULE", ["PRODUCED"])
    qc_passed_fan = create_waiting_item("FAN_MODULE", ["PRODUCED", "QC_IN_PROGRESS", "QC_PASSED"])

    queue = client.get("/api/qc-waiting-items")
    assert queue.status_code == 200
    queue_rows = queue.json()
    queue_serials = {row["item_serial_number"] for row in queue_rows}
    assert produced_fan["item_serial_number"] in queue_serials
    assert rework_fan["item_serial_number"] in queue_serials
    assert skipped_silicone["item_serial_number"] not in queue_serials
    assert unknown_sensor["item_serial_number"] not in queue_serials
    assert qc_passed_fan["item_serial_number"] not in queue_serials

    filtered = client.get("/api/qc-waiting-items?component_type=FAN_MODULE&limit=1")
    assert filtered.status_code == 200
    filtered_rows = filtered.json()
    assert len(filtered_rows) == 1
    assert filtered_rows[0]["item_type"] == "FAN_MODULE"


def test_qc_run_pass_updates_installed_component_snapshot_and_queue_state():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
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

    with SessionLocal() as db:
        link = (
            db.query(AssemblyLink)
            .filter(AssemblyLink.child_barcode_value == item["barcode_value"])
            .first()
        )
        device = (
            db.query(Device)
            .filter(Device.device_serial_number == device_serial_number)
            .first()
        )
        assert link is not None
        assert device is not None
        link.component_qc_passed = False
        previous_updated_at = device.updated_at - timedelta(hours=2)
        device.updated_at = previous_updated_at
        db.commit()

    quality_before = client.get(f"/api/devices/{device_serial_number}/component-quality")
    assert quality_before.status_code == 200
    assert quality_before.json()["recommended_action"] == "RUN_COMPONENT_QC_OR_REWORK"

    quality_session = start_work_session(role="QUALITY_INSPECTOR")
    run_id = unique_id("QCRUN")
    qc_run = client.post(
        "/api/qc-runs",
        json={
            "run_id": run_id,
            "device_serial_number": device_serial_number,
            "item_serial_number": item["item_serial_number"],
            "barcode_value": item["barcode_value"],
            "process_stage": "COMPONENT_QC",
            "work_session_id": quality_session["work_session_id"],
        },
    )
    assert qc_run.status_code == 200

    completed = client.post(f"/api/qc-runs/{run_id}/complete", data={"result": "PASS"})
    assert completed.status_code == 200
    assert completed.json()["result"] == "PASS"

    with SessionLocal() as db:
        link = (
            db.query(AssemblyLink)
            .filter(AssemblyLink.child_barcode_value == item["barcode_value"])
            .first()
        )
        device = (
            db.query(Device)
            .filter(Device.device_serial_number == device_serial_number)
            .first()
        )
        assert link is not None
        assert device is not None
        assert link.component_qc_passed is True
        assert device.updated_at > previous_updated_at

    quality_after = client.get(f"/api/devices/{device_serial_number}/component-quality")
    assert quality_after.status_code == 200
    assert quality_after.json()["passes_component_quality_gate"] is True
    assert quality_after.json()["primary_quality_status"] == "PASS"
    assert quality_after.json()["recommended_action"] == "NO_ACTION"


def test_qc_run_fail_updates_installed_component_snapshot_and_creates_component_ncr():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
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

    quality_session = start_work_session(role="QUALITY_INSPECTOR")
    run_id = unique_id("QCRUN")
    qc_run = client.post(
        "/api/qc-runs",
        json={
            "run_id": run_id,
            "device_serial_number": device_serial_number,
            "item_serial_number": item["item_serial_number"],
            "barcode_value": item["barcode_value"],
            "process_stage": "COMPONENT_QC",
            "work_session_id": quality_session["work_session_id"],
        },
    )
    assert qc_run.status_code == 200

    completed = client.post(f"/api/qc-runs/{run_id}/complete", data={"result": "FAIL"})
    assert completed.status_code == 200
    assert completed.json()["result"] == "FAIL"

    with SessionLocal() as db:
        link = (
            db.query(AssemblyLink)
            .filter(AssemblyLink.child_barcode_value == item["barcode_value"])
            .first()
        )
        assert link is not None
        assert link.component_qc_passed is False

    ncr = client.get(f"/api/nonconformities/NCR-QC-{run_id}")
    assert ncr.status_code == 200
    assert ncr.json()["component_serial_number"] == item["item_serial_number"]

    quality_after = client.get(f"/api/devices/{device_serial_number}/component-quality")
    assert quality_after.status_code == 200
    assert quality_after.json()["passes_component_quality_gate"] is False
    assert quality_after.json()["primary_quality_status"] == "CRITICAL_NCR_OPEN"
    assert quality_after.json()["recommended_action"] == "RESOLVE_COMPONENT_NCR"


def test_qc_product_configuration_can_bind_bom_component_reference_image_and_steps():
    device_type = unique_id("DT")
    create_device_bom_template_with_items(
        device_type,
        items=[
            {
                "component_type": "SCREW_M4",
                "quantity_required": 4,
                "is_required": True,
            },
            {
                "component_type": "SILICONE_PACK",
                "quantity_required": 1,
                "is_required": False,
            },
        ],
    )

    checklist_code = unique_id("CHK")
    checklist_response = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": checklist_code,
            "name": "Kontrola sruby M4",
            "process_stage": "COMPONENT_QC",
            "version": "1.0",
            "device_type": device_type,
            "variant_code": "DEFAULT",
            "component_type": "SCREW_M4",
        },
    )
    assert checklist_response.status_code == 200
    assert checklist_response.json()["component_type"] == "SCREW_M4"

    upload_response = client.post(
        f"/api/qc-checklists/{checklist_code}/reference-image",
        data={"uploaded_by": "PYTEST-ADMIN"},
        files={"file": ("screw.png", b"png-bytes", "image/png")},
    )
    assert upload_response.status_code == 200
    reference_image_file_id = upload_response.json()["reference_image_file_id"]
    assert reference_image_file_id is not None

    numeric_step = client.post(
        f"/api/qc-checklists/{checklist_code}/steps",
        json={
            "step_order": 1,
            "title": "Sprawdz dlugosc sruby",
            "instruction": "Zmierz srube suwmiarka.",
            "control_area": "Trzon sruby",
            "evaluation_mode": "NUMERIC_RANGE",
            "result_input_label": "Wynik dlugosci",
            "region_x": 12,
            "region_y": 18,
            "region_width": 46,
            "region_height": 24,
            "blocking_on_fail": True,
            "expected_value": "12.0",
            "unit": "mm",
            "tolerance_min": 11.8,
            "tolerance_max": 12.2,
        },
    )
    assert numeric_step.status_code == 200
    numeric_step_id = numeric_step.json()["id"]
    assert numeric_step.json()["requires_measurement"] is True
    assert numeric_step.json()["region_x"] == 12
    assert numeric_step.json()["region_height"] == 24

    text_step = client.post(
        f"/api/qc-checklists/{checklist_code}/steps",
        json={
            "step_order": 2,
            "title": "Potwierdz oznaczenie",
            "instruction": "Wpisz odczyt z glowki sruby.",
            "control_area": "Glowka sruby",
            "evaluation_mode": "TEXT_MATCH",
            "result_input_label": "Odczyt oznaczenia",
            "region_x": 60,
            "region_y": 58,
            "region_width": 20,
            "region_height": 16,
            "expected_value": "A2-70",
            "blocking_on_fail": True,
        },
    )
    assert text_step.status_code == 200
    text_step_id = text_step.json()["id"]

    updated_step = client.patch(
        f"/api/qc-checklists/{checklist_code}/steps/{text_step_id}",
        json={
            "instruction": "Wpisz oznaczenie z glowki sruby i porownaj z wzorcem.",
            "result_input_label": "Wpisz odczyt oznaczenia",
            "region_x": 62,
        },
    )
    assert updated_step.status_code == 200
    assert updated_step.json()["result_input_label"] == "Wpisz odczyt oznaczenia"
    assert updated_step.json()["region_x"] == 62
    assert updated_step.json()["region_width"] == 20

    deleted_step = client.delete(
        f"/api/qc-checklists/{checklist_code}/steps/{numeric_step_id}",
    )
    assert deleted_step.status_code == 204

    filtered_checklists = client.get(
        f"/api/qc-checklists?device_type={device_type}&variant_code=DEFAULT&component_type=SCREW_M4"
    )
    assert filtered_checklists.status_code == 200
    assert [row["checklist_code"] for row in filtered_checklists.json()] == [checklist_code]

    product_config = client.get(
        f"/api/qc-product-configurations/{device_type}?variant_code=DEFAULT"
    )
    assert product_config.status_code == 200
    product_items = {
        row["component_type"]: row for row in product_config.json()["items"]
    }
    assert product_items["SCREW_M4"]["checklist_code"] == checklist_code
    assert product_items["SCREW_M4"]["configured_step_count"] == 1
    assert product_items["SCREW_M4"]["reference_image_file_id"] == reference_image_file_id
    assert product_items["SILICONE_PACK"]["checklist_code"] is None
    assert product_items["SILICONE_PACK"]["configured_step_count"] == 0

    steps = client.get(f"/api/qc-checklists/{checklist_code}/steps")
    assert steps.status_code == 200
    assert [row["title"] for row in steps.json()] == ["Potwierdz oznaczenie"]
    assert steps.json()[0]["evaluation_mode"] == "TEXT_MATCH"
    assert steps.json()[0]["region_x"] == 62
    assert steps.json()[0]["region_height"] == 16


def test_qc_step_control_region_requires_complete_bounded_rectangle():
    checklist_code = unique_id("CHK")
    checklist = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": checklist_code,
            "name": "Kontrola obszaru",
            "process_stage": "COMPONENT_QC",
            "version": "1.0",
        },
    )
    assert checklist.status_code == 200

    incomplete_region = client.post(
        f"/api/qc-checklists/{checklist_code}/steps",
        json={
            "step_order": 1,
            "title": "Brak kompletu regionu",
            "region_x": 10,
            "region_y": 20,
            "evaluation_mode": "MANUAL",
        },
    )
    assert incomplete_region.status_code == 400
    assert "Control region requires" in incomplete_region.json()["detail"]

    out_of_bounds_region = client.post(
        f"/api/qc-checklists/{checklist_code}/steps",
        json={
            "step_order": 1,
            "title": "Region wychodzi poza obraz",
            "region_x": 80,
            "region_y": 10,
            "region_width": 30,
            "region_height": 15,
            "evaluation_mode": "MANUAL",
        },
    )
    assert out_of_bounds_region.status_code == 400
    assert "fit inside the reference image bounds" in out_of_bounds_region.json()["detail"]


def test_qc_text_match_step_uses_observed_value_for_automatic_result():
    quality_session = start_work_session(role="QUALITY_INSPECTOR")
    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")

    create_item = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "SCREW_M4",
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
            "name": "Kontrola oznaczenia sruby",
            "process_stage": "COMPONENT_QC",
            "version": "1.0",
        },
    )
    assert checklist.status_code == 200

    step = client.post(
        f"/api/qc-checklists/{checklist_code}/steps",
        json={
            "step_order": 1,
            "title": "Zweryfikuj oznaczenie",
            "evaluation_mode": "TEXT_MATCH",
            "expected_value": "A2-70",
            "result_input_label": "Odczyt oznaczenia",
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
            "checklist_id": checklist.json()["id"],
            "process_stage": "COMPONENT_QC",
            "work_session_id": quality_session["work_session_id"],
        },
    )
    assert qc_run.status_code == 200

    mismatch_result = client.post(
        f"/api/qc-runs/{run_id}/steps/{step_id}/result",
        json={"status": "PASS", "observed_value": "A2-60"},
    )
    assert mismatch_result.status_code == 200
    assert mismatch_result.json()["status"] == "FAIL"

    completed = client.post(f"/api/qc-runs/{run_id}/complete", data={})
    assert completed.status_code == 200
    assert completed.json()["result"] == "FAIL"


def test_skip_component_qc_allows_assembly_without_prior_qc_pass():
    device_type = unique_id("DT")
    create_device_bom_template_with_items(
        device_type,
        items=[
            {
                "component_type": "SILICONE_PACK",
                "quantity_required": 1,
                "is_required": True,
            }
        ],
    )

    checklist_code = unique_id("CHK")
    skip_checklist = client.post(
        "/api/qc-checklists",
        json={
            "checklist_code": checklist_code,
            "name": "Pomijana kontrola silikonu",
            "process_stage": "COMPONENT_QC",
            "version": "1.0",
            "device_type": device_type,
            "variant_code": "DEFAULT",
            "component_type": "SILICONE_PACK",
            "skip_component_qc": True,
        },
    )
    assert skip_checklist.status_code == 200
    assert skip_checklist.json()["skip_component_qc"] is True

    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert device_response.status_code == 200

    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")
    item_response = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "SILICONE_PACK",
            "work_session_id": session["work_session_id"],
            "workstation_id": session["workstation_id"],
        },
    )
    assert item_response.status_code == 200

    produced = client.patch(
        f"/api/production-items/{item_serial_number}/status",
        json={"current_status": "PRODUCED"},
    )
    assert produced.status_code == 200
    assert produced.json()["current_status"] == "PRODUCED"

    install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": barcode_value,
            "component_type": "SILICONE_PACK",
            "work_session_id": session["work_session_id"],
        },
    )
    assert install.status_code == 200

    quality_after = client.get(f"/api/devices/{device_serial_number}/component-quality")
    assert quality_after.status_code == 200
    assert quality_after.json()["passes_component_quality_gate"] is True
    assert quality_after.json()["primary_quality_status"] == "PASS"
    assert quality_after.json()["components"][0]["component_qc_passed"] is True


def test_assembly_scan_installs_component_and_blocks_duplicate_use():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("ZSS")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
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


def test_assembly_scan_requires_component_qc_passed():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item_serial_number = unique_id("ITEM")
    barcode_value = unique_id("BC")
    created = client.post(
        "/api/production-items",
        json={
            "item_serial_number": item_serial_number,
            "barcode_value": barcode_value,
            "item_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
            "created_by_operator_id": session["operator_id"],
            "workstation_id": session["workstation_id"],
        },
    )
    assert created.status_code == 200

    produced = client.patch(
        f"/api/production-items/{item_serial_number}/status",
        json={"current_status": "PRODUCED"},
    )
    assert produced.status_code == 200

    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": barcode_value,
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Component must be QC_PASSED before assembly"


def test_assembly_scan_blocks_component_with_open_critical_ncr():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
    session = start_work_session(role="PRODUCTION_OPERATOR")
    device_serial_number = unique_id("DEV")

    create_device = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert create_device.status_code == 200

    item = create_qc_passed_item(session, item_type="CONTROL_PCB")
    ncr = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": unique_id("NCR"),
            "component_serial_number": item["item_serial_number"],
            "process_stage": "QC",
            "description": "Critical component issue",
            "severity": "CRITICAL",
            "detected_by": "pytest",
        },
    )
    assert ncr.status_code == 200

    blocked = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": session["work_session_id"],
        },
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Component has open critical NCR and cannot be assembled"


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
    assert blocked.json()["detail"] == "No active effective BOM template available for device type"


def test_assembly_scan_blocks_when_only_active_bom_is_not_effective_yet():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        effective_from=(utc_now() + timedelta(days=1)).isoformat(),
    )

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
    assert blocked.json()["detail"] == "No active effective BOM template available for device type"


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
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
    device_serial_number = unique_id("ZSS")
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

    device_audit = client.get(
        f"/api/audit-events?entity_type=DEVICE&entity_id={device_serial_number}"
    )
    assert device_audit.status_code == 200
    shipment_gate_event = next(
        row for row in device_audit.json() if row["event_type"] == "SHIPMENT_GATE_PASSED"
    )
    assert shipment_gate_event["result"] == "PASS"
    assert shipment_gate_event["message"] == "Shipment gate passed"
    assert shipment_gate_event["payload"]["requested_status"] == "READY_FOR_SHIPMENT"
    assert shipment_gate_event["payload"]["current_status_before"] == "FINAL_TEST_PASSED"
    assert shipment_gate_event["payload"]["can_transition_to_ready_for_shipment"] is True
    assert shipment_gate_event["payload"]["primary_blocking_code"] is None
    assert shipment_gate_event["payload"]["recommended_action"] == "MARK_READY_FOR_SHIPMENT"
    assert shipment_gate_event["payload"]["blocking_codes"] == []

    audit = client.get(f"/api/audit-events?entity_type=FINAL_TEST&entity_id={test_run_id}")
    assert audit.status_code == 200
    assert audit.json()[0]["work_session_id"] == session["work_session_id"]
    assert audit.json()[0]["result"] == "PASS"


def test_shipment_is_blocked_when_required_component_is_missing():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
    device_serial_number = unique_id("ZSS")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
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

    device_audit = client.get(
        f"/api/audit-events?entity_type=DEVICE&entity_id={device_serial_number}"
    )
    assert device_audit.status_code == 200
    shipment_gate_event = next(
        row for row in device_audit.json() if row["event_type"] == "SHIPMENT_GATE_BLOCKED"
    )
    assert shipment_gate_event["result"] == "BLOCKED"
    assert shipment_gate_event["message"] == "READY_FOR_SHIPMENT requires installed components"
    assert shipment_gate_event["payload"]["requested_status"] == "READY_FOR_SHIPMENT"
    assert shipment_gate_event["payload"]["current_status_before"] == "FINAL_TEST_PASSED"
    assert shipment_gate_event["payload"]["can_transition_to_ready_for_shipment"] is False
    assert shipment_gate_event["payload"]["primary_blocking_code"] == "BOM_REQUIRED_COMPONENTS_MISSING"
    assert shipment_gate_event["payload"]["recommended_action"] == "COMPLETE_ASSEMBLY"
    assert shipment_gate_event["payload"]["blocking_codes"] == ["BOM_REQUIRED_COMPONENTS_MISSING"]
    assert shipment_gate_event["payload"]["missing_required_components"] == ["CONTROL_PCB"]


def test_shipment_is_blocked_when_installed_component_has_open_critical_ncr():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
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

    component_ncr = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": unique_id("NCR"),
            "component_serial_number": item["item_serial_number"],
            "process_stage": "SERVICE",
            "description": "Critical component blocker",
            "severity": "CRITICAL",
            "detected_by": "pytest",
        },
    )
    assert component_ncr.status_code == 200

    blocked = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Open critical NCR on installed components blocks shipment"

    readiness = client.get(f"/api/devices/{device_serial_number}/shipment-readiness")
    assert readiness.status_code == 200
    payload = readiness.json()
    assert payload["primary_blocking_code"] == "COMPONENT_CRITICAL_OPEN_NCR"
    assert payload["recommended_action"] == "RESOLVE_COMPONENT_QUALITY"
    assert any(
        check["code"] == "COMPONENT_CRITICAL_OPEN_NCR"
        and component_ncr.json()["ncr_id"] in check["details"]
        for check in payload["blocking_checks"]
    )


def test_shipment_is_blocked_when_installed_component_lacks_qc_passed_flag():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
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

    with SessionLocal() as db:
        link = (
            db.query(AssemblyLink)
            .filter(AssemblyLink.child_barcode_value == item["barcode_value"])
            .first()
        )
        assert link is not None
        link.component_qc_passed = False
        db.commit()

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
    assert blocked.json()["detail"] == "READY_FOR_SHIPMENT requires installed components with QC_PASSED"

    readiness = client.get(f"/api/devices/{device_serial_number}/shipment-readiness")
    assert readiness.status_code == 200
    payload = readiness.json()
    assert payload["primary_blocking_code"] == "COMPONENT_QC_NOT_PASSED"
    assert payload["recommended_action"] == "RESOLVE_COMPONENT_QUALITY"
    assert any(
        check["code"] == "COMPONENT_QC_NOT_PASSED"
        and f"{item['item_serial_number']} (CONTROL_PCB)" in check["details"]
        for check in payload["blocking_checks"]
    )


def test_component_quality_endpoint_reports_pass_qc_gap_and_component_ncr():
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

    db = SessionLocal()
    try:
        template = (
            db.query(DeviceBomTemplate)
            .filter(
                DeviceBomTemplate.device_type == device_type,
                DeviceBomTemplate.variant_code == "DEFAULT",
                DeviceBomTemplate.version == "1.0",
            )
            .first()
        )
        assert template is not None
        db.add_all(
            [
                AssemblyLink(
                    parent_device_serial_number=device_serial_number,
                    child_item_serial_number=unique_id("ITEM"),
                    child_barcode_value=unique_id("BC"),
                    component_type="CONTROL_PCB",
                    installed_by="pytest",
                    installed_at=utc_now(),
                    bom_template_id=template.id,
                    bom_version=template.version,
                    scan_event_id=unique_id("SCAN"),
                    status="INSTALLED",
                    component_qc_passed=True,
                ),
                AssemblyLink(
                    parent_device_serial_number=device_serial_number,
                    child_item_serial_number=unique_id("ITEM"),
                    child_barcode_value=unique_id("BC"),
                    component_type="FAN_MODULE",
                    installed_by="pytest",
                    installed_at=utc_now(),
                    bom_template_id=template.id,
                    bom_version=template.version,
                    scan_event_id=unique_id("SCAN"),
                    status="INSTALLED",
                    component_qc_passed=False,
                ),
                AssemblyLink(
                    parent_device_serial_number=device_serial_number,
                    child_item_serial_number=unique_id("ITEM"),
                    child_barcode_value=unique_id("BC"),
                    component_type="IO_MODULE",
                    installed_by="pytest",
                    installed_at=utc_now(),
                    bom_template_id=template.id,
                    bom_version=template.version,
                    scan_event_id=unique_id("SCAN"),
                    status="INSTALLED",
                    component_qc_passed=True,
                ),
            ]
        )
        db.commit()
        component_with_ncr_serial = (
            db.query(AssemblyLink.child_item_serial_number)
            .filter(
                AssemblyLink.parent_device_serial_number == device_serial_number,
                AssemblyLink.component_type == "IO_MODULE",
            )
            .scalar()
        )
    finally:
        db.close()

    component_ncr = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": unique_id("NCR"),
            "component_serial_number": component_with_ncr_serial,
            "process_stage": "INCOMING_INSPECTION",
            "description": "Critical issue on installed component",
            "severity": "CRITICAL",
            "detected_by": "pytest",
        },
    )
    assert component_ncr.status_code == 200

    response = client.get(f"/api/devices/{device_serial_number}/component-quality")
    assert response.status_code == 200
    payload = response.json()
    assert payload["device_serial_number"] == device_serial_number
    assert payload["total_installed_components"] == 3
    assert payload["passing_components"] == 1
    assert payload["blocked_components"] == 2
    assert payload["passes_component_quality_gate"] is False
    assert payload["primary_quality_status"] == "CRITICAL_NCR_OPEN"
    assert payload["primary_blocking_component_type"] == "IO_MODULE"
    assert payload["primary_blocking_component_serial_number"] == component_with_ncr_serial
    assert payload["recommended_action"] == "RESOLVE_COMPONENT_NCR"
    assert payload["stale_bucket"] == "LT_24H"

    quality_by_type = {row["component_type"]: row for row in payload["components"]}
    assert quality_by_type["CONTROL_PCB"]["quality_status"] == "PASS"
    assert quality_by_type["CONTROL_PCB"]["blocks_shipment"] is False
    assert quality_by_type["FAN_MODULE"]["quality_status"] == "QC_NOT_PASSED"
    assert quality_by_type["FAN_MODULE"]["blocks_shipment"] is True
    assert quality_by_type["FAN_MODULE"]["critical_open_ncr_ids"] == []
    assert quality_by_type["IO_MODULE"]["quality_status"] == "CRITICAL_NCR_OPEN"
    assert quality_by_type["IO_MODULE"]["blocks_shipment"] is True
    assert quality_by_type["IO_MODULE"]["critical_open_ncr_ids"] == [
        component_ncr.json()["ncr_id"]
    ]


def test_component_quality_queue_supports_summary_and_filters():
    queue_device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=queue_device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
    )

    passing_device = unique_id("DEV")
    qc_gap_device = unique_id("DEV")
    ncr_device = unique_id("DEV")
    for serial_number in (passing_device, qc_gap_device, ncr_device):
        created = client.post(
            "/api/devices",
            json={"device_serial_number": serial_number, "device_type": queue_device_type},
        )
        assert created.status_code == 200

    db = SessionLocal()
    try:
        template = (
            db.query(DeviceBomTemplate)
            .filter(
                DeviceBomTemplate.device_type == queue_device_type,
                DeviceBomTemplate.variant_code == "DEFAULT",
                DeviceBomTemplate.version == "1.0",
            )
            .first()
        )
        assert template is not None
        status_by_device = {
            passing_device: "CREATED",
            qc_gap_device: "FINAL_TEST_PASSED",
            ncr_device: "READY_FOR_SHIPMENT",
        }
        variant_by_device = {
            passing_device: "DEFAULT",
            qc_gap_device: "SERVICE",
            ncr_device: "DEFAULT",
        }
        created_at_by_device = {
            passing_device: utc_now() - timedelta(days=3),
            qc_gap_device: utc_now() - timedelta(days=2),
            ncr_device: utc_now() - timedelta(days=1),
        }
        updated_at_by_device = {
            passing_device: utc_now() - timedelta(days=8),
            qc_gap_device: utc_now() - timedelta(days=2),
            ncr_device: utc_now() - timedelta(hours=12),
        }
        for serial_number, production_status in status_by_device.items():
            device = (
                db.query(Device)
                .filter(Device.device_serial_number == serial_number)
                .first()
            )
            assert device is not None
            device.production_status = production_status
            device.variant_code = variant_by_device[serial_number]
            device.created_at = created_at_by_device[serial_number]
            device.updated_at = updated_at_by_device[serial_number]

        passing_component_serial = unique_id("ITEM")
        qc_gap_component_serial = unique_id("ITEM")
        ncr_component_serial = unique_id("ITEM")
        db.add_all(
            [
                AssemblyLink(
                    parent_device_serial_number=passing_device,
                    child_item_serial_number=passing_component_serial,
                    child_barcode_value=unique_id("BC"),
                    component_type="CONTROL_PCB",
                    installed_by="pytest",
                    installed_at=utc_now(),
                    bom_template_id=template.id,
                    bom_version=template.version,
                    scan_event_id=unique_id("SCAN"),
                    status="INSTALLED",
                    component_qc_passed=True,
                ),
                AssemblyLink(
                    parent_device_serial_number=qc_gap_device,
                    child_item_serial_number=qc_gap_component_serial,
                    child_barcode_value=unique_id("BC"),
                    component_type="FAN_MODULE",
                    installed_by="pytest",
                    installed_at=utc_now(),
                    bom_template_id=template.id,
                    bom_version=template.version,
                    scan_event_id=unique_id("SCAN"),
                    status="INSTALLED",
                    component_qc_passed=False,
                ),
                AssemblyLink(
                    parent_device_serial_number=ncr_device,
                    child_item_serial_number=ncr_component_serial,
                    child_barcode_value=unique_id("BC"),
                    component_type="IO_MODULE",
                    installed_by="pytest",
                    installed_at=utc_now(),
                    bom_template_id=template.id,
                    bom_version=template.version,
                    scan_event_id=unique_id("SCAN"),
                    status="INSTALLED",
                    component_qc_passed=True,
                ),
            ]
        )
        db.commit()
    finally:
        db.close()

    component_ncr = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": unique_id("NCR"),
            "component_serial_number": ncr_component_serial,
            "process_stage": "INCOMING_INSPECTION",
            "description": "Critical issue on installed component",
            "severity": "CRITICAL",
            "detected_by": "pytest",
        },
    )
    assert component_ncr.status_code == 200

    queue = client.get(f"/api/component-quality?device_type={queue_device_type}")
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_devices"] == 3
    assert payload["devices_with_issues"] == 2
    assert payload["returned_count"] == 3
    assert payload["filters"]["device_type"] == queue_device_type
    assert payload["filters"]["sort_by"] == "blocked_components"
    assert payload["filters"]["sort_desc"] is None
    assert payload["devices"][-1]["device_serial_number"] == passing_device
    assert {
        payload["devices"][0]["device_serial_number"],
        payload["devices"][1]["device_serial_number"],
    } == {qc_gap_device, ncr_device}
    device_rows = {row["device_serial_number"]: row for row in payload["devices"]}
    assert device_rows[passing_device]["primary_quality_status"] == "PASS"
    assert device_rows[passing_device]["passes_component_quality_gate"] is True
    assert device_rows[passing_device]["primary_blocking_component_type"] is None
    assert device_rows[passing_device]["primary_blocking_component_serial_number"] is None
    assert device_rows[passing_device]["recommended_action"] == "NO_ACTION"
    assert device_rows[passing_device]["device_created_at"] is not None
    assert device_rows[passing_device]["device_updated_at"] is not None
    assert device_rows[passing_device]["stale_bucket"] == "GT_7D"
    assert device_rows[qc_gap_device]["primary_quality_status"] == "QC_NOT_PASSED"
    assert device_rows[qc_gap_device]["passes_component_quality_gate"] is False
    assert device_rows[qc_gap_device]["primary_blocking_component_type"] == "FAN_MODULE"
    assert (
        device_rows[qc_gap_device]["primary_blocking_component_serial_number"]
        == qc_gap_component_serial
    )
    assert (
        device_rows[qc_gap_device]["recommended_action"]
        == "RUN_COMPONENT_QC_OR_REWORK"
    )
    assert device_rows[qc_gap_device]["stale_bucket"] == "D1_TO_D3"
    assert device_rows[ncr_device]["primary_quality_status"] == "CRITICAL_NCR_OPEN"
    assert device_rows[ncr_device]["passes_component_quality_gate"] is False
    assert device_rows[ncr_device]["primary_blocking_component_type"] == "IO_MODULE"
    assert (
        device_rows[ncr_device]["primary_blocking_component_serial_number"]
        == ncr_component_serial
    )
    assert (
        device_rows[ncr_device]["recommended_action"] == "RESOLVE_COMPONENT_NCR"
    )
    assert device_rows[ncr_device]["stale_bucket"] == "LT_24H"

    status_summary = {
        entry["quality_status"]: (entry["component_count"], entry["device_count"])
        for entry in payload["quality_status_summary"]
    }
    assert status_summary["PASS"] == (1, 1)
    assert status_summary["QC_NOT_PASSED"] == (1, 1)
    assert status_summary["CRITICAL_NCR_OPEN"] == (1, 1)
    variant_summary = {
        entry["variant_code"]: entry["device_count"]
        for entry in payload["variant_code_summary"]
    }
    assert variant_summary["DEFAULT"] == 2
    assert variant_summary["SERVICE"] == 1
    production_status_summary = {
        entry["production_status"]: entry["device_count"]
        for entry in payload["production_status_summary"]
    }
    assert production_status_summary["CREATED"] == 1
    assert production_status_summary["FINAL_TEST_PASSED"] == 1
    assert production_status_summary["READY_FOR_SHIPMENT"] == 1
    primary_status_summary = {
        entry["primary_quality_status"]: entry["device_count"]
        for entry in payload["primary_quality_status_summary"]
    }
    assert primary_status_summary["PASS"] == 1
    assert primary_status_summary["QC_NOT_PASSED"] == 1
    assert primary_status_summary["CRITICAL_NCR_OPEN"] == 1
    component_quality_gate_summary = {
        entry["passes_component_quality_gate"]: entry["device_count"]
        for entry in payload["component_quality_gate_summary"]
    }
    assert component_quality_gate_summary[True] == 1
    assert component_quality_gate_summary[False] == 2
    staleness_summary = {
        entry["stale_bucket"]: entry["device_count"]
        for entry in payload["staleness_summary"]
    }
    assert staleness_summary["GT_7D"] == 1
    assert staleness_summary["D1_TO_D3"] == 1
    assert staleness_summary["LT_24H"] == 1
    component_type_summary = {
        entry["component_type"]: (entry["component_count"], entry["device_count"])
        for entry in payload["component_type_summary"]
    }
    assert component_type_summary["CONTROL_PCB"] == (1, 1)
    assert component_type_summary["FAN_MODULE"] == (1, 1)
    assert component_type_summary["IO_MODULE"] == (1, 1)
    blocking_component_type_summary = {
        entry["component_type"]: (entry["component_count"], entry["device_count"])
        for entry in payload["blocking_component_type_summary"]
    }
    assert blocking_component_type_summary["FAN_MODULE"] == (1, 1)
    assert blocking_component_type_summary["IO_MODULE"] == (1, 1)
    assert "CONTROL_PCB" not in blocking_component_type_summary
    primary_blocking_component_type_summary = {
        entry["component_type"]: entry["device_count"]
        for entry in payload["primary_blocking_component_type_summary"]
    }
    assert primary_blocking_component_type_summary["FAN_MODULE"] == 1
    assert primary_blocking_component_type_summary["IO_MODULE"] == 1
    recommended_action_summary = {
        entry["recommended_action"]: entry["device_count"]
        for entry in payload["recommended_action_summary"]
    }
    assert recommended_action_summary["NO_ACTION"] == 1
    assert recommended_action_summary["RUN_COMPONENT_QC_OR_REWORK"] == 1
    assert recommended_action_summary["RESOLVE_COMPONENT_NCR"] == 1

    blocked_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&only_blocking=true"
    )
    assert blocked_only.status_code == 200
    assert blocked_only.json()["total_devices"] == 2
    assert {
        row["device_serial_number"] for row in blocked_only.json()["devices"]
    } == {qc_gap_device, ncr_device}

    gate_passing_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&passes_component_quality_gate=true"
    )
    assert gate_passing_only.status_code == 200
    gate_passing_payload = gate_passing_only.json()
    assert gate_passing_payload["total_devices"] == 1
    assert gate_passing_payload["filters"]["passes_component_quality_gate"] is True
    assert [row["device_serial_number"] for row in gate_passing_payload["devices"]] == [
        passing_device
    ]

    gate_blocked_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&passes_component_quality_gate=false"
    )
    assert gate_blocked_only.status_code == 200
    gate_blocked_payload = gate_blocked_only.json()
    assert gate_blocked_payload["total_devices"] == 2
    assert gate_blocked_payload["filters"]["passes_component_quality_gate"] is False
    assert {
        row["device_serial_number"] for row in gate_blocked_payload["devices"]
    } == {qc_gap_device, ncr_device}

    ncr_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&quality_status=CRITICAL_NCR_OPEN"
    )
    assert ncr_only.status_code == 200
    assert [row["device_serial_number"] for row in ncr_only.json()["devices"]] == [ncr_device]

    ready_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&production_status=READY_FOR_SHIPMENT"
    )
    assert ready_only.status_code == 200
    ready_only_payload = ready_only.json()
    assert ready_only_payload["total_devices"] == 1
    assert ready_only_payload["filters"]["production_status"] == "READY_FOR_SHIPMENT"
    assert [row["device_serial_number"] for row in ready_only_payload["devices"]] == [
        ncr_device
    ]

    stale_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&stale_bucket=GT_7D"
    )
    assert stale_only.status_code == 200
    stale_payload = stale_only.json()
    assert stale_payload["total_devices"] == 1
    assert stale_payload["filters"]["stale_bucket"] == "GT_7D"
    assert [row["device_serial_number"] for row in stale_payload["devices"]] == [
        passing_device
    ]

    created_after_only = client.get(
        "/api/component-quality",
        params={
            "device_type": queue_device_type,
            "created_after": created_at_by_device[qc_gap_device].isoformat(),
            "sort_by": "created_at",
        },
    )
    assert created_after_only.status_code == 200
    created_after_payload = created_after_only.json()
    assert created_after_payload["total_devices"] == 2
    assert created_after_payload["filters"]["created_after"] == created_at_by_device[
        qc_gap_device
    ].isoformat()
    assert [row["device_serial_number"] for row in created_after_payload["devices"]] == [
        qc_gap_device,
        ncr_device,
    ]

    created_before_only = client.get(
        "/api/component-quality",
        params={
            "device_type": queue_device_type,
            "created_before": created_at_by_device[qc_gap_device].isoformat(),
            "sort_by": "created_at",
        },
    )
    assert created_before_only.status_code == 200
    created_before_payload = created_before_only.json()
    assert created_before_payload["total_devices"] == 2
    assert created_before_payload["filters"]["created_before"] == created_at_by_device[
        qc_gap_device
    ].isoformat()
    assert [row["device_serial_number"] for row in created_before_payload["devices"]] == [
        passing_device,
        qc_gap_device,
    ]

    updated_after_only = client.get(
        "/api/component-quality",
        params={
            "device_type": queue_device_type,
            "updated_after": updated_at_by_device[qc_gap_device].isoformat(),
            "sort_by": "updated_at",
            "sort_desc": True,
        },
    )
    assert updated_after_only.status_code == 200
    updated_after_payload = updated_after_only.json()
    assert updated_after_payload["total_devices"] == 2
    assert updated_after_payload["filters"]["updated_after"] == updated_at_by_device[
        qc_gap_device
    ].isoformat()
    assert [row["device_serial_number"] for row in updated_after_payload["devices"]] == [
        ncr_device,
        qc_gap_device,
    ]

    updated_before_only = client.get(
        "/api/component-quality",
        params={
            "device_type": queue_device_type,
            "updated_before": updated_at_by_device[qc_gap_device].isoformat(),
            "sort_by": "updated_at",
        },
    )
    assert updated_before_only.status_code == 200
    updated_before_payload = updated_before_only.json()
    assert updated_before_payload["total_devices"] == 2
    assert updated_before_payload["filters"]["updated_before"] == updated_at_by_device[
        qc_gap_device
    ].isoformat()
    assert [row["device_serial_number"] for row in updated_before_payload["devices"]] == [
        passing_device,
        qc_gap_device,
    ]

    service_variant_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&variant_code=SERVICE"
    )
    assert service_variant_only.status_code == 200
    service_variant_payload = service_variant_only.json()
    assert service_variant_payload["total_devices"] == 1
    assert service_variant_payload["filters"]["variant_code"] == "SERVICE"
    assert [row["device_serial_number"] for row in service_variant_payload["devices"]] == [
        qc_gap_device
    ]
    assert service_variant_payload["variant_code_summary"] == [
        {"variant_code": "SERVICE", "device_count": 1}
    ]

    primary_qc_gap_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&primary_quality_status=QC_NOT_PASSED"
    )
    assert primary_qc_gap_only.status_code == 200
    primary_qc_gap_payload = primary_qc_gap_only.json()
    assert primary_qc_gap_payload["total_devices"] == 1
    assert primary_qc_gap_payload["filters"]["primary_quality_status"] == "QC_NOT_PASSED"
    assert [row["device_serial_number"] for row in primary_qc_gap_payload["devices"]] == [
        qc_gap_device
    ]

    primary_blocking_type_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&primary_blocking_component_type=IO_MODULE"
    )
    assert primary_blocking_type_only.status_code == 200
    primary_blocking_type_payload = primary_blocking_type_only.json()
    assert primary_blocking_type_payload["total_devices"] == 1
    assert (
        primary_blocking_type_payload["filters"]["primary_blocking_component_type"]
        == "IO_MODULE"
    )
    assert [row["device_serial_number"] for row in primary_blocking_type_payload["devices"]] == [
        ncr_device
    ]

    primary_blocking_serial_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&primary_blocking_component_serial_number={ncr_component_serial}"
    )
    assert primary_blocking_serial_only.status_code == 200
    primary_blocking_serial_payload = primary_blocking_serial_only.json()
    assert primary_blocking_serial_payload["total_devices"] == 1
    assert (
        primary_blocking_serial_payload["filters"]["primary_blocking_component_serial_number"]
        == ncr_component_serial
    )
    assert [row["device_serial_number"] for row in primary_blocking_serial_payload["devices"]] == [
        ncr_device
    ]

    fan_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&component_type=FAN_MODULE"
    )
    assert fan_only.status_code == 200
    fan_payload = fan_only.json()
    assert fan_payload["total_devices"] == 1
    assert [row["device_serial_number"] for row in fan_payload["devices"]] == [qc_gap_device]
    assert fan_payload["filters"]["component_type"] == "FAN_MODULE"
    assert fan_payload["component_type_summary"] == [
        {"component_type": "FAN_MODULE", "component_count": 1, "device_count": 1}
    ]

    blocking_fan_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&blocking_component_type=FAN_MODULE"
    )
    assert blocking_fan_only.status_code == 200
    blocking_fan_payload = blocking_fan_only.json()
    assert blocking_fan_payload["total_devices"] == 1
    assert blocking_fan_payload["filters"]["blocking_component_type"] == "FAN_MODULE"
    assert [row["device_serial_number"] for row in blocking_fan_payload["devices"]] == [
        qc_gap_device
    ]
    assert blocking_fan_payload["blocking_component_type_summary"] == [
        {"component_type": "FAN_MODULE", "component_count": 1, "device_count": 1}
    ]

    ncr_action_only = client.get(
        f"/api/component-quality?device_type={queue_device_type}&recommended_action=RESOLVE_COMPONENT_NCR"
    )
    assert ncr_action_only.status_code == 200
    ncr_action_payload = ncr_action_only.json()
    assert ncr_action_payload["total_devices"] == 1
    assert ncr_action_payload["filters"]["recommended_action"] == "RESOLVE_COMPONENT_NCR"
    assert [row["device_serial_number"] for row in ncr_action_payload["devices"]] == [
        ncr_device
    ]

    serial_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=device_serial_number"
    )
    assert serial_sorted.status_code == 200
    assert [row["device_serial_number"] for row in serial_sorted.json()["devices"]] == sorted(
        [passing_device, qc_gap_device, ncr_device]
    )

    variant_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=variant_code"
    )
    assert variant_sorted.status_code == 200
    assert [row["device_variant_code"] for row in variant_sorted.json()["devices"]] == [
        "DEFAULT",
        "DEFAULT",
        "SERVICE",
    ]

    action_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=recommended_action"
    )
    assert action_sorted.status_code == 200
    assert [row["recommended_action"] for row in action_sorted.json()["devices"]] == [
        "NO_ACTION",
        "RESOLVE_COMPONENT_NCR",
        "RUN_COMPONENT_QC_OR_REWORK",
    ]

    blocker_type_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=primary_blocking_component_type"
    )
    assert blocker_type_sorted.status_code == 200
    assert [row["primary_blocking_component_type"] for row in blocker_type_sorted.json()["devices"]] == [
        None,
        "FAN_MODULE",
        "IO_MODULE",
    ]

    blocker_serial_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=primary_blocking_component_serial_number"
    )
    assert blocker_serial_sorted.status_code == 200
    sorted_blocker_serials = [
        row["primary_blocking_component_serial_number"]
        for row in blocker_serial_sorted.json()["devices"]
    ]
    assert sorted_blocker_serials[0] is None
    assert sorted_blocker_serials[1:] == sorted(
        [qc_gap_component_serial, ncr_component_serial]
    )

    gate_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=passes_component_quality_gate"
    )
    assert gate_sorted.status_code == 200
    gate_sorted_rows = gate_sorted.json()["devices"]
    assert gate_sorted_rows[0]["passes_component_quality_gate"] is True
    assert [row["passes_component_quality_gate"] for row in gate_sorted_rows[1:]] == [
        False,
        False,
    ]

    created_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=created_at"
    )
    assert created_sorted.status_code == 200
    assert [row["device_serial_number"] for row in created_sorted.json()["devices"]] == [
        passing_device,
        qc_gap_device,
        ncr_device,
    ]

    updated_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=updated_at&sort_desc=true"
    )
    assert updated_sorted.status_code == 200
    assert [row["device_serial_number"] for row in updated_sorted.json()["devices"]] == [
        ncr_device,
        qc_gap_device,
        passing_device,
    ]

    stale_sorted = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=stale_bucket&sort_desc=true"
    )
    assert stale_sorted.status_code == 200
    assert [row["stale_bucket"] for row in stale_sorted.json()["devices"]] == [
        "GT_7D",
        "D1_TO_D3",
        "LT_24H",
    ]


def test_component_quality_queue_rejects_unsupported_sort_by():
    response = client.get("/api/component-quality?sort_by=unsupported")
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported component quality sort_by value"


def test_component_quality_queue_supports_pagination():
    queue_device_type = unique_id("DEMO-CQ")
    seed_tag = unique_id("PAG")
    seeded = seed_operations_dashboard_demo(
        device_type=queue_device_type,
        tag=seed_tag,
        verify=True,
    )
    expected_serials = sorted(
        [
            seeded.ready_device_serial_number,
            seeded.assembly_gap_device_serial_number,
            seeded.final_test_gap_device_serial_number,
            seeded.component_qc_gap_device_serial_number,
            seeded.component_ncr_device_serial_number,
            seeded.device_ncr_device_serial_number,
        ]
    )

    first_page = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=device_serial_number&limit=2"
    )
    assert first_page.status_code == 200
    first_payload = first_page.json()
    assert first_payload["total_devices"] == 6
    assert first_payload["devices_with_issues"] == 2
    assert first_payload["returned_count"] == 2
    assert first_payload["offset"] == 0
    assert first_payload["limit"] == 2
    assert first_payload["has_more"] is True
    assert first_payload["next_offset"] == 2
    assert first_payload["filters"]["device_type"] == queue_device_type
    assert first_payload["filters"]["sort_by"] == "device_serial_number"
    assert first_payload["filters"]["offset"] == 0
    assert first_payload["filters"]["limit"] == 2
    assert [row["device_serial_number"] for row in first_payload["devices"]] == expected_serials[:2]

    second_page = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=device_serial_number&limit=2&offset=2"
    )
    assert second_page.status_code == 200
    second_payload = second_page.json()
    assert second_payload["total_devices"] == 6
    assert second_payload["devices_with_issues"] == 2
    assert second_payload["returned_count"] == 2
    assert second_payload["offset"] == 2
    assert second_payload["limit"] == 2
    assert second_payload["has_more"] is True
    assert second_payload["next_offset"] == 4
    assert [row["device_serial_number"] for row in second_payload["devices"]] == expected_serials[2:4]

    third_page = client.get(
        f"/api/component-quality?device_type={queue_device_type}&sort_by=device_serial_number&limit=2&offset=4"
    )
    assert third_page.status_code == 200
    third_payload = third_page.json()
    assert third_payload["total_devices"] == 6
    assert third_payload["devices_with_issues"] == 2
    assert third_payload["returned_count"] == 2
    assert third_payload["offset"] == 4
    assert third_payload["limit"] == 2
    assert third_payload["has_more"] is False
    assert third_payload["next_offset"] is None
    assert [row["device_serial_number"] for row in third_payload["devices"]] == expected_serials[4:]


def test_component_quality_queue_rejects_unsupported_recommended_action():
    response = client.get("/api/component-quality?recommended_action=UNSUPPORTED")
    assert response.status_code == 400
    assert (
        response.json()["detail"]
        == "Unsupported component quality recommended_action filter"
    )


def test_component_quality_queue_rejects_unsupported_primary_quality_status():
    response = client.get("/api/component-quality?primary_quality_status=UNSUPPORTED")
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported primary_quality_status filter"


def test_component_quality_queue_rejects_unsupported_stale_bucket():
    response = client.get("/api/component-quality?stale_bucket=UNSUPPORTED")
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported stale_bucket filter"


def test_component_quality_queue_rejects_invalid_update_window():
    response = client.get(
        "/api/component-quality",
        params={
            "updated_after": "2026-05-01T12:00:00+00:00",
            "updated_before": "2026-05-01T11:00:00+00:00",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "updated_after must be <= updated_before"


def test_component_quality_queue_rejects_invalid_create_window():
    response = client.get(
        "/api/component-quality",
        params={
            "created_after": "2026-05-01T12:00:00+00:00",
            "created_before": "2026-05-01T11:00:00+00:00",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "created_after must be <= created_before"


def test_component_quality_queue_rejects_invalid_pagination():
    negative_offset = client.get("/api/component-quality?offset=-1")
    assert negative_offset.status_code == 400
    assert negative_offset.json()["detail"] == "offset must be >= 0"

    zero_limit = client.get("/api/component-quality?limit=0")
    assert zero_limit.status_code == 400
    assert zero_limit.json()["detail"] == "limit must be >= 1"

    over_limit = client.get("/api/component-quality?limit=501")
    assert over_limit.status_code == 400
    assert over_limit.json()["detail"] == "limit must be <= 500"


def test_audit_events_can_filter_shipment_gate_by_event_type_and_result():
    allowed_device_type = unique_id("DT")
    ensure_device_bom_template(allowed_device_type, component_type="CONTROL_PCB")
    allowed_device_serial_number = unique_id("DEV")
    allowed_device = client.post(
        "/api/devices",
        json={
            "device_serial_number": allowed_device_serial_number,
            "device_type": allowed_device_type,
        },
    )
    assert allowed_device.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{allowed_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    allowed_final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": allowed_device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert allowed_final_test.status_code == 200

    allowed_ready = client.patch(
        f"/api/devices/{allowed_device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert allowed_ready.status_code == 200

    blocked_device_type = unique_id("DT")
    ensure_device_bom_template(blocked_device_type, component_type="CONTROL_PCB")
    blocked_device_serial_number = unique_id("DEV")
    blocked_device = client.post(
        "/api/devices",
        json={
            "device_serial_number": blocked_device_serial_number,
            "device_type": blocked_device_type,
        },
    )
    assert blocked_device.status_code == 200

    blocked_final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": blocked_device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert blocked_final_test.status_code == 200

    blocked_ready = client.patch(
        f"/api/devices/{blocked_device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert blocked_ready.status_code == 400

    passed_events = client.get(
        "/api/audit-events?entity_type=DEVICE&event_type=SHIPMENT_GATE_PASSED&result=PASS"
    )
    assert passed_events.status_code == 200
    assert any(
        row["entity_id"] == allowed_device_serial_number and row["event_type"] == "SHIPMENT_GATE_PASSED"
        for row in passed_events.json()
    )
    assert all(row["event_type"] == "SHIPMENT_GATE_PASSED" for row in passed_events.json())
    assert all(row["result"] == "PASS" for row in passed_events.json())

    blocked_events = client.get(
        "/api/audit-events?entity_type=DEVICE&event_type=SHIPMENT_GATE_BLOCKED&result=BLOCKED"
    )
    assert blocked_events.status_code == 200
    assert any(
        row["entity_id"] == blocked_device_serial_number and row["event_type"] == "SHIPMENT_GATE_BLOCKED"
        for row in blocked_events.json()
    )
    assert all(row["event_type"] == "SHIPMENT_GATE_BLOCKED" for row in blocked_events.json())
    assert all(row["result"] == "BLOCKED" for row in blocked_events.json())


def test_device_shipment_gate_history_returns_blocked_and_passed_attempts():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
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

    blocked_attempt = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert blocked_attempt.status_code == 400

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

    passed_attempt = client.patch(
        f"/api/devices/{device_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert passed_attempt.status_code == 200

    history = client.get(f"/api/devices/{device_serial_number}/shipment-gate-history")
    assert history.status_code == 200
    payload = history.json()
    assert [row["event_type"] for row in payload] == [
        "SHIPMENT_GATE_PASSED",
        "SHIPMENT_GATE_BLOCKED",
    ]
    assert payload[0]["result"] == "PASS"
    assert payload[1]["result"] == "BLOCKED"
    assert payload[0]["entity_id"] == device_serial_number
    assert payload[1]["entity_id"] == device_serial_number
    assert payload[0]["payload"]["requested_status"] == "READY_FOR_SHIPMENT"
    assert payload[1]["payload"]["requested_status"] == "READY_FOR_SHIPMENT"

    blocked_only = client.get(
        f"/api/devices/{device_serial_number}/shipment-gate-history?result=BLOCKED"
    )
    assert blocked_only.status_code == 200
    assert [row["event_type"] for row in blocked_only.json()] == ["SHIPMENT_GATE_BLOCKED"]

    passed_only = client.get(
        f"/api/devices/{device_serial_number}/shipment-gate-history?result=PASS"
    )
    assert passed_only.status_code == 200
    assert [row["event_type"] for row in passed_only.json()] == ["SHIPMENT_GATE_PASSED"]

    readiness = client.get(f"/api/devices/{device_serial_number}/shipment-readiness")
    assert readiness.status_code == 200
    latest_decision = readiness.json()["latest_shipment_gate_decision"]
    assert latest_decision["event_type"] == "SHIPMENT_GATE_PASSED"
    assert latest_decision["result"] == "PASS"
    assert latest_decision["recommended_action"] == "MARK_READY_FOR_SHIPMENT"


def test_shipment_readiness_queue_can_filter_by_latest_gate_result():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")

    pass_serial_number = unique_id("DEV")
    blocked_serial_number = unique_id("DEV")
    none_serial_number = unique_id("DEV")
    for serial_number in [pass_serial_number, blocked_serial_number, none_serial_number]:
        response = client.post(
            "/api/devices",
            json={"device_serial_number": serial_number, "device_type": device_type},
        )
        assert response.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    for serial_number in [pass_serial_number, blocked_serial_number]:
        final_test = client.post(
            "/api/final-tests",
            json={
                "test_run_id": unique_id("FT"),
                "device_serial_number": serial_number,
                "result": "PASS",
                "firmware_version": "1.2.4",
                "bootloader_version": "0.9.8",
                "work_session_id": final_test_session["work_session_id"],
            },
        )
        assert final_test.status_code == 200

    blocked_attempt = client.patch(
        f"/api/devices/{blocked_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert blocked_attempt.status_code == 400

    first_blocked_attempt = client.patch(
        f"/api/devices/{pass_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert first_blocked_attempt.status_code == 400

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{pass_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    passed_attempt = client.patch(
        f"/api/devices/{pass_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert passed_attempt.status_code == 200

    queue = client.get(f"/api/shipment-readiness?device_type={device_type}")
    assert queue.status_code == 200
    payload = queue.json()
    latest_summary = {
        entry["result"]: entry["device_count"]
        for entry in payload["latest_shipment_gate_result_summary"]
    }
    assert latest_summary["PASS"] == 1
    assert latest_summary["BLOCKED"] == 1
    assert latest_summary["NONE"] == 1

    devices = {row["device_serial_number"]: row for row in payload["devices"]}
    assert devices[pass_serial_number]["latest_shipment_gate_decision"]["result"] == "PASS"
    assert devices[blocked_serial_number]["latest_shipment_gate_decision"]["result"] == "BLOCKED"
    assert devices[none_serial_number]["latest_shipment_gate_decision"] is None

    passed_only = client.get(
        f"/api/shipment-readiness?device_type={device_type}&latest_gate_result=PASS"
    )
    assert passed_only.status_code == 200
    assert [row["device_serial_number"] for row in passed_only.json()["devices"]] == [
        pass_serial_number
    ]

    blocked_only = client.get(
        f"/api/shipment-readiness?device_type={device_type}&latest_gate_result=BLOCKED"
    )
    assert blocked_only.status_code == 200
    assert [row["device_serial_number"] for row in blocked_only.json()["devices"]] == [
        blocked_serial_number
    ]

    none_only = client.get(
        f"/api/shipment-readiness?device_type={device_type}&latest_gate_result=NONE"
    )
    assert none_only.status_code == 200
    assert [row["device_serial_number"] for row in none_only.json()["devices"]] == [
        none_serial_number
    ]


def test_shipment_readiness_queue_can_filter_by_production_status():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")

    created_serial_number = unique_id("DEV")
    final_test_serial_number = unique_id("DEV")
    ready_serial_number = unique_id("DEV")
    for serial_number in [
        created_serial_number,
        final_test_serial_number,
        ready_serial_number,
    ]:
        response = client.post(
            "/api/devices",
            json={"device_serial_number": serial_number, "device_type": device_type},
        )
        assert response.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    for serial_number in [final_test_serial_number, ready_serial_number]:
        final_test = client.post(
            "/api/final-tests",
            json={
                "test_run_id": unique_id("FT"),
                "device_serial_number": serial_number,
                "result": "PASS",
                "firmware_version": "1.2.4",
                "bootloader_version": "0.9.8",
                "work_session_id": final_test_session["work_session_id"],
            },
        )
        assert final_test.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{ready_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    ready_response = client.patch(
        f"/api/devices/{ready_serial_number}/status",
        json={"production_status": "READY_FOR_SHIPMENT"},
    )
    assert ready_response.status_code == 200

    queue = client.get(f"/api/shipment-readiness?device_type={device_type}")
    assert queue.status_code == 200
    payload = queue.json()
    status_summary = {
        entry["production_status"]: entry["device_count"]
        for entry in payload["production_status_summary"]
    }
    assert status_summary["CREATED"] == 1
    assert status_summary["FINAL_TEST_PASSED"] == 1
    assert status_summary["READY_FOR_SHIPMENT"] == 1

    final_test_only = client.get(
        f"/api/shipment-readiness?device_type={device_type}&production_status=FINAL_TEST_PASSED"
    )
    assert final_test_only.status_code == 200
    assert final_test_only.json()["filters"]["production_status"] == "FINAL_TEST_PASSED"
    assert [row["device_serial_number"] for row in final_test_only.json()["devices"]] == [
        final_test_serial_number
    ]

    ready_only = client.get(
        f"/api/shipment-readiness?device_type={device_type}&production_status=READY_FOR_SHIPMENT"
    )
    assert ready_only.status_code == 200
    assert [row["device_serial_number"] for row in ready_only.json()["devices"]] == [
        ready_serial_number
    ]


def test_device_shipment_readiness_reports_multiple_blockers():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert device_response.status_code == 200

    readiness = client.get(f"/api/devices/{device_serial_number}/shipment-readiness")
    assert readiness.status_code == 200
    payload = readiness.json()
    assert payload["device_serial_number"] == device_serial_number
    assert payload["final_test_passed"] is False
    assert payload["has_critical_open_ncr"] is False
    assert payload["critical_open_ncr_ids"] == []
    assert payload["can_transition_to_ready_for_shipment"] is False
    assert payload["blocking_reasons"] == [
        "READY_FOR_SHIPMENT requires FINAL_TEST_PASSED",
        "READY_FOR_SHIPMENT requires installed components: CONTROL_PCB",
    ]
    assert payload["primary_blocking_code"] == "BOM_REQUIRED_COMPONENTS_MISSING"
    assert payload["primary_blocking_message"] == "READY_FOR_SHIPMENT requires installed components"
    assert payload["recommended_action"] == "COMPLETE_ASSEMBLY"
    assert [check["code"] for check in payload["blocking_checks"]] == [
        "FINAL_TEST_NOT_PASSED",
        "BOM_REQUIRED_COMPONENTS_MISSING",
    ]
    assert payload["bom_compliance"]["passes_bom_gate"] is False
    assert payload["bom_compliance"]["missing_required_components"] == ["CONTROL_PCB"]


def test_device_shipment_readiness_reports_critical_ncr_blocker():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
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

    ncr = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": unique_id("NCR"),
            "device_serial_number": device_serial_number,
            "process_stage": "FINAL_TEST",
            "description": "Critical blocker",
            "severity": "CRITICAL",
            "detected_by": "pytest",
        },
    )
    assert ncr.status_code == 200

    readiness = client.get(f"/api/devices/{device_serial_number}/shipment-readiness")
    assert readiness.status_code == 200
    payload = readiness.json()
    assert payload["final_test_passed"] is True
    assert payload["has_critical_open_ncr"] is True
    assert len(payload["critical_open_ncr_ids"]) == 1
    assert payload["can_transition_to_ready_for_shipment"] is False
    assert payload["primary_blocking_code"] == "CRITICAL_OPEN_NCR"
    assert payload["primary_blocking_message"] == "Open critical NCR blocks shipment"
    assert payload["recommended_action"] == "RESOLVE_CRITICAL_NCR"
    assert payload["blocking_reasons"] == ["Open critical NCR blocks shipment"]
    assert [check["code"] for check in payload["blocking_checks"]] == ["CRITICAL_OPEN_NCR"]
    assert payload["blocking_checks"][0]["details"] == payload["critical_open_ncr_ids"]
    assert payload["bom_compliance"]["passes_bom_gate"] is True


def test_device_shipment_readiness_passes_when_gate_is_clear():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")
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

    readiness = client.get(f"/api/devices/{device_serial_number}/shipment-readiness")
    assert readiness.status_code == 200
    payload = readiness.json()
    assert payload["final_test_passed"] is True
    assert payload["has_critical_open_ncr"] is False
    assert payload["critical_open_ncr_ids"] == []
    assert payload["can_transition_to_ready_for_shipment"] is True
    assert payload["primary_blocking_code"] is None
    assert payload["primary_blocking_message"] is None
    assert payload["recommended_action"] == "MARK_READY_FOR_SHIPMENT"
    assert payload["blocking_reasons"] == []
    assert payload["blocking_checks"] == []
    assert payload["bom_compliance"]["passes_bom_gate"] is True


def test_shipment_readiness_queue_lists_ready_and_blocked_devices():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")

    ready_device_serial_number = unique_id("DEV")
    blocked_device_serial_number = unique_id("DEV")

    ready_device = client.post(
        "/api/devices",
        json={"device_serial_number": ready_device_serial_number, "device_type": device_type},
    )
    assert ready_device.status_code == 200
    blocked_device = client.post(
        "/api/devices",
        json={"device_serial_number": blocked_device_serial_number, "device_type": device_type},
    )
    assert blocked_device.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{ready_device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": ready_device_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    queue = client.get(f"/api/shipment-readiness?device_type={device_type}")
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_devices"] == 2
    assert payload["ready_count"] == 1
    assert payload["blocked_count"] == 1
    assert payload["filters"]["device_type"] == device_type
    blocking_summary = {entry["code"]: entry for entry in payload["blocking_summary"]}
    assert blocking_summary["FINAL_TEST_NOT_PASSED"]["device_count"] == 1
    assert blocking_summary["BOM_REQUIRED_COMPONENTS_MISSING"]["device_count"] == 1
    primary_blocking_summary = {entry["code"]: entry for entry in payload["primary_blocking_summary"]}
    assert primary_blocking_summary["BOM_REQUIRED_COMPONENTS_MISSING"]["device_count"] == 1
    action_summary = {
        entry["recommended_action"]: entry for entry in payload["recommended_action_summary"]
    }
    assert action_summary["MARK_READY_FOR_SHIPMENT"]["device_count"] == 1
    assert action_summary["COMPLETE_ASSEMBLY"]["device_count"] == 1

    devices = {row["device_serial_number"]: row for row in payload["devices"]}
    assert devices[ready_device_serial_number]["can_transition_to_ready_for_shipment"] is True
    assert devices[ready_device_serial_number]["recommended_action"] == "MARK_READY_FOR_SHIPMENT"
    assert devices[blocked_device_serial_number]["can_transition_to_ready_for_shipment"] is False
    assert devices[blocked_device_serial_number]["recommended_action"] == "COMPLETE_ASSEMBLY"


def test_shipment_readiness_queue_can_filter_only_blocked_devices():
    blocked_device_type = unique_id("DT")
    ensure_device_bom_template(blocked_device_type, component_type="CONTROL_PCB")

    blocked_serial_number = unique_id("DEV")
    ready_serial_number = unique_id("DEV")

    blocked_created = client.post(
        "/api/devices",
        json={"device_serial_number": blocked_serial_number, "device_type": blocked_device_type},
    )
    assert blocked_created.status_code == 200
    ready_created = client.post(
        "/api/devices",
        json={"device_serial_number": ready_serial_number, "device_type": blocked_device_type},
    )
    assert ready_created.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{ready_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": ready_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    queue = client.get(
        f"/api/shipment-readiness?device_type={blocked_device_type}&only_blocked=true"
    )
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_devices"] == 1
    assert payload["ready_count"] == 0
    assert payload["blocked_count"] == 1
    assert [row["device_serial_number"] for row in payload["devices"]] == [blocked_serial_number]


def test_shipment_readiness_queue_can_filter_by_blocking_code():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")

    missing_serial_number = unique_id("DEV")
    ncr_serial_number = unique_id("DEV")

    missing_created = client.post(
        "/api/devices",
        json={"device_serial_number": missing_serial_number, "device_type": device_type},
    )
    assert missing_created.status_code == 200
    ncr_created = client.post(
        "/api/devices",
        json={"device_serial_number": ncr_serial_number, "device_type": device_type},
    )
    assert ncr_created.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{ncr_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": ncr_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    ncr = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": unique_id("NCR"),
            "device_serial_number": ncr_serial_number,
            "process_stage": "FINAL_TEST",
            "description": "Critical blocker",
            "severity": "CRITICAL",
            "detected_by": "pytest",
        },
    )
    assert ncr.status_code == 200

    queue = client.get(
        f"/api/shipment-readiness?device_type={device_type}&blocking_code=CRITICAL_OPEN_NCR"
    )
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_devices"] == 1
    assert payload["ready_count"] == 0
    assert payload["blocked_count"] == 1
    assert payload["filters"]["blocking_code"] == "CRITICAL_OPEN_NCR"
    assert [row["device_serial_number"] for row in payload["devices"]] == [ncr_serial_number]
    assert payload["blocking_summary"] == [
        {
            "code": "CRITICAL_OPEN_NCR",
            "message": "Open critical NCR blocks shipment",
            "device_count": 1,
        }
    ]
    assert payload["primary_blocking_summary"] == [
        {
            "code": "CRITICAL_OPEN_NCR",
            "message": "Open critical NCR blocks shipment",
            "device_count": 1,
        }
    ]


def test_shipment_readiness_queue_can_filter_by_recommended_action():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")

    assembly_serial_number = unique_id("DEV")
    ready_serial_number = unique_id("DEV")

    assembly_created = client.post(
        "/api/devices",
        json={"device_serial_number": assembly_serial_number, "device_type": device_type},
    )
    assert assembly_created.status_code == 200
    ready_created = client.post(
        "/api/devices",
        json={"device_serial_number": ready_serial_number, "device_type": device_type},
    )
    assert ready_created.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{ready_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": ready_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert final_test.status_code == 200

    queue = client.get(
        f"/api/shipment-readiness?device_type={device_type}&recommended_action=COMPLETE_ASSEMBLY"
    )
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_devices"] == 1
    assert payload["ready_count"] == 0
    assert payload["blocked_count"] == 1
    assert payload["filters"]["recommended_action"] == "COMPLETE_ASSEMBLY"
    assert payload["recommended_action_summary"] == [
        {"recommended_action": "COMPLETE_ASSEMBLY", "device_count": 1}
    ]
    assert [row["device_serial_number"] for row in payload["devices"]] == [assembly_serial_number]
    assert payload["devices"][0]["recommended_action"] == "COMPLETE_ASSEMBLY"


def test_shipment_readiness_queue_can_filter_by_primary_blocking_code():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")

    assembly_serial_number = unique_id("DEV")
    test_serial_number = unique_id("DEV")

    assembly_created = client.post(
        "/api/devices",
        json={"device_serial_number": assembly_serial_number, "device_type": device_type},
    )
    assert assembly_created.status_code == 200
    test_created = client.post(
        "/api/devices",
        json={"device_serial_number": test_serial_number, "device_type": device_type},
    )
    assert test_created.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    install = client.post(
        f"/api/devices/{test_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

    queue = client.get(
        f"/api/shipment-readiness?device_type={device_type}&primary_blocking_code=FINAL_TEST_NOT_PASSED"
    )
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_devices"] == 1
    assert payload["ready_count"] == 0
    assert payload["blocked_count"] == 1
    assert payload["filters"]["primary_blocking_code"] == "FINAL_TEST_NOT_PASSED"
    assert payload["primary_blocking_summary"] == [
        {
            "code": "FINAL_TEST_NOT_PASSED",
            "message": "READY_FOR_SHIPMENT requires FINAL_TEST_PASSED",
            "device_count": 1,
        }
    ]
    assert [row["device_serial_number"] for row in payload["devices"]] == [test_serial_number]
    assert payload["devices"][0]["primary_blocking_code"] == "FINAL_TEST_NOT_PASSED"


def test_shipment_readiness_queue_can_filter_by_missing_component_type():
    device_type = unique_id("DEMO-SHIP")
    seed_tag = unique_id("SHIP-MISSING")
    seeded = seed_operations_dashboard_demo(
        device_type=device_type,
        tag=seed_tag,
        verify=True,
    )

    queue = client.get(
        f"/api/shipment-readiness?device_type={device_type}&missing_component_type=CONTROL_PCB"
    )
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_devices"] == 1
    assert payload["ready_count"] == 0
    assert payload["blocked_count"] == 1
    assert payload["filters"]["device_type"] == device_type
    assert payload["filters"]["missing_component_type"] == "CONTROL_PCB"
    assert [row["device_serial_number"] for row in payload["devices"]] == [
        seeded.assembly_gap_device_serial_number
    ]
    assert payload["devices"][0]["primary_blocking_code"] == "BOM_REQUIRED_COMPONENTS_MISSING"
    assert payload["devices"][0]["bom_compliance"]["missing_required_components"] == [
        "CONTROL_PCB"
    ]


def test_shipment_readiness_queue_can_sort_by_priority():
    device_type = unique_id("DT")
    ensure_device_bom_template(device_type, component_type="CONTROL_PCB")

    assembly_serial_number = unique_id("DEV")
    ncr_serial_number = unique_id("DEV")
    ready_serial_number = unique_id("DEV")

    for serial_number in [assembly_serial_number, ncr_serial_number, ready_serial_number]:
        created = client.post(
            "/api/devices",
            json={"device_serial_number": serial_number, "device_type": device_type},
        )
        assert created.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    ncr_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")
    ready_item = create_qc_passed_item(production_session, item_type="CONTROL_PCB")

    ncr_install = client.post(
        f"/api/devices/{ncr_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": ncr_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert ncr_install.status_code == 200

    ready_install = client.post(
        f"/api/devices/{ready_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": ready_item["barcode_value"],
            "component_type": "CONTROL_PCB",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert ready_install.status_code == 200

    final_test_session = start_work_session(role="FINAL_TEST_OPERATOR")
    ncr_final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": ncr_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert ncr_final_test.status_code == 200

    ready_final_test = client.post(
        "/api/final-tests",
        json={
            "test_run_id": unique_id("FT"),
            "device_serial_number": ready_serial_number,
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "work_session_id": final_test_session["work_session_id"],
        },
    )
    assert ready_final_test.status_code == 200

    ncr = client.post(
        "/api/nonconformities",
        json={
            "ncr_id": unique_id("NCR"),
            "device_serial_number": ncr_serial_number,
            "process_stage": "FINAL_TEST",
            "description": "Critical blocker",
            "severity": "CRITICAL",
            "detected_by": "pytest",
        },
    )
    assert ncr.status_code == 200

    queue = client.get(f"/api/shipment-readiness?device_type={device_type}&sort_by=priority")
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["filters"]["sort_by"] == "priority"
    assert payload["filters"]["sort_desc"] is None
    assert [row["device_serial_number"] for row in payload["devices"]] == [
        ncr_serial_number,
        assembly_serial_number,
        ready_serial_number,
    ]
    assert payload["devices"][0]["primary_blocking_code"] == "CRITICAL_OPEN_NCR"
    assert payload["devices"][1]["primary_blocking_code"] == "BOM_REQUIRED_COMPONENTS_MISSING"
    assert payload["devices"][2]["primary_blocking_code"] is None


def test_shipment_readiness_queue_supports_pagination_metadata():
    device_type = unique_id("DT")
    serial_numbers = [
        f"{device_type}-001",
        f"{device_type}-002",
        f"{device_type}-003",
    ]

    for serial_number in serial_numbers:
        response = client.post(
            "/api/devices",
            json={
                "device_serial_number": serial_number,
                "device_type": device_type,
                "variant_code": "DEFAULT",
            },
        )
        assert response.status_code == 200

    first_page = client.get(
        f"/api/shipment-readiness?device_type={device_type}&sort_by=device_serial_number&limit=2"
    )
    assert first_page.status_code == 200
    first_payload = first_page.json()
    assert first_payload["total_devices"] == 3
    assert first_payload["ready_count"] == 0
    assert first_payload["blocked_count"] == 3
    assert first_payload["returned_count"] == 2
    assert first_payload["offset"] == 0
    assert first_payload["limit"] == 2
    assert first_payload["has_more"] is True
    assert first_payload["next_offset"] == 2
    assert first_payload["filters"]["offset"] == 0
    assert first_payload["filters"]["limit"] == 2
    assert [row["device_serial_number"] for row in first_payload["devices"]] == serial_numbers[:2]

    second_page = client.get(
        f"/api/shipment-readiness?device_type={device_type}&sort_by=device_serial_number&limit=2&offset=2"
    )
    assert second_page.status_code == 200
    second_payload = second_page.json()
    assert second_payload["total_devices"] == 3
    assert second_payload["returned_count"] == 1
    assert second_payload["offset"] == 2
    assert second_payload["limit"] == 2
    assert second_payload["has_more"] is False
    assert second_payload["next_offset"] is None
    assert [row["device_serial_number"] for row in second_payload["devices"]] == serial_numbers[2:]


def test_shipment_readiness_queue_rejects_conflicting_filters():
    response = client.get("/api/shipment-readiness?only_blocked=true&only_ready=true")
    assert response.status_code == 400
    assert response.json()["detail"] == "only_blocked and only_ready cannot both be true"


def test_shipment_readiness_queue_rejects_blocking_code_with_only_ready():
    response = client.get("/api/shipment-readiness?blocking_code=CRITICAL_OPEN_NCR&only_ready=true")
    assert response.status_code == 400
    assert response.json()["detail"] == "blocking_code cannot be combined with only_ready"


def test_shipment_readiness_queue_rejects_primary_blocking_code_with_only_ready():
    response = client.get(
        "/api/shipment-readiness?primary_blocking_code=CRITICAL_OPEN_NCR&only_ready=true"
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "primary_blocking_code cannot be combined with only_ready"


def test_shipment_readiness_queue_rejects_missing_component_type_with_only_ready():
    response = client.get(
        "/api/shipment-readiness?missing_component_type=CONTROL_PCB&only_ready=true"
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "missing_component_type cannot be combined with only_ready"


def test_shipment_readiness_queue_rejects_unsupported_sort_by():
    response = client.get("/api/shipment-readiness?sort_by=unsupported")
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported sort_by value"


def test_shipment_readiness_queue_rejects_unsupported_latest_gate_result():
    response = client.get("/api/shipment-readiness?latest_gate_result=INVALID")
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported latest_gate_result filter"


def test_shipment_readiness_queue_rejects_invalid_pagination():
    negative_offset = client.get("/api/shipment-readiness?offset=-1")
    assert negative_offset.status_code == 400
    assert negative_offset.json()["detail"] == "offset must be >= 0"

    zero_limit = client.get("/api/shipment-readiness?limit=0")
    assert zero_limit.status_code == 400
    assert zero_limit.json()["detail"] == "limit must be >= 1"


def test_shipment_readiness_queue_rejects_incompatible_recommended_action_filters():
    only_ready_response = client.get(
        "/api/shipment-readiness?recommended_action=COMPLETE_ASSEMBLY&only_ready=true"
    )
    assert only_ready_response.status_code == 400
    assert only_ready_response.json()["detail"] == (
        "recommended_action is incompatible with only_ready unless it is MARK_READY_FOR_SHIPMENT"
    )

    only_blocked_response = client.get(
        "/api/shipment-readiness?recommended_action=MARK_READY_FOR_SHIPMENT&only_blocked=true"
    )
    assert only_blocked_response.status_code == 400
    assert only_blocked_response.json()["detail"] == (
        "recommended_action MARK_READY_FOR_SHIPMENT cannot be combined with only_blocked"
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


def test_shipment_accepts_substitution_group_when_one_alternative_is_installed():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB_A",
        substitution_group="CONTROL_PCB_SLOT",
        quantity_required=1,
        version="1.0",
        is_active=False,
    )
    alternative_item = client.post(
        f"/api/device-bom-templates/{device_type}/items?version=1.0",
        json={
            "component_type": "CONTROL_PCB_B",
            "substitution_group": "CONTROL_PCB_SLOT",
            "quantity_required": 1,
            "is_required": True,
        },
    )
    assert alternative_item.status_code == 200
    release_device_bom_template(device_type=device_type, version="1.0")

    device_serial_number = unique_id("DEV")
    device_response = client.post(
        "/api/devices",
        json={"device_serial_number": device_serial_number, "device_type": device_type},
    )
    assert device_response.status_code == 200

    production_session = start_work_session(role="PRODUCTION_OPERATOR")
    item = create_qc_passed_item(production_session, item_type="CONTROL_PCB_B")
    install = client.post(
        f"/api/devices/{device_serial_number}/assembly/scan-component",
        json={
            "child_barcode_value": item["barcode_value"],
            "component_type": "CONTROL_PCB_B",
            "work_session_id": production_session["work_session_id"],
        },
    )
    assert install.status_code == 200

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


def test_shipment_is_blocked_when_unexpected_component_is_present():
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

    db = SessionLocal()
    try:
        template = (
            db.query(DeviceBomTemplate)
            .filter(
                DeviceBomTemplate.device_type == device_type,
                DeviceBomTemplate.version == "1.0",
            )
            .first()
        )
        assert template is not None
        db.add(
            AssemblyLink(
                parent_device_serial_number=device_serial_number,
                child_item_serial_number=unique_id("ITEM"),
                child_barcode_value=unique_id("BC"),
                component_type="UNEXPECTED_MODULE",
                installed_by="pytest",
                installed_at=utc_now(),
                bom_template_id=template.id,
                bom_version=template.version,
                scan_event_id=unique_id("SCAN"),
                status="INSTALLED",
            )
        )
        db.commit()
    finally:
        db.close()

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
        "READY_FOR_SHIPMENT requires BOM-compliant assembly: "
        "unexpected components: UNEXPECTED_MODULE"
    )


def test_shipment_is_blocked_when_component_quantity_exceeds_bom():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        quantity_required=1,
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

    db = SessionLocal()
    try:
        template = (
            db.query(DeviceBomTemplate)
            .filter(
                DeviceBomTemplate.device_type == device_type,
                DeviceBomTemplate.version == "1.0",
            )
            .first()
        )
        assert template is not None
        db.add(
            AssemblyLink(
                parent_device_serial_number=device_serial_number,
                child_item_serial_number=unique_id("ITEM"),
                child_barcode_value=unique_id("BC"),
                component_type="CONTROL_PCB",
                installed_by="pytest",
                installed_at=utc_now(),
                bom_template_id=template.id,
                bom_version=template.version,
                scan_event_id=unique_id("SCAN"),
                status="INSTALLED",
            )
        )
        db.commit()
    finally:
        db.close()

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
        "READY_FOR_SHIPMENT requires BOM-compliant assembly: "
        "over-installed components: CONTROL_PCB x2/1"
    )


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
    assert blocked.json()["detail"] == "READY_FOR_SHIPMENT requires an active effective BOM template"


def test_shipment_blocks_when_only_active_bom_is_not_effective_yet():
    device_type = unique_id("DT")
    ensure_device_bom_template(
        device_type=device_type,
        component_type="CONTROL_PCB",
        version="1.0",
        is_active=True,
        effective_from=(utc_now() + timedelta(days=1)).isoformat(),
    )

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
    assert blocked.json()["detail"] == "READY_FOR_SHIPMENT requires an active effective BOM template"


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

    approved = client.post(
        f"/api/device-bom-templates/{device_type}/approve",
        json={"version": "2.0", "approved_by": "PYTEST-QA"},
    )
    assert approved.status_code == 200

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
    primary_device_serial = unique_id("ZSS")
    upload = client.post(
        "/api/service-sessions/upload",
        data={
            "session_id": session_id,
            "device_serial_number": primary_device_serial,
            "technician_id": "TECH-001",
            "device_type": "ZSS",
            "result": "PASS",
            "firmware_version": "1.2.4",
            "bootloader_version": "0.9.8",
            "client_attempt_id": "SYNC-UPLOAD-0001",
            "client_attempt_number": "1",
            "client_trigger_source": "MANUAL",
        },
        files={"file": ("service-package.zip", b"service-package-content", "application/zip")},
    )
    assert upload.status_code == 200
    payload = upload.json()
    assert payload["session_id"] == session_id
    assert payload["upload_status"] == "UPLOADED"
    assert payload["upload_count"] == 1
    assert payload["client_attempt_id"] == "SYNC-UPLOAD-0001"
    assert payload["client_attempt_number"] == 1
    assert payload["client_trigger_source"] == "MANUAL"
    assert payload["package_hash"]
    assert payload["upload_correlation_id"].startswith("SRV-UP-")
    assert payload["uploaded_at"]

    reupload = client.post(
        "/api/service-sessions/upload",
        data={
            "session_id": session_id,
            "device_serial_number": primary_device_serial,
            "technician_id": "TECH-RETRY",
            "device_type": "ZSS-PRO",
            "result": "HOLD",
            "firmware_version": "1.2.5",
            "bootloader_version": "0.9.9",
            "client_attempt_id": "SYNC-UPLOAD-0002",
            "client_attempt_number": "2",
            "client_trigger_source": "AUTO_NETWORK",
        },
        files={"file": ("service-package.zip", b"service-package-updated", "application/zip")},
    )
    assert reupload.status_code == 200
    updated_payload = reupload.json()
    assert updated_payload["session_id"] == session_id
    assert updated_payload["upload_count"] == 2
    assert updated_payload["technician_id"] == "TECH-RETRY"
    assert updated_payload["device_type"] == "ZSS-PRO"
    assert updated_payload["result"] == "HOLD"
    assert updated_payload["firmware_version"] == "1.2.5"
    assert updated_payload["bootloader_version"] == "0.9.9"
    assert updated_payload["client_attempt_id"] == "SYNC-UPLOAD-0002"
    assert updated_payload["client_attempt_number"] == 2
    assert updated_payload["client_trigger_source"] == "AUTO_NETWORK"
    assert updated_payload["upload_correlation_id"] != payload["upload_correlation_id"]

    listed = client.get("/api/service-sessions")
    assert listed.status_code == 200
    assert any(row["session_id"] == session_id for row in listed.json())

    other_session_id = unique_id("SVC")
    other_device_serial = unique_id("ZSS")
    other_upload = client.post(
        "/api/service-sessions/upload",
        data={
            "session_id": other_session_id,
            "device_serial_number": other_device_serial,
            "technician_id": "TECH-OTHER",
            "device_type": "ZSS-LITE",
            "result": "PASS",
        },
        files={"file": ("other-service-package.zip", b"other-service-package", "application/zip")},
    )
    assert other_upload.status_code == 200

    filtered = client.get(
        f"/api/service-sessions?device_serial_number={primary_device_serial}",
    )
    assert filtered.status_code == 200
    assert [row["session_id"] for row in filtered.json()] == [session_id]

    fetched = client.get(f"/api/service-sessions/{session_id}")
    assert fetched.status_code == 200
    assert fetched.json()["technician_id"] == "TECH-RETRY"
    assert fetched.json()["upload_count"] == 2
    assert fetched.json()["client_attempt_id"] == "SYNC-UPLOAD-0002"
    assert fetched.json()["client_attempt_number"] == 2
    assert fetched.json()["client_trigger_source"] == "AUTO_NETWORK"
    assert fetched.json()["upload_correlation_id"] == updated_payload["upload_correlation_id"]

    package_download = client.get(f"/api/service-sessions/{session_id}/package")
    assert package_download.status_code == 200
    assert package_download.content == b"service-package-updated"

    audit = client.get(f"/api/audit-events?entity_type=SERVICE_SESSION&entity_id={session_id}")
    assert audit.status_code == 200
    audit_rows = audit.json()
    assert [row["event_type"] for row in audit_rows[:2]] == [
        "SERVICE_SESSION_PACKAGE_REUPLOADED",
        "SERVICE_SESSION_PACKAGE_UPLOADED",
    ]
    assert audit_rows[0]["result"] == "UPLOADED"
    assert audit_rows[0]["operator_id"] == "TECH-RETRY"
    assert audit_rows[0]["payload"]["upload_count"] == 2
    assert audit_rows[0]["payload"]["client_attempt_id"] == "SYNC-UPLOAD-0002"
    assert audit_rows[0]["payload"]["client_attempt_number"] == 2
    assert audit_rows[0]["payload"]["client_trigger_source"] == "AUTO_NETWORK"
    assert audit_rows[1]["operator_id"] == "TECH-001"
    assert audit_rows[1]["payload"]["upload_count"] == 1
    assert audit_rows[1]["payload"]["client_attempt_id"] == "SYNC-UPLOAD-0001"

    audit_for_device = client.get(
        "/api/audit-events"
        f"?entity_type=SERVICE_SESSION&service_session_device_serial_number={primary_device_serial}"
    )
    assert audit_for_device.status_code == 200
    assert [row["entity_id"] for row in audit_for_device.json()] == [session_id, session_id]
    assert all(
        row["payload"]["device_serial_number"] == primary_device_serial
        for row in audit_for_device.json()
    )


def test_service_session_queue_supports_filters_and_pagination(tmp_path, monkeypatch):
    import app.services.files as file_storage

    monkeypatch.setattr(file_storage, "STORAGE_DIR", tmp_path)

    uploads = [
        {
            "session_id": unique_id("SVC"),
            "device_serial_number": unique_id("VENT"),
            "technician_id": "TECH-A",
            "device_type": "VENT-PRO",
            "result": "PASS",
            "client_attempt_id": "SYNC-Q-0001",
            "client_attempt_number": "1",
            "client_trigger_source": "MANUAL",
            "file_bytes": b"svc-queue-1",
        },
        {
            "session_id": unique_id("SVC"),
            "device_serial_number": unique_id("VENT"),
            "technician_id": "TECH-B",
            "device_type": "VENT-LITE",
            "result": "FAIL",
            "client_attempt_id": "SYNC-Q-0002",
            "client_attempt_number": "1",
            "client_trigger_source": "AUTO_READY",
            "file_bytes": b"svc-queue-2",
        },
        {
            "session_id": unique_id("SVC"),
            "device_serial_number": unique_id("MON"),
            "technician_id": "TECH-A",
            "device_type": "MONITOR",
            "result": "PASS",
            "client_attempt_id": "SYNC-Q-0003",
            "client_attempt_number": "1",
            "client_trigger_source": "AUTO_NETWORK",
            "file_bytes": b"svc-queue-3",
        },
    ]

    for upload_data in uploads:
        response = client.post(
            "/api/service-sessions/upload",
            data={
                "session_id": upload_data["session_id"],
                "device_serial_number": upload_data["device_serial_number"],
                "technician_id": upload_data["technician_id"],
                "device_type": upload_data["device_type"],
                "result": upload_data["result"],
                "client_attempt_id": upload_data["client_attempt_id"],
                "client_attempt_number": upload_data["client_attempt_number"],
                "client_trigger_source": upload_data["client_trigger_source"],
            },
            files={
                "file": (
                    f"{upload_data['session_id']}.zip",
                    upload_data["file_bytes"],
                    "application/zip",
                )
            },
        )
        assert response.status_code == 200

    reupload = client.post(
        "/api/service-sessions/upload",
        data={
            "session_id": uploads[0]["session_id"],
            "device_serial_number": uploads[0]["device_serial_number"],
            "technician_id": uploads[0]["technician_id"],
            "device_type": uploads[0]["device_type"],
            "result": uploads[0]["result"],
            "client_attempt_id": "SYNC-Q-0004",
            "client_attempt_number": "2",
            "client_trigger_source": "AUTO_NETWORK",
        },
        files={
            "file": (
                f"{uploads[0]['session_id']}-retry.zip",
                b"svc-queue-1-retry",
                "application/zip",
            )
        },
    )
    assert reupload.status_code == 200
    reupload_payload = reupload.json()
    assert reupload_payload["upload_count"] == 2

    queue = client.get(
        "/api/service-sessions/queue"
        "?technician_id=TECH-A&sort_by=upload_count&sort_desc=true&offset=0&limit=1"
    )
    assert queue.status_code == 200
    payload = queue.json()
    assert payload["total_sessions"] == 2
    assert payload["reuploaded_sessions"] == 1
    assert payload["returned_count"] == 1
    assert payload["has_more"] is True
    assert payload["next_offset"] == 1
    assert payload["filters"]["technician_id"] == "TECH-A"
    assert payload["filters"]["sort_by"] == "upload_count"
    assert payload["filters"]["sort_desc"] is True
    assert [row["session_id"] for row in payload["sessions"]] == [uploads[0]["session_id"]]
    assert payload["sessions"][0]["upload_count"] == 2
    assert payload["upload_status_summary"] == [
        {"upload_status": "UPLOADED", "session_count": 2}
    ]
    assert payload["result_summary"] == [{"result": "PASS", "session_count": 2}]
    assert payload["device_type_summary"] == [
        {"device_type": "MONITOR", "session_count": 1},
        {"device_type": "VENT-PRO", "session_count": 1},
    ]
    assert payload["technician_summary"] == [{"technician_id": "TECH-A", "session_count": 2}]
    assert payload["trigger_source_summary"] == [
        {"client_trigger_source": "AUTO_NETWORK", "session_count": 2},
    ]

    second_page = client.get(
        "/api/service-sessions/queue"
        "?technician_id=TECH-A&sort_by=upload_count&sort_desc=true&offset=1&limit=1"
    )
    assert second_page.status_code == 200
    second_payload = second_page.json()
    assert second_payload["returned_count"] == 1
    assert second_payload["has_more"] is False
    assert second_payload["next_offset"] is None
    assert [row["session_id"] for row in second_payload["sessions"]] == [uploads[2]["session_id"]]

    device_type_filtered = client.get("/api/service-sessions/queue?device_type=VENT-PRO")
    assert device_type_filtered.status_code == 200
    assert [row["session_id"] for row in device_type_filtered.json()["sessions"]] == [
        uploads[0]["session_id"]
    ]

    correlation_filtered = client.get(
        "/api/service-sessions/queue"
        f"?upload_correlation_id={reupload_payload['upload_correlation_id']}"
    )
    assert correlation_filtered.status_code == 200
    correlation_payload = correlation_filtered.json()
    assert correlation_payload["filters"]["upload_correlation_id"] == reupload_payload[
        "upload_correlation_id"
    ]
    assert [row["session_id"] for row in correlation_payload["sessions"]] == [
        uploads[0]["session_id"]
    ]

    attempt_filtered = client.get(
        "/api/service-sessions/queue?client_attempt_id=SYNC-Q-0004"
    )
    assert attempt_filtered.status_code == 200
    attempt_payload = attempt_filtered.json()
    assert attempt_payload["filters"]["client_attempt_id"] == "SYNC-Q-0004"
    assert [row["session_id"] for row in attempt_payload["sessions"]] == [
        uploads[0]["session_id"]
    ]

    min_upload_count_filtered = client.get(
        "/api/service-sessions/queue?technician_id=TECH-A&min_upload_count=2"
    )
    assert min_upload_count_filtered.status_code == 200
    min_upload_count_payload = min_upload_count_filtered.json()
    assert min_upload_count_payload["filters"]["technician_id"] == "TECH-A"
    assert min_upload_count_payload["filters"]["min_upload_count"] == 2
    assert min_upload_count_payload["total_sessions"] == 1
    assert [row["session_id"] for row in min_upload_count_payload["sessions"]] == [
        uploads[0]["session_id"]
    ]

    reuploaded_filtered = client.get(
        "/api/service-sessions/queue?technician_id=TECH-A&only_reuploaded=true"
    )
    assert reuploaded_filtered.status_code == 200
    reuploaded_payload = reuploaded_filtered.json()
    assert reuploaded_payload["filters"]["technician_id"] == "TECH-A"
    assert reuploaded_payload["filters"]["only_reuploaded"] is True
    assert reuploaded_payload["total_sessions"] == 1
    assert reuploaded_payload["reuploaded_sessions"] == 1
    assert [row["session_id"] for row in reuploaded_payload["sessions"]] == [
        uploads[0]["session_id"]
    ]

    invalid_sort = client.get("/api/service-sessions/queue?sort_by=unsupported")
    assert invalid_sort.status_code == 400
    assert invalid_sort.json()["detail"] == "Unsupported service session sort field"

    invalid_limit = client.get("/api/service-sessions/queue?limit=0")
    assert invalid_limit.status_code == 400
    assert invalid_limit.json()["detail"] == "limit must be >= 1"

    invalid_min_upload_count = client.get("/api/service-sessions/queue?min_upload_count=0")
    assert invalid_min_upload_count.status_code == 400
    assert invalid_min_upload_count.json()["detail"] == "min_upload_count must be >= 1"


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
