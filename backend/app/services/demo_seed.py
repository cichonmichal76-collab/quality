from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session

from app.db import SessionLocal, utc_now
from app.main import app
from app.models import AssemblyLink, Device, DeviceBomItem, DeviceBomTemplate

DEFAULT_DEVICE_TYPE = "DEMO-OPS"
DEFAULT_BOM_VERSION = "1.0"


@dataclass
class SeedResult:
    device_type: str
    bom_version: str
    shipment_queue_url: str
    component_quality_url: str
    ready_device_serial_number: str
    assembly_gap_device_serial_number: str
    final_test_gap_device_serial_number: str
    component_qc_gap_device_serial_number: str
    component_ncr_device_serial_number: str
    device_ncr_device_serial_number: str
    verified: bool = False


@dataclass
class DashboardSummary:
    shipment_total: int
    shipment_ready: int
    shipment_actions: list[str]
    component_total: int
    component_issue_count: int
    component_primary_statuses: list[str]


@dataclass
class BomTemplateRef:
    template_id: str
    version: str


SCENARIO_SERIAL_PREFIXES = {
    "ready_device_serial_number": "READY-",
    "assembly_gap_device_serial_number": "ASM-",
    "final_test_gap_device_serial_number": "TEST-",
    "component_qc_gap_device_serial_number": "CQ-",
    "component_ncr_device_serial_number": "CN-",
    "device_ncr_device_serial_number": "DN-",
}


def unique_id(prefix: str, tag: str) -> str:
    return f"{prefix}-{tag}-{uuid4().hex[:6]}"


def ensure_ok(response: Response, context: str) -> dict:
    if response.status_code != 200:
        try:
            payload = response.json()
        except ValueError:
            payload = response.text
        raise RuntimeError(f"{context} failed with {response.status_code}: {payload}")
    return response.json()


def try_get_existing_seed_result(device_type: str) -> SeedResult | None:
    with SessionLocal() as db:
        serial_numbers = [
            row[0]
            for row in db.query(Device.device_serial_number)
            .filter(Device.device_type == device_type)
            .all()
        ]

    if not serial_numbers:
        return None

    scenario_serials: dict[str, str] = {}
    for field_name, prefix in SCENARIO_SERIAL_PREFIXES.items():
        matches = sorted(
            serial_number
            for serial_number in serial_numbers
            if serial_number.startswith(prefix)
        )
        if len(matches) != 1:
            return None
        scenario_serials[field_name] = matches[0]

    matched_serials = set(scenario_serials.values())
    if len(serial_numbers) != len(matched_serials):
        return None

    return SeedResult(
        device_type=device_type,
        bom_version=DEFAULT_BOM_VERSION,
        shipment_queue_url=f"/api/shipment-readiness?device_type={device_type}",
        component_quality_url=f"/api/component-quality?device_type={device_type}",
        verified=False,
        **scenario_serials,
    )


def start_work_session(
    client: TestClient,
    tag: str,
    *,
    role: str = "PRODUCTION_OPERATOR",
    include_machine: bool = True,
) -> dict:
    operator_id = unique_id("OP", tag)
    workstation_id = unique_id("WS", tag)
    machine_id = unique_id("MC", tag) if include_machine else None
    rfid_uid_hash = unique_id("RFID", tag)

    ensure_ok(
        client.post(
            "/api/operators",
            json={
                "operator_id": operator_id,
                "full_name": f"Demo Operator {tag}",
                "role": role,
                "rfid_uid_hash": rfid_uid_hash,
            },
        ),
        f"create operator {operator_id}",
    )
    ensure_ok(
        client.post(
            "/api/workstations",
            json={
                "workstation_id": workstation_id,
                "name": f"Demo Station {tag}",
                "area": "QA",
            },
        ),
        f"create workstation {workstation_id}",
    )
    if machine_id:
        ensure_ok(
            client.post(
                "/api/machines",
                json={
                    "machine_id": machine_id,
                    "name": f"Demo Machine {tag}",
                    "machine_type": "TEST",
                },
            ),
            f"create machine {machine_id}",
        )

    session = ensure_ok(
        client.post(
            "/api/auth/rfid-login",
            json={
                "rfid_uid_hash": rfid_uid_hash,
                "workstation_id": workstation_id,
                "machine_id": machine_id,
            },
        ),
        f"start work session for {operator_id}",
    )
    session["rfid_uid_hash"] = rfid_uid_hash
    return session


