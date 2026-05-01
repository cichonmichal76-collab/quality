from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import Device
from app.modules.assembly.bom_groups import evaluate_bom_requirement_groups
from app.modules.assembly.service import resolve_bom_template_context
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
    bom_template, _, blocking_reason, _, _ = resolve_bom_template_context(db, device)
    if blocking_reason:
        raise HTTPException(
            status_code=400,
            detail="READY_FOR_SHIPMENT requires an active effective BOM template",
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
    evaluations, remaining_counts = evaluate_bom_requirement_groups(
        bom_items,
        installed_component_counts,
    )
    for evaluation in evaluations:
        requirement = evaluation.requirement
        if evaluation.installed_quantity < requirement.quantity_required and requirement.is_required:
            if requirement.quantity_required == 1:
                missing_component_types.append(requirement.display_name)
            else:
                missing_component_types.append(
                    f"{requirement.display_name} x{requirement.quantity_required}"
                )
        if evaluation.installed_quantity > requirement.quantity_required:
            over_installed_component_types.append(
                f"{requirement.display_name} x{evaluation.installed_quantity}/{requirement.quantity_required}"
            )
    if missing_component_types:
        missing_components = ", ".join(missing_component_types)
        raise HTTPException(
            status_code=400,
            detail=f"READY_FOR_SHIPMENT requires installed components: {missing_components}",
        )
    if over_installed_component_types or remaining_counts:
        issue_fragments: list[str] = []
        if over_installed_component_types:
            issue_fragments.append(
                "over-installed components: " + ", ".join(over_installed_component_types)
            )
        if remaining_counts:
            issue_fragments.append(
                "unexpected components: " + ", ".join(sorted(remaining_counts))
            )
        raise HTTPException(
            status_code=400,
            detail="READY_FOR_SHIPMENT requires BOM-compliant assembly: "
            + "; ".join(issue_fragments),
        )
