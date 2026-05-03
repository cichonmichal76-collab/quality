from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.service import service
from app.schemas import ServiceSessionQueueRead, ServiceSessionRead

router = APIRouter(tags=["service"])


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
    client_attempt_id: str | None = Form(default=None),
    client_attempt_number: int | None = Form(default=None, ge=1),
    client_trigger_source: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    return service.upload_service_session(
        db,
        file=file,
        session_id=session_id,
        device_serial_number=device_serial_number,
        technician_id=technician_id,
        device_type=device_type,
        result=result,
        firmware_version=firmware_version,
        bootloader_version=bootloader_version,
        client_attempt_id=client_attempt_id,
        client_attempt_number=client_attempt_number,
        client_trigger_source=client_trigger_source,
    )


@router.get("/service-sessions", response_model=list[ServiceSessionRead])
def list_service_sessions(
    device_serial_number: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_service_sessions(
        db,
        device_serial_number=device_serial_number,
    )


@router.get("/service-sessions/queue", response_model=ServiceSessionQueueRead)
def list_service_sessions_queue(
    device_serial_number: str | None = None,
    device_type: str | None = None,
    technician_id: str | None = None,
    result: str | None = None,
    upload_status: str | None = None,
    client_trigger_source: str | None = None,
    sort_by: str = "uploaded_at",
    sort_desc: bool | None = None,
    offset: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return service.list_service_sessions_queue(
        db,
        device_serial_number=device_serial_number,
        device_type=device_type,
        technician_id=technician_id,
        result=result,
        upload_status=upload_status,
        client_trigger_source=client_trigger_source,
        sort_by=sort_by,
        sort_desc=sort_desc,
        offset=offset,
        limit=limit,
    )


@router.get("/service-sessions/{session_id}", response_model=ServiceSessionRead)
def get_service_session(session_id: str, db: Session = Depends(get_db)):
    return service.get_service_session_or_404(db, session_id)


@router.get("/service-sessions/{session_id}/package")
def download_service_session_package(session_id: str, db: Session = Depends(get_db)):
    return service.download_service_session_package(db, session_id)