def ensure_active_bom_template(
    client: TestClient,
    *,
    device_type: str,
    version: str,
) -> BomTemplateRef:
    bom_items = (
        {"component_type": "CONTROL_PCB", "quantity_required": 1, "is_required": True},
        {"component_type": "FAN_MODULE", "quantity_required": 1, "is_required": False},
        {"component_type": "IO_MODULE", "quantity_required": 1, "is_required": False},
    )
    create_response = client.post(
        "/api/device-bom-templates",
        json={
            "device_type": device_type,
            "variant_code": "DEFAULT",
            "name": f"{device_type} demo BOM",
            "version": version,
            "is_active": False,
        },
    )
    if create_response.status_code not in {200, 409}:
        raise RuntimeError(
            "create device BOM template failed with "
            f"{create_response.status_code}: {create_response.text}"
        )

    with SessionLocal() as db:
        template = (
            db.query(DeviceBomTemplate)
            .filter(
                DeviceBomTemplate.device_type == device_type,
                DeviceBomTemplate.variant_code == "DEFAULT",
                DeviceBomTemplate.version == version,
            )
            .first()
        )
        if template is None:
            raise RuntimeError("device BOM template was not created")
        is_active = template.is_active
        template_id = template.id
        existing_items = {
            item.component_type: item
            for item in db.query(DeviceBomItem)
            .filter(DeviceBomItem.template_id == template_id)
            .all()
        }

    for bom_item in bom_items:
        existing_item = existing_items.get(bom_item["component_type"])
        if existing_item is not None:
            if (
                existing_item.quantity_required != bom_item["quantity_required"]
                or existing_item.is_required != bom_item["is_required"]
            ):
                raise RuntimeError(
                    "existing demo BOM item does not match expected seed shape for "
                    f"{device_type} {version}: {bom_item['component_type']}"
                )
            continue

        if is_active:
            raise RuntimeError(
                "existing active demo BOM template is missing required seed item for "
                f"{device_type} {version}: {bom_item['component_type']}"
            )

        item_response = client.post(
            f"/api/device-bom-templates/{device_type}/items?version={version}&variant_code=DEFAULT",
            json=bom_item,
        )
        if item_response.status_code not in {200, 409}:
            raise RuntimeError(
                "create device BOM item failed with "
                f"{item_response.status_code}: {item_response.text}"
            )

    if not is_active:
        ensure_ok(
            client.post(
                f"/api/device-bom-templates/{device_type}/release?variant_code=DEFAULT",
                json={
                    "version": version,
                    "approved_by": "DEMO-SEEDER",
                    "release_note": "Operations dashboard demo data",
                },
            ),
            f"release BOM {device_type} {version}",
        )

    return BomTemplateRef(template_id=template_id, version=version)


def create_device(
    client: TestClient,
    *,
    serial_number: str,
    device_type: str,
    variant_code: str = "DEFAULT",
) -> None:
    ensure_ok(
        client.post(
            "/api/devices",
            json={
                "device_serial_number": serial_number,
                "device_type": device_type,
                "variant_code": variant_code,
            },
        ),
        f"create device {serial_number}",
    )


