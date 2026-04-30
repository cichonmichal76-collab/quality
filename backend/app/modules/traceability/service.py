from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import BarcodeLabel, ProductionItem, ScanEvent
from app.modules.auth_rfid.service import (
    PRODUCTION_SESSION_ROLES,
    require_active_work_session,
)
from app.modules.traceability import repository
from app.modules.traceability.rules import (
    ALLOWED_BARCODE_STATUSES,
    ALLOWED_PRODUCTION_ITEM_TRANSITIONS,
)
from app.schemas import (
    BarcodeCreate,
    BarcodeStatusUpdate,
    ProductionItemCreate,
    ProductionItemStatusUpdate,
    ScanEventCreate,
)


def create_barcode(db: Session, payload: BarcodeCreate) -> BarcodeLabel:
    if repository.get_barcode_label(db, payload.barcode_value):
        raise HTTPException(status_code=409, detail="Barcode already exists")
    label = BarcodeLabel(**payload.model_dump())
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


def get_barcode_or_404(db: Session, barcode_value: str) -> BarcodeLabel:
    label = repository.get_barcode_label(db, barcode_value)
    if not label:
        raise HTTPException(status_code=404, detail="Barcode not found")
    return label


def update_barcode_status(
    db: Session,
    barcode_value: str,
    payload: BarcodeStatusUpdate,
) -> BarcodeLabel:
    label = get_barcode_or_404(db, barcode_value)
    if payload.status not in ALLOWED_BARCODE_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported barcode status")
    label.status = payload.status
    record_audit_event(
        db,
        event_type="BARCODE_STATUS_UPDATED",
        entity_type="BARCODE",
        entity_id=barcode_value,
        result=payload.status,
        payload={"status": payload.status},
    )
    db.commit()
    db.refresh(label)
    return label


def create_production_item(db: Session, payload: ProductionItemCreate) -> ProductionItem:
    if repository.get_production_item(db, payload.item_serial_number):
        raise HTTPException(status_code=409, detail="Production item serial already exists")
    if repository.get_production_item_by_barcode(db, payload.barcode_value):
        raise HTTPException(status_code=409, detail="Production item barcode already exists")

    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.created_by_operator_id,
        workstation_id=payload.workstation_id,
        machine_id=payload.machine_id,
        allowed_roles=PRODUCTION_SESSION_ROLES,
    )
    item = ProductionItem(
        item_serial_number=payload.item_serial_number,
        barcode_value=payload.barcode_value,
        item_type=payload.item_type,
        part_number=payload.part_number,
        revision=payload.revision,
        drawing_number=payload.drawing_number,
        drawing_revision=payload.drawing_revision,
        production_order=payload.production_order,
        material_batch=payload.material_batch,
        machine_id=payload.machine_id or (work_session.machine_id if work_session else None),
        created_by_operator_id=payload.created_by_operator_id or (work_session.operator_id if work_session else None),
        current_status=payload.current_status,
        produced_at=utc_now(),
    )
    db.add(item)

    label = repository.get_barcode_label(db, payload.barcode_value)
    if not label:
        db.add(
            BarcodeLabel(
                barcode_value=payload.barcode_value,
                entity_type="PRODUCTION_ITEM",
                entity_serial_number=payload.item_serial_number,
                printed_by=item.created_by_operator_id,
            )
        )

    record_audit_event(
        db,
        event_type="PRODUCTION_ITEM_CREATED",
        entity_type="PRODUCTION_ITEM",
        entity_id=payload.item_serial_number,
        work_session=work_session,
        operator_id=item.created_by_operator_id,
        workstation_id=payload.workstation_id,
        machine_id=item.machine_id,
        result=item.current_status,
        message=f"Production item created with barcode {payload.barcode_value}",
        payload=payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(item)
    return item


def get_production_item_or_404(db: Session, item_serial_number: str) -> ProductionItem:
    item = repository.get_production_item(db, item_serial_number)
    if not item:
        raise HTTPException(status_code=404, detail="Production item not found")
    return item


def get_production_item_by_barcode_or_404(db: Session, barcode_value: str) -> ProductionItem:
    item = repository.get_production_item_by_barcode(db, barcode_value)
    if not item:
        raise HTTPException(status_code=404, detail="Production item not found")
    return item


def update_production_item_status(
    db: Session,
    item_serial_number: str,
    payload: ProductionItemStatusUpdate,
) -> ProductionItem:
    item = get_production_item_or_404(db, item_serial_number)
    if item.current_status != payload.current_status:
        allowed_targets = ALLOWED_PRODUCTION_ITEM_TRANSITIONS.get(item.current_status, set())
        if payload.current_status not in allowed_targets:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid production item status transition: {item.current_status} -> {payload.current_status}",
            )
    item.current_status = payload.current_status
    record_audit_event(
        db,
        event_type="PRODUCTION_ITEM_STATUS_UPDATED",
        entity_type="PRODUCTION_ITEM",
        entity_id=item_serial_number,
        result=payload.current_status,
        payload={"current_status": payload.current_status},
    )
    db.commit()
    db.refresh(item)
    return item


