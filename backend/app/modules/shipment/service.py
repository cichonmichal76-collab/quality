from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import Device
from app.modules.shipment import repository, rules
from app.schemas import DeviceStatusUpdate


def get_device_or_404(db: Session, serial_number: str) -> Device:
    device = repository.get_device_by_serial_number(db, serial_number)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def update_device_status(db: Session, serial_number: str, payload: DeviceStatusUpdate) -> Device:
    device = get_device_or_404(db, serial_number)
    if payload.production_status == rules.READY_FOR_SHIPMENT:
        if device.production_status != rules.FINAL_TEST_PASSED:
            raise HTTPException(
                status_code=400,
                detail="READY_FOR_SHIPMENT requires FINAL_TEST_PASSED",
            )
        _ensure_required_components_installed(db, device)
        if repository.has_critical_open_ncr(db, serial_number):
            raise HTTPException(status_code=400, detail="Open critical NCR blocks shipment")
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


def _ensure_required_components_installed(db: Session, device: Device) -> None:
    required_component_types = rules.get_required_component_types(device.device_type)
    if not required_component_types:
        return

    installed_links = repository.list_installed_assembly_links_for_device(
        db,
        device.device_serial_number,
    )
    installed_component_types = {link.component_type for link in installed_links}
    missing_component_types = sorted(required_component_types - installed_component_types)
    if missing_component_types:
        missing_components = ", ".join(missing_component_types)
        raise HTTPException(
            status_code=400,
            detail=f"READY_FOR_SHIPMENT requires installed components: {missing_components}",
        )
