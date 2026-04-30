import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import AssemblyLink, Device, DeviceComponent, ScanEvent
from app.modules.auth_rfid.service import PRODUCTION_SESSION_ROLES, require_active_work_session
from app.modules.assembly import repository
from app.schemas import AssemblyScanRequest, ComponentCreate, DeviceCreate


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


def scan_component_for_assembly(
    db: Session,
    device_serial_number: str,
    payload: AssemblyScanRequest,
) -> AssemblyLink:
    get_device_or_404(db, device_serial_number)
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

    existing = repository.get_active_assembly_link_by_barcode(db, payload.child_barcode_value)
    if existing:
        raise HTTPException(status_code=409, detail="Component already installed in another device")

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
        payload=payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(link)
    return link


def get_assembly_tree(db: Session, device_serial_number: str) -> list[AssemblyLink]:
    get_device_or_404(db, device_serial_number)
    return repository.list_assembly_links_for_device(db, device_serial_number)