def create_scan_event(db: Session, payload: ScanEventCreate) -> ScanEvent:
    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.operator_id,
        workstation_id=payload.workstation_id,
        allowed_roles=PRODUCTION_SESSION_ROLES,
    )
    label = get_barcode_or_404(db, payload.barcode_value)
    if label.status != "ACTIVE":
        _record_rejected_scan_event(
            db,
            payload,
            work_session=work_session,
            message=f"Barcode {payload.barcode_value} is not active",
        )
        raise HTTPException(status_code=400, detail="Barcode is not active")

    item = repository.get_production_item_by_barcode(db, payload.barcode_value)
    if item and item.current_status in {"BLOCKED", "SCRAPPED"}:
        _record_rejected_scan_event(
            db,
            payload,
            work_session=work_session,
            message=f"Production item status {item.current_status} blocks scanning",
        )
        raise HTTPException(status_code=400, detail="Production item status blocks scanning")

    event = ScanEvent(
        scan_event_id=payload.scan_event_id,
        barcode_value=payload.barcode_value,
        operator_id=payload.operator_id or (work_session.operator_id if work_session else None),
        workstation_id=payload.workstation_id or (work_session.workstation_id if work_session else None),
        context=payload.context,
        result=payload.result,
        message=payload.message,
    )
    db.add(event)
    record_audit_event(
        db,
        event_type="SCAN_EVENT_RECORDED",
        entity_type="SCAN_EVENT",
        entity_id=payload.scan_event_id,
        work_session=work_session,
        operator_id=event.operator_id,
        workstation_id=event.workstation_id,
        result=payload.result,
        message=payload.message,
        payload=payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(event)
    return event


def list_scan_history(db: Session, barcode_value: str) -> list[ScanEvent]:
    return repository.list_scan_events_for_barcode(db, barcode_value)


def _record_rejected_scan_event(
    db: Session,
    payload: ScanEventCreate,
    *,
    work_session,
    message: str,
) -> None:
    db.add(
        ScanEvent(
            scan_event_id=payload.scan_event_id,
            barcode_value=payload.barcode_value,
            operator_id=payload.operator_id or work_session.operator_id,
            workstation_id=payload.workstation_id or work_session.workstation_id,
            context=payload.context,
            result="REJECTED",
            message=message,
        )
    )
    record_audit_event(
        db,
        event_type="SCAN_EVENT_REJECTED",
        entity_type="SCAN_EVENT",
        entity_id=payload.scan_event_id,
        work_session=work_session,
        operator_id=payload.operator_id or work_session.operator_id,
        workstation_id=payload.workstation_id or work_session.workstation_id,
        result="REJECTED",
        message=message,
        payload=payload.model_dump(exclude_none=True),
    )
    db.commit()
