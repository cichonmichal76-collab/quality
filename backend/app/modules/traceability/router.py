from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.traceability import repository, service
from app.schemas import (
    AuditEventRead,
    BarcodeCreate,
    BarcodeRead,
    ProductionItemCreate,
    ProductionItemRead,
    ProductionItemStatusUpdate,
    ScanEventCreate,
    ScanEventRead,
)

router = APIRouter(tags=["traceability"])


@router.get("/audit-events", response_model=list[AuditEventRead])
def list_audit_events(
    entity_type: str | None = None,
    entity_id: str | None = None,
    work_session_id: str | None = None,
    db: Session = Depends(get_db),
):
    return repository.list_audit_events(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        work_session_id=work_session_id,
    )


@router.post("/barcodes/create", response_model=BarcodeRead)
def create_barcode(payload: BarcodeCreate, db: Session = Depends(get_db)):
    return service.create_barcode(db, payload)


@router.get("/barcodes/{barcode_value}", response_model=BarcodeRead)
def get_barcode(barcode_value: str, db: Session = Depends(get_db)):
    return service.get_barcode_or_404(db, barcode_value)


@router.post("/production-items", response_model=ProductionItemRead)
def create_production_item(payload: ProductionItemCreate, db: Session = Depends(get_db)):
    return service.create_production_item(db, payload)


@router.get("/production-items/{item_serial_number}", response_model=ProductionItemRead)
def get_production_item(item_serial_number: str, db: Session = Depends(get_db)):
    return service.get_production_item_or_404(db, item_serial_number)


@router.get("/production-items/by-barcode/{barcode_value}", response_model=ProductionItemRead)
def get_production_item_by_barcode(barcode_value: str, db: Session = Depends(get_db)):
    return service.get_production_item_by_barcode_or_404(db, barcode_value)


@router.patch("/production-items/{item_serial_number}/status", response_model=ProductionItemRead)
def update_production_item_status(
    item_serial_number: str,
    payload: ProductionItemStatusUpdate,
    db: Session = Depends(get_db),
):
    return service.update_production_item_status(db, item_serial_number, payload)


@router.post("/scan-events", response_model=ScanEventRead)
def create_scan_event(payload: ScanEventCreate, db: Session = Depends(get_db)):
    return service.create_scan_event(db, payload)
