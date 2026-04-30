from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database import utc_now
from app.models import AuditEvent, BarcodeLabel, ProductionItem, ScanEvent, WorkSession
from app.modules.auth_rfid.service import resolve_active_work_session
from app.modules.traceability import repository
from app.schemas import BarcodeCreate, ProductionItemCreate, ProductionItemStatusUpdate, ScanEventCreate


def record_audit_event(
    db: Session,
    *,
    event_type: str,
    entity_type: str,
    entity_id: str,
    work_session: WorkSession | None = None,
    operator_id: str | None = None,
    workstation_id: str | None = None,
    machine_id: str | None = None,
    result: str | None = None,
    message: str | None = None,
    payload: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            work_session_id=work_session.work_session_id if work_session else None,
            operator_id=operator_id or (work_session.operator_id if work_session else None),
            workstation_id=workstation_id or (work_session.workstation_id if work_session else None),
            machine_id=machine_id or (work_session.machine_id if work_session else None),
            result=result,
            message=message,
            payload=payload,
        )
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


def create_production_item(db: Session, payload: ProductionItemCreate) -> ProductionItem:
    if repository.get_production_item(db, payload.item_serial_number):
        raise HTTPException(status_code=409, detail="Production item serial already exists")
    if repository.get_production_item_by_barcode(db, payload.barcode_value):
        raise HTTPException(status_code=409, detail="Production item barcode already exists")

    work_session = resolve_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.created_by_operator_id,
        workstation_id=payload.workstation_id,
        machine_id=payload.machine_id,
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
    item.current_status = payload.current_status
    db.commit()
    db.refresh(item)
    return item


def create_scan_event(db: Session, payload: ScanEventCreate) -> ScanEvent:
    work_session = resolve_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.operator_id,
        workstation_id=payload.workstation_id,
    )
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
