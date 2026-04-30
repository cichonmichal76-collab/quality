from sqlalchemy.orm import Session

from app.models import AuditEvent, BarcodeLabel, ProductionItem, ScanEvent


def get_barcode_label(db: Session, barcode_value: str) -> BarcodeLabel | None:
    return db.query(BarcodeLabel).filter(BarcodeLabel.barcode_value == barcode_value).first()


def get_production_item(db: Session, item_serial_number: str) -> ProductionItem | None:
    return db.query(ProductionItem).filter(ProductionItem.item_serial_number == item_serial_number).first()


def get_production_item_by_barcode(db: Session, barcode_value: str) -> ProductionItem | None:
    return db.query(ProductionItem).filter(ProductionItem.barcode_value == barcode_value).first()


def list_audit_events(
    db: Session,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    work_session_id: str | None = None,
) -> list[AuditEvent]:
    query = db.query(AuditEvent)
    if entity_type:
        query = query.filter(AuditEvent.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditEvent.entity_id == entity_id)
    if work_session_id:
        query = query.filter(AuditEvent.work_session_id == work_session_id)
    return query.order_by(AuditEvent.created_at.desc()).all()


def list_scan_events_for_barcode(db: Session, barcode_value: str) -> list[ScanEvent]:
    return (
        db.query(ScanEvent)
        .filter(ScanEvent.barcode_value == barcode_value)
        .order_by(ScanEvent.created_at.desc())
        .all()
    )
