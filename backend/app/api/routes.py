from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import get_db, utc_now
from app.models import (
    Device,
    DeviceComponent,
    Nonconformity,
    ServiceSession,
    StoredFile,
)
from app.schemas import (
    ComponentCreate,
    ComponentRead,
    DeviceCreate,
    DeviceRead,
    DeviceStatusUpdate,
    FileRead,
    NonconformityCreate,
    NonconformityRead,
    NonconformityUpdate,
    ServiceSessionRead,
)
from app.services.files import save_upload

router = APIRouter()


READY_FOR_SHIPMENT = "READY_FOR_SHIPMENT"
FINAL_TEST_PASSED = "FINAL_TEST_PASSED"
FINAL_TEST_FAILED = "FINAL_TEST_FAILED"


def get_device_or_404(db: Session, serial_number: str) -> Device:
    device = db.query(Device).filter(Device.device_serial_number == serial_number).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def has_critical_open_ncr(db: Session, serial_number: str) -> bool:
    return (
        db.query(Nonconformity)
        .filter(
            Nonconformity.device_serial_number == serial_number,
            Nonconformity.severity == "CRITICAL",
            Nonconformity.status != "CLOSED",
        )
        .first()
        is not None
    )

@router.post("/devices", response_model=DeviceRead)
def create_device(payload: DeviceCreate, db: Session = Depends(get_db)):
    exists = db.query(Device).filter(Device.device_serial_number == payload.device_serial_number).first()
    if exists:
        raise HTTPException(status_code=409, detail="Device already exists")
    device = Device(**payload.model_dump(), production_status="CREATED")
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("/devices", response_model=list[DeviceRead])
def list_devices(db: Session = Depends(get_db)):
    return db.query(Device).order_by(Device.created_at.desc()).all()


@router.get("/devices/{serial_number}", response_model=DeviceRead)
def get_device(serial_number: str, db: Session = Depends(get_db)):
    return get_device_or_404(db, serial_number)


@router.patch("/devices/{serial_number}/status", response_model=DeviceRead)
def update_device_status(
    serial_number: str, payload: DeviceStatusUpdate, db: Session = Depends(get_db)
):
    device = get_device_or_404(db, serial_number)
    if payload.production_status == READY_FOR_SHIPMENT:
        if device.production_status != FINAL_TEST_PASSED:
            raise HTTPException(
                status_code=400,
                detail="READY_FOR_SHIPMENT requires FINAL_TEST_PASSED",
            )
        if has_critical_open_ncr(db, serial_number):
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


@router.post("/devices/{serial_number}/components", response_model=ComponentRead)
def add_component(serial_number: str, payload: ComponentCreate, db: Session = Depends(get_db)):
    get_device_or_404(db, serial_number)
    component = DeviceComponent(
        device_serial_number=serial_number,
        installed_at=utc_now(),
        **payload.model_dump(),
    )
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


@router.get("/devices/{serial_number}/components", response_model=list[ComponentRead])
def list_components(serial_number: str, db: Session = Depends(get_db)):
    get_device_or_404(db, serial_number)
    return (
        db.query(DeviceComponent)
        .filter(DeviceComponent.device_serial_number == serial_number)
        .order_by(DeviceComponent.installed_at.desc())
        .all()
    )


@router.post("/service-sessions/upload", response_model=ServiceSessionRead)
def upload_service_session(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    device_serial_number: str = Form(...),
    technician_id: str = Form(...),
    device_type: str | None = Form(default=None),
    result: str | None = Form(default=None),
    firmware_version: str | None = Form(default=None),
    bootloader_version: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    safe_name = f"{session_id}_{file.filename}".replace("/", "_")
    path, digest = save_upload(file, "packages", safe_name)
    existing = db.query(ServiceSession).filter(ServiceSession.session_id == session_id).first()
    if existing:
        existing.package_path = path
        existing.package_hash = digest
        existing.upload_status = "UPLOADED"
        db.commit()
        db.refresh(existing)
        return existing
    session = ServiceSession(
        session_id=session_id,
        device_serial_number=device_serial_number,
        technician_id=technician_id,
        device_type=device_type,
        result=result,
        firmware_version=firmware_version,
        bootloader_version=bootloader_version,
        package_path=path,
        package_hash=digest,
        upload_status="UPLOADED",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/service-sessions", response_model=list[ServiceSessionRead])
def list_service_sessions(db: Session = Depends(get_db)):
    return db.query(ServiceSession).order_by(ServiceSession.created_at.desc()).all()


@router.get("/service-sessions/{session_id}", response_model=ServiceSessionRead)
def get_service_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ServiceSession).filter(ServiceSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Service session not found")
    return session


@router.get("/service-sessions/{session_id}/package")
def download_service_session_package(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ServiceSession).filter(ServiceSession.session_id == session_id).first()
    if not session or not session.package_path:
        raise HTTPException(status_code=404, detail="Package not found")
    return FileResponse(session.package_path)


@router.post("/nonconformities", response_model=NonconformityRead)
def create_ncr(payload: NonconformityCreate, db: Session = Depends(get_db)):
    ncr = Nonconformity(**payload.model_dump())
    db.add(ncr)
    db.commit()
    db.refresh(ncr)
    return ncr


@router.get("/nonconformities", response_model=list[NonconformityRead])
def list_ncr(db: Session = Depends(get_db)):
    return db.query(Nonconformity).order_by(Nonconformity.detected_at.desc()).all()


@router.get("/nonconformities/{ncr_id}", response_model=NonconformityRead)
def get_ncr(ncr_id: str, db: Session = Depends(get_db)):
    ncr = db.query(Nonconformity).filter(Nonconformity.ncr_id == ncr_id).first()
    if not ncr:
        raise HTTPException(status_code=404, detail="NCR not found")
    return ncr


@router.patch("/nonconformities/{ncr_id}", response_model=NonconformityRead)
def update_ncr(ncr_id: str, payload: NonconformityUpdate, db: Session = Depends(get_db)):
    ncr = db.query(Nonconformity).filter(Nonconformity.ncr_id == ncr_id).first()
    if not ncr:
        raise HTTPException(status_code=404, detail="NCR not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(ncr, key, value)
    if ncr.status == "CLOSED" and ncr.closed_at is None:
        ncr.closed_at = utc_now()
    db.commit()
    db.refresh(ncr)
    return ncr


@router.post("/files/upload", response_model=FileRead)
def upload_file(
    file: UploadFile = File(...),
    related_entity_type: str = Form(...),
    related_entity_id: str = Form(...),
    uploaded_by: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    safe_name = f"{related_entity_type}_{related_entity_id}_{file.filename}".replace("/", "_")
    path, digest = save_upload(file, "files", safe_name)
    stored = StoredFile(
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        file_name=file.filename,
        file_path=path,
        file_type=file.content_type,
        file_hash=digest,
        uploaded_by=uploaded_by,
    )
    db.add(stored)
    db.commit()
    db.refresh(stored)
    return stored


@router.get("/files/{file_id}")
def download_file(file_id: str, db: Session = Depends(get_db)):
    stored = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if not stored:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(stored.file_path, filename=stored.file_name)