def create_qc_passed_item(
    client: TestClient,
    session: dict,
    tag: str,
    *,
    item_type: str = "CONTROL_PCB",
) -> dict:
    item_serial_number = unique_id("ITEM", tag)
    barcode_value = unique_id("BC", tag)

    ensure_ok(
        client.post(
            "/api/production-items",
            json={
                "item_serial_number": item_serial_number,
                "barcode_value": barcode_value,
                "item_type": item_type,
                "work_session_id": session["work_session_id"],
                "workstation_id": session["workstation_id"],
            },
        ),
        f"create production item {item_serial_number}",
    )

    for status in ("PRODUCED", "QC_IN_PROGRESS", "QC_PASSED"):
        ensure_ok(
            client.patch(
                f"/api/production-items/{item_serial_number}/status",
                json={"current_status": status},
            ),
            f"set production item {item_serial_number} to {status}",
        )

    return {
        "item_serial_number": item_serial_number,
        "barcode_value": barcode_value,
    }


def install_component(
    client: TestClient,
    session: dict,
    *,
    device_serial_number: str,
    component_type: str,
    barcode_value: str,
) -> None:
    ensure_ok(
        client.post(
            f"/api/devices/{device_serial_number}/assembly/scan-component",
            json={
                "child_barcode_value": barcode_value,
                "component_type": component_type,
                "work_session_id": session["work_session_id"],
            },
        ),
        f"install {component_type} into {device_serial_number}",
    )


def record_final_test_pass(
    client: TestClient,
    session: dict,
    tag: str,
    *,
    device_serial_number: str,
) -> None:
    ensure_ok(
        client.post(
            "/api/final-tests",
            json={
                "test_run_id": unique_id("FT", tag),
                "device_serial_number": device_serial_number,
                "result": "PASS",
                "firmware_version": "1.2.4",
                "bootloader_version": "0.9.8",
                "work_session_id": session["work_session_id"],
            },
        ),
        f"record final test for {device_serial_number}",
    )


def create_device_ncr(client: TestClient, tag: str, *, device_serial_number: str) -> None:
    ensure_ok(
        client.post(
            "/api/nonconformities",
            json={
                "ncr_id": unique_id("NCR", tag),
                "device_serial_number": device_serial_number,
                "process_stage": "FINAL_TEST",
                "description": "Open critical NCR blocks shipment in demo data",
                "severity": "CRITICAL",
                "detected_by": "demo-seed",
            },
        ),
        f"create device NCR for {device_serial_number}",
    )


def create_component_ncr(
    client: TestClient,
    tag: str,
    *,
    component_serial_number: str,
) -> None:
    ensure_ok(
        client.post(
            "/api/nonconformities",
            json={
                "ncr_id": unique_id("NCR", tag),
                "component_serial_number": component_serial_number,
                "process_stage": "INCOMING_INSPECTION",
                "description": "Critical installed component blocker in demo data",
                "severity": "CRITICAL",
                "detected_by": "demo-seed",
            },
        ),
        f"create component NCR for {component_serial_number}",
    )


def add_manual_component_link(
    db: Session,
    *,
    device_serial_number: str,
    template_ref: BomTemplateRef,
    component_type: str,
    component_qc_passed: bool,
    tag: str,
) -> str:
    component_serial_number = unique_id("ITEM", tag)
    link = AssemblyLink(
        parent_device_serial_number=device_serial_number,
        child_item_serial_number=component_serial_number,
        child_barcode_value=unique_id("BC", tag),
        component_type=component_type,
        installed_by="demo-seed",
        installed_at=utc_now(),
        bom_template_id=template_ref.template_id,
        bom_version=template_ref.version,
        scan_event_id=unique_id("SCAN", tag),
        status="INSTALLED",
        component_qc_passed=component_qc_passed,
    )
    db.add(link)
    db.flush()
    return component_serial_number


def update_device_metadata(
    db: Session,
    *,
    serial_number: str,
    created_at_offset: timedelta,
    updated_at_offset: timedelta,
    production_status: str,
) -> None:
    device = (
        db.query(Device)
        .filter(Device.device_serial_number == serial_number)
        .first()
    )
    if device is None:
        raise RuntimeError(f"device {serial_number} not found while updating metadata")

    now = utc_now()
    device.production_status = production_status
    device.created_at = now - created_at_offset
    device.updated_at = now - updated_at_offset
    db.flush()


