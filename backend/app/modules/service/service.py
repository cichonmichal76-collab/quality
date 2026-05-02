from uuid import uuid4

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import utc_now
from app.models import ServiceSession
from app.modules.service import repository, rules
from app.services.files import save_upload


def upload_service_session(
    db: Session,
    *,
    file: UploadFile,
    session_id: str,
    device_serial_number: str,
    technician_id: str,
    device_type: str | None = None,
    result: str | None = None,
    firmware_version: str | None = None,
    bootloader_version: str | None = None,
    client_attempt_id: str | None = None,
    client_attempt_number: int | None = None,
    client_trigger_source: str | None = None,
) -> ServiceSession:
    safe_name = f"{session_id}_{file.filename}".replace("/", "_")
    path, digest = save_upload(file, "packages", safe_name)
    correlation_id = f"SRV-UP-{uuid4().hex[:12].upper()}"
    uploaded_at = utc_now()
    existing = repository.get_service_session_by_id(db, session_id)
    if existing:
        existing.device_serial_number = device_serial_number
        existing.technician_id = technician_id
        existing.device_type = device_type
        existing.result = result
        existing.firmware_version = firmware_version
        existing.bootloader_version = bootloader_version
        existing.package_path = path
        existing.package_hash = digest
        existing.upload_status = rules.UPLOADED_STATUS
        existing.upload_count = (existing.upload_count or 0) + 1
        existing.client_attempt_id = client_attempt_id
        existing.client_attempt_number = client_attempt_number
        existing.client_trigger_source = client_trigger_source
        existing.upload_correlation_id = correlation_id
        existing.uploaded_at = uploaded_at
        db.commit()
        db.refresh(existing)
        return existing
    service_session = ServiceSession(
        session_id=session_id,
        device_serial_number=device_serial_number,
        technician_id=technician_id,
        device_type=device_type,
        result=result,
        firmware_version=firmware_version,
        bootloader_version=bootloader_version,
        package_path=path,
        package_hash=digest,
        upload_status=rules.UPLOADED_STATUS,
        upload_count=1,
        client_attempt_id=client_attempt_id,
        client_attempt_number=client_attempt_number,
        client_trigger_source=client_trigger_source,
        upload_correlation_id=correlation_id,
        uploaded_at=uploaded_at,
    )
    db.add(service_session)
    db.commit()
    db.refresh(service_session)
    return service_session


def list_service_sessions(db: Session) -> list[ServiceSession]:
    return repository.list_service_sessions(db)


def get_service_session_or_404(db: Session, session_id: str) -> ServiceSession:
    session = repository.get_service_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Service session not found")
    return session


def download_service_session_package(db: Session, session_id: str) -> FileResponse:
    session = get_service_session_or_404(db, session_id)
    if not session.package_path:
        raise HTTPException(status_code=404, detail="Package not found")
    return FileResponse(session.package_path)
