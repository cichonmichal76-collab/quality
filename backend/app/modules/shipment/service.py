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
    bom_template = repository.get_bound_bom_template_for_device(db, device.device_serial_number)
    if not bom_template:
        bom_template = repository.get_active_bom_template_by_device_type(db, device.device_type)
    if not bom_template and repository.get_any_bom_template_by_device_type(db, device.device_type):
        raise HTTPException(
            status_code=400,
            detail="READY_FOR_SHIPMENT requires an active BOM template",
        )
    if not bom_template:
        return
    bom_items = repository.list_bom_items_for_template(db, bom_template.id)
    if not bom_items:
        return

    installed_links = repository.list_installed_assembly_links_for_device(
        db,
        device.device_serial_number,
    )
    installed_component_counts: dict[str, int] = {}
    for link in installed_links:
        installed_component_counts[link.component_type] = (
            installed_component_counts.get(link.component_type, 0) + 1
        )

    missing_component_types: list[str] = []
    over_installed_component_types: list[str] = []
    for bom_item in bom_items:
        installed_count = installed_component_counts.pop(bom_item.component_type, 0)
        if installed_count < bom_item.quantity_required:
            if bom_item.is_required:
                if bom_item.quantity_required == 1:
                    missing_component_types.append(bom_item.component_type)
                else:
                    missing_component_types.append(
                        f"{bom_item.component_type} x{bom_item.quantity_required}"
                    )
        if installed_count > bom_item.quantity_required:
            over_installed_component_types.append(
                f"{bom_item.component_type} x{installed_count}/{bom_item.quantity_required}"
            )
    if missing_component_types:
        missing_components = ", ".join(missing_component_types)
        raise HTTPException(
            status_code=400,
            detail=f"READY_FOR_SHIPMENT requires installed components: {missing_components}",
        )
    if over_installed_component_types or installed_component_counts:
        issue_fragments: list[str] = []
        if over_installed_component_types:
            issue_fragments.append(
                "over-installed components: " + ", ".join(over_installed_component_types)
            )
        if installed_component_counts:
            issue_fragments.append(
                "unexpected components: " + ", ".join(sorted(installed_component_counts))
            )
        raise HTTPException(
            status_code=400,
            detail="READY_FOR_SHIPMENT requires BOM-compliant assembly: "
            + "; ".join(issue_fragments),
        )