def build_dashboard_summary(client: TestClient, *, device_type: str) -> DashboardSummary:
    shipment = ensure_ok(
        client.get(f"/api/shipment-readiness?device_type={device_type}"),
        f"fetch shipment queue for {device_type}",
    )
    components = ensure_ok(
        client.get(f"/api/component-quality?device_type={device_type}"),
        f"fetch component quality queue for {device_type}",
    )
    return DashboardSummary(
        shipment_total=shipment["total_devices"],
        shipment_ready=shipment["ready_count"],
        shipment_actions=sorted({row["recommended_action"] for row in shipment["devices"]}),
        component_total=components["total_devices"],
        component_issue_count=components["devices_with_issues"],
        component_primary_statuses=sorted(
            {row["primary_quality_status"] for row in components["devices"]}
        ),
    )


def verify_dashboard_seed(client: TestClient, *, device_type: str) -> DashboardSummary:
    summary = build_dashboard_summary(client, device_type=device_type)
    expected_actions = {
        "MARK_READY_FOR_SHIPMENT",
        "COMPLETE_ASSEMBLY",
        "RUN_FINAL_TEST",
        "RESOLVE_COMPONENT_QUALITY",
        "RESOLVE_CRITICAL_NCR",
    }
    expected_statuses = {"CRITICAL_NCR_OPEN", "QC_NOT_PASSED"}
    if summary.shipment_total != 6:
        raise RuntimeError(
            f"expected shipment_total=6 for {device_type}, got {summary.shipment_total}"
        )
    if summary.shipment_ready != 1:
        raise RuntimeError(
            f"expected shipment_ready=1 for {device_type}, got {summary.shipment_ready}"
        )
    missing_actions = sorted(expected_actions.difference(summary.shipment_actions))
    if missing_actions:
        raise RuntimeError(
            "missing expected shipment recommended_action values for "
            f"{device_type}: {missing_actions}"
        )
    if summary.component_total != 6:
        raise RuntimeError(
            f"expected component_total=6 for {device_type}, got {summary.component_total}"
        )
    if summary.component_issue_count < 2:
        raise RuntimeError(
            "expected at least 2 devices_with_issues for "
            f"{device_type}, got {summary.component_issue_count}"
        )
    missing_statuses = sorted(expected_statuses.difference(summary.component_primary_statuses))
    if missing_statuses:
        raise RuntimeError(
            "missing expected primary_quality_status values for "
            f"{device_type}: {missing_statuses}"
        )
    return summary


def verify_existing_dashboard_seed(
    *,
    device_type: str = DEFAULT_DEVICE_TYPE,
) -> SeedResult:
    existing_result = try_get_existing_seed_result(device_type)
    if existing_result is None:
        raise RuntimeError(
            "expected existing complete dashboard demo dataset for "
            f"{device_type}, but none was found"
        )

    client = TestClient(app)
    verify_dashboard_seed(client, device_type=device_type)
    existing_result.verified = True
    return existing_result


