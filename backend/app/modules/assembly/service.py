import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import (
    AssemblyLink,
    Device,
    DeviceBomItem,
    DeviceBomTemplate,
    DeviceComponent,
    ProductionItem,
    ScanEvent,
)
from app.modules.auth_rfid.service import PRODUCTION_SESSION_ROLES, require_active_work_session
from app.modules.assembly import repository
from app.schemas import (
    AssemblyScanRequest,
    ComponentCreate,
    DeviceBomTemplateActivateRequest,
    DeviceBomItemCreate,
    DeviceBomTemplateCreate,
    DeviceCreate,
)


def get_device_or_404(db: Session, device_serial_number: str):
    device = repository.get_device_by_serial_number(db, device_serial_number)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def create_device(db: Session, payload: DeviceCreate) -> Device:
    if repository.get_device_by_serial_number(db, payload.device_serial_number):
        raise HTTPException(status_code=409, detail="Device already exists")
    device = Device(**payload.model_dump(), production_status="CREATED")
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def list_devices(db: Session) -> list[Device]:
    return repository.list_devices(db)


def add_component(db: Session, device_serial_number: str, payload: ComponentCreate) -> DeviceComponent:
    get_device_or_404(db, device_serial_number)
    component = DeviceComponent(
        device_serial_number=device_serial_number,
        installed_at=utc_now(),
        **payload.model_dump(),
    )
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


def list_components(db: Session, device_serial_number: str) -> list[DeviceComponent]:
    get_device_or_404(db, device_serial_number)
    return repository.list_device_components(db, device_serial_number)


