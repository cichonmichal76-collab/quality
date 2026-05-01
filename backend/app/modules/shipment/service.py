from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import Device
from app.modules.assembly.service import get_device_bom_compliance
from app.modules.shipment import repository, rules
from app.schemas import DeviceBomComplianceRead, DeviceShipmentReadinessRead, DeviceStatusUpdate

READY_FOR_SHIPMENT_REQUIRES_FINAL_TEST = "READY_FOR_SHIPMENT requires FINAL_TEST_PASSED"
READY_FOR_SHIPMENT_REQUIRES_ACTIVE_BOM = "READY_FOR_SHIPMENT requires an active effective BOM template"
READY_FOR_SHIPMENT_BLOCKED_BY_NCR = "Open critical NCR blocks shipment"


def get_device_or_404(db: Session, serial_number: str) -> Device:
    device = repository.get_device_by_serial_number(db, serial_number)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def update_device_status(db: Session, serial_number: str, payload: DeviceStatusUpdate) -> Device:
    device = get_device_or_404(db, serial_number)
    if payload.production_status == rules.READY_FOR_SHIPMENT:
        readiness = _build_device_shipment_readiness(db, device)
        if not readiness.can_transition_to_ready_for_shipment:
            raise HTTPException(status_code=400, detail=readiness.blocking_reasons[0])
    device.production_status = payload.production_status
    device.updated_at = utc_now()
    record_audit_event(
        db,
        event_type="DEVICE_STATUS_UPDATED",
        entity_type="DEVICE",
        entity_id=serial_number,
        result=payload.production_status,
        payload={"production_status": payload.production_status},
    )
    db.commit()
    db.refresh(device)
    return device


def _build_bom_shipment_blocking_reason(
    bom_compliance: DeviceBomComplianceRead,
) -> str | None:
    if bom_compliance.passes_bom_gate:
        return None
    if bom_compliance.blocking_reason:
        return READY_FOR_SHIPMENT_REQUIRES_ACTIVE_BOM
    if bom_compliance.missing_required_components:
        return "READY_FOR_SHIPMENT requires installed components: " + ", ".join(
            bom_compliance.missing_required_components
        )

    issue_fragments: list[str] = []
    if bom_compliance.over_installed_components:
        issue_fragments.append(
            "over-installed components: " + ", ".join(bom_compliance.over_installed_components)
        )
    if bom_compliance.unexpected_component_types:
        issue_fragments.append(
            "unexpected components: " + ", ".join(sorted(bom_compliance.unexpected_component_types))
        )
    if not issue_fragments:
        return None
    return "READY_FOR_SHIPMENT requires BOM-compliant assembly: " + "; ".join(issue_fragments)


def _build_device_shipment_readiness(db: Session, device: Device) -> DeviceShipmentReadinessRead:
    final_test_passed = device.production_status == rules.FINAL_TEST_PASSED
    has_critical_open_ncr = repository.has_critical_open_ncr(db, device.device_serial_number)
    bom_compliance = get_device_bom_compliance(db, device.device_serial_number)

    blocking_reasons: list[str] = []
    if not final_test_passed:
        blocking_reasons.append(READY_FOR_SHIPMENT_REQUIRES_FINAL_TEST)

    bom_blocking_reason = _build_bom_shipment_blocking_reason(bom_compliance)
    if bom_blocking_reason:
        blocking_reasons.append(bom_blocking_reason)

    if has_critical_open_ncr:
        blocking_reasons.append(READY_FOR_SHIPMENT_BLOCKED_BY_NCR)

    return DeviceShipmentReadinessRead(
        device_serial_number=device.device_serial_number,
        device_type=device.device_type,
        device_variant_code=device.variant_code,
        production_status=device.production_status,
        final_test_passed=final_test_passed,
        has_critical_open_ncr=has_critical_open_ncr,
        bom_compliance=bom_compliance,
        can_transition_to_ready_for_shipment=not blocking_reasons,
        blocking_reasons=blocking_reasons,
    )


def get_device_shipment_readiness(
    db: Session,
    serial_number: str,
) -> DeviceShipmentReadinessRead:
    device = get_device_or_404(db, serial_number)
    return _build_device_shipment_readiness(db, device)