def seed_operations_dashboard_demo(
    *,
    device_type: str = DEFAULT_DEVICE_TYPE,
    tag: str = "DEMO",
    verify: bool = False,
) -> SeedResult:
    client = TestClient(app)
    existing_result = try_get_existing_seed_result(device_type)
    if existing_result is not None:
        if verify:
            verify_dashboard_seed(client, device_type=device_type)
            existing_result.verified = True
        return existing_result

    template_ref = ensure_active_bom_template(
        client,
        device_type=device_type,
        version=DEFAULT_BOM_VERSION,
    )

    production_session = start_work_session(client, f"{tag}-PROD")
    final_test_session = start_work_session(
        client,
        f"{tag}-FT",
        role="FINAL_TEST_OPERATOR",
    )
    start_work_session(
        client,
        f"{tag}-Q",
        role="QUALITY_INSPECTOR",
    )

    ready_serial = unique_id("READY", tag)
    assembly_gap_serial = unique_id("ASM", tag)
    final_test_gap_serial = unique_id("TEST", tag)
    component_qc_gap_serial = unique_id("CQ", tag)
    component_ncr_serial = unique_id("CN", tag)
    device_ncr_serial = unique_id("DN", tag)

    create_device(
        client,
        serial_number=ready_serial,
        device_type=device_type,
        variant_code="DEFAULT",
    )
    create_device(
        client,
        serial_number=assembly_gap_serial,
        device_type=device_type,
        variant_code="DEFAULT",
    )
    create_device(
        client,
        serial_number=final_test_gap_serial,
        device_type=device_type,
        variant_code="DEFAULT",
    )
    create_device(
        client,
        serial_number=component_qc_gap_serial,
        device_type=device_type,
        variant_code="DEFAULT",
    )
    create_device(
        client,
        serial_number=component_ncr_serial,
        device_type=device_type,
        variant_code="DEFAULT",
    )
    create_device(
        client,
        serial_number=device_ncr_serial,
        device_type=device_type,
        variant_code="DEFAULT",
    )

    ready_item = create_qc_passed_item(client, production_session, f"{tag}-READY")
    install_component(
        client,
        production_session,
        device_serial_number=ready_serial,
        component_type="CONTROL_PCB",
        barcode_value=ready_item["barcode_value"],
    )
    record_final_test_pass(
        client,
        final_test_session,
        f"{tag}-READY",
        device_serial_number=ready_serial,
    )
    final_gap_item = create_qc_passed_item(client, production_session, f"{tag}-FT-GAP")
    install_component(
        client,
        production_session,
        device_serial_number=final_test_gap_serial,
        component_type="CONTROL_PCB",
        barcode_value=final_gap_item["barcode_value"],
    )

    qc_gap_item = create_qc_passed_item(client, production_session, f"{tag}-CQ")
    install_component(
        client,
        production_session,
        device_serial_number=component_qc_gap_serial,
        component_type="CONTROL_PCB",
        barcode_value=qc_gap_item["barcode_value"],
    )
    qc_gap_blocking_item = create_qc_passed_item(
        client,
        production_session,
        f"{tag}-CQ-FAN",
        item_type="FAN_MODULE",
    )
    install_component(
        client,
        production_session,
        device_serial_number=component_qc_gap_serial,
        component_type="FAN_MODULE",
        barcode_value=qc_gap_blocking_item["barcode_value"],
    )
    record_final_test_pass(
        client,
        final_test_session,
        f"{tag}-CQ",
        device_serial_number=component_qc_gap_serial,
    )
    with SessionLocal() as db:
        blocking_link = (
            db.query(AssemblyLink)
            .filter(
                AssemblyLink.parent_device_serial_number == component_qc_gap_serial,
                AssemblyLink.child_item_serial_number
                == qc_gap_blocking_item["item_serial_number"],
            )
            .first()
        )
        if blocking_link is None:
            raise RuntimeError(
                "expected installed FAN_MODULE link for component QC gap scenario"
            )
        blocking_link.component_qc_passed = False
        db.commit()

    component_ncr_item = create_qc_passed_item(client, production_session, f"{tag}-CN")
    install_component(
        client,
        production_session,
        device_serial_number=component_ncr_serial,
        component_type="CONTROL_PCB",
        barcode_value=component_ncr_item["barcode_value"],
    )
    record_final_test_pass(
        client,
        final_test_session,
        f"{tag}-CN",
        device_serial_number=component_ncr_serial,
    )
    with SessionLocal() as db:
        blocked_component_serial = add_manual_component_link(
            db,
            device_serial_number=component_ncr_serial,
            template_ref=template_ref,
            component_type="IO_MODULE",
            component_qc_passed=True,
            tag=f"{tag}-IO",
        )
        db.commit()
    create_component_ncr(
        client,
        f"{tag}-CN",
        component_serial_number=blocked_component_serial,
    )

    device_ncr_item = create_qc_passed_item(client, production_session, f"{tag}-DN")
    install_component(
        client,
        production_session,
        device_serial_number=device_ncr_serial,
        component_type="CONTROL_PCB",
        barcode_value=device_ncr_item["barcode_value"],
    )
    record_final_test_pass(
        client,
        final_test_session,
        f"{tag}-DN",
        device_serial_number=device_ncr_serial,
    )
    create_device_ncr(
        client,
        f"{tag}-DN",
        device_serial_number=device_ncr_serial,
    )

    with SessionLocal() as db:
        update_device_metadata(
            db,
            serial_number=ready_serial,
            created_at_offset=timedelta(days=10),
            updated_at_offset=timedelta(days=8),
            production_status="FINAL_TEST_PASSED",
        )
        update_device_metadata(
            db,
            serial_number=assembly_gap_serial,
            created_at_offset=timedelta(days=7),
            updated_at_offset=timedelta(days=5),
            production_status="CREATED",
        )
        update_device_metadata(
            db,
            serial_number=final_test_gap_serial,
            created_at_offset=timedelta(days=4),
            updated_at_offset=timedelta(days=4),
            production_status="CREATED",
        )
        update_device_metadata(
            db,
            serial_number=component_qc_gap_serial,
            created_at_offset=timedelta(days=3),
            updated_at_offset=timedelta(days=2),
            production_status="FINAL_TEST_PASSED",
        )
        update_device_metadata(
            db,
            serial_number=component_ncr_serial,
            created_at_offset=timedelta(days=2),
            updated_at_offset=timedelta(hours=12),
            production_status="FINAL_TEST_PASSED",
        )
        update_device_metadata(
            db,
            serial_number=device_ncr_serial,
            created_at_offset=timedelta(days=1),
            updated_at_offset=timedelta(hours=6),
            production_status="FINAL_TEST_PASSED",
        )
        db.commit()

    if verify:
        verify_dashboard_seed(client, device_type=device_type)

    return SeedResult(
        device_type=device_type,
        bom_version=DEFAULT_BOM_VERSION,
        shipment_queue_url=f"/api/shipment-readiness?device_type={device_type}",
        component_quality_url=f"/api/component-quality?device_type={device_type}",
        ready_device_serial_number=ready_serial,
        assembly_gap_device_serial_number=assembly_gap_serial,
        final_test_gap_device_serial_number=final_test_gap_serial,
        component_qc_gap_device_serial_number=component_qc_gap_serial,
        component_ncr_device_serial_number=component_ncr_serial,
        device_ncr_device_serial_number=device_ncr_serial,
        verified=verify,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed demo data for shipment-readiness and component-quality dashboards.",
    )
    parser.add_argument(
        "--device-type",
        default=DEFAULT_DEVICE_TYPE,
        help=f"Device type used by the seeded dataset. Default: {DEFAULT_DEVICE_TYPE}",
    )
    parser.add_argument(
        "--tag",
        default="DEMO",
        help="Unique tag embedded into seeded serial numbers. Default: DEMO",
    )
    verification_mode = parser.add_mutually_exclusive_group()
    verification_mode.add_argument(
        "--verify",
        action="store_true",
        help="Verify expected queue counts and statuses after seeding.",
    )
    verification_mode.add_argument(
        "--verify-only",
        action="store_true",
        help="Verify an existing complete dashboard demo dataset without seeding.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.verify_only:
        result = verify_existing_dashboard_seed(device_type=args.device_type)
    else:
        result = seed_operations_dashboard_demo(
            device_type=args.device_type,
            tag=args.tag,
            verify=args.verify,
        )
    print(json.dumps(asdict(result), indent=2))


if __name__ == "__main__":
    main()