def create_device_bom_template(db: Session, payload: DeviceBomTemplateCreate) -> DeviceBomTemplate:
    if repository.get_bom_template_by_device_type_and_version(
        db,
        payload.device_type,
        payload.version,
    ):
        raise HTTPException(
            status_code=409,
            detail="BOM template version already exists for device type",
        )
    if payload.is_active:
        active_template = repository.get_active_bom_template_by_device_type(db, payload.device_type)
        if active_template:
            active_template.is_active = False
    template = DeviceBomTemplate(**payload.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def list_device_bom_templates(db: Session) -> list[DeviceBomTemplate]:
    return repository.list_bom_templates(db)


def get_device_bom_template_or_404(
    db: Session,
    device_type: str,
    version: str | None = None,
) -> DeviceBomTemplate:
    if version is not None:
        template = repository.get_bom_template_by_device_type_and_version(db, device_type, version)
    else:
        template = repository.get_active_bom_template_by_device_type(db, device_type)
    if not template:
        raise HTTPException(status_code=404, detail="BOM template not found")
    return template


def activate_device_bom_template(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplateActivateRequest,
) -> DeviceBomTemplate:
    template = get_device_bom_template_or_404(db, device_type, payload.version)
    return repository.set_active_bom_template(db, template)


def add_device_bom_item(
    db: Session,
    device_type: str,
    payload: DeviceBomItemCreate,
    version: str | None = None,
) -> DeviceBomItem:
    template = get_device_bom_template_or_404(db, device_type, version)
    if repository.get_bom_item(db, template.id, payload.component_type):
        raise HTTPException(status_code=409, detail="BOM item already exists for component type")
    item = DeviceBomItem(template_id=template.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_device_bom_items(
    db: Session,
    device_type: str,
    version: str | None = None,
) -> list[DeviceBomItem]:
    template = get_device_bom_template_or_404(db, device_type, version)
    return repository.list_bom_items_for_template(db, template.id)


def _resolve_bom_template_for_device(db: Session, device: Device) -> DeviceBomTemplate | None:
    bound_template = repository.get_bound_bom_template_for_device(db, device.device_serial_number)
    if bound_template:
        return bound_template
    return repository.get_active_bom_template_by_device_type(db, device.device_type)


def _validate_component_against_bom(
    db: Session,
    device: Device,
    item: ProductionItem,
    component_type: str,
) -> tuple[DeviceBomTemplate | None, DeviceBomItem | None]:
    if item.item_type != component_type:
        raise HTTPException(
            status_code=400,
            detail="Scanned item type does not match requested component type",
        )

    bom_template = _resolve_bom_template_for_device(db, device)
    if not bom_template:
        return None, None

    bom_item = repository.get_bom_item(db, bom_template.id, component_type)
    if not bom_item:
        raise HTTPException(
            status_code=400,
            detail="Component type is not allowed by device BOM",
        )
    if bom_item.required_part_number and item.part_number != bom_item.required_part_number:
        raise HTTPException(
            status_code=400,
            detail="Scanned item part number does not match device BOM",
        )
    if bom_item.required_revision and item.revision != bom_item.required_revision:
        raise HTTPException(
            status_code=400,
            detail="Scanned item revision does not match device BOM",
        )
    return bom_template, bom_item


def scan_component_for_assembly(
    db: Session,
    device_serial_number: str,
    payload: AssemblyScanRequest,
) -> AssemblyLink:
    device = get_device_or_404(db, device_serial_number)
    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.installed_by,
        workstation_id=payload.workstation_id,
        allowed_roles=PRODUCTION_SESSION_ROLES,
    )
    item = repository.get_production_item_by_barcode(db, payload.child_barcode_value)
    if not item:
        raise HTTPException(status_code=404, detail="Component barcode not found")
    if item.current_status in {"QC_FAILED", "SCRAPPED", "REWORK_REQUIRED"}:
        raise HTTPException(status_code=400, detail="Component status blocks assembly")
    bom_template, bom_item = _validate_component_against_bom(
        db,
        device,
        item,
        payload.component_type,
    )

    existing = repository.get_active_assembly_link_by_barcode(db, payload.child_barcode_value)
    if existing:
        raise HTTPException(status_code=409, detail="Component already installed in another device")
    if bom_item is not None:
        installed_count = repository.count_installed_component_type_for_device(
            db,
            device.device_serial_number,
            payload.component_type,
        )
        if installed_count >= bom_item.quantity_required:
            raise HTTPException(
                status_code=409,
                detail="Device BOM quantity already satisfied for component type",
            )

    scan_event_id = f"SCAN-{uuid.uuid4().hex[:12]}"
    operator_id = payload.installed_by or work_session.operator_id
    workstation_id = payload.workstation_id or work_session.workstation_id
    event = ScanEvent(
        scan_event_id=scan_event_id,
        barcode_value=payload.child_barcode_value,
        operator_id=operator_id,
        workstation_id=workstation_id,
        context="ASSEMBLY_SCAN",
        result="ACCEPTED",
        message=f"Installed as {payload.component_type} in {device_serial_number}",
    )
    link = AssemblyLink(
        parent_device_serial_number=device_serial_number,
        child_item_serial_number=item.item_serial_number,
        child_barcode_value=item.barcode_value,
        component_type=payload.component_type,
        installed_by=operator_id,
        workstation_id=workstation_id,
        scan_event_id=scan_event_id,
        bom_template_id=bom_template.id if bom_template else None,
        bom_version=bom_template.version if bom_template else None,
    )
    item.current_status = "INSTALLED"
    db.add(event)
    db.add(link)
    record_audit_event(
        db,
        event_type="ASSEMBLY_COMPONENT_INSTALLED",
        entity_type="ASSEMBLY_LINK",
        entity_id=scan_event_id,
        work_session=work_session,
        operator_id=operator_id,
        workstation_id=workstation_id,
        result=link.status,
        message=f"Installed {item.item_serial_number} into {device_serial_number}",
        payload={
            **payload.model_dump(exclude_none=True),
            "bom_template_id": bom_template.id if bom_template else None,
            "bom_version": bom_template.version if bom_template else None,
        },
    )
    db.commit()
    db.refresh(link)
    return link


def get_assembly_tree(db: Session, device_serial_number: str) -> list[AssemblyLink]:
    get_device_or_404(db, device_serial_number)
    return repository.list_assembly_links_for_device(db, device_serial_number)
