from uuid import uuid4

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import ServiceSession
from app.modules.service import repository, rules
from app.services.files import save_upload

MAX_QUEUE_LIMIT = 500
VALID_SERVICE_SESSION_SORT_FIELDS = {
    "session_id",
    "device_serial_number",
    "created_at",
    "uploaded_at",
    "upload_count",
}


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
        next_upload_count = (existing.upload_count or 0) + 1
        existing.device_serial_number = device_serial_number
        existing.technician_id = technician_id
        existing.device_type = device_type
        existing.result = result
        existing.firmware_version = firmware_version
        existing.bootloader_version = bootloader_version
        existing.package_path = path
        existing.package_hash = digest
        existing.upload_status = rules.UPLOADED_STATUS
        existing.upload_count = next_upload_count
        existing.client_attempt_id = client_attempt_id
        existing.client_attempt_number = client_attempt_number
        existing.client_trigger_source = client_trigger_source
        existing.upload_correlation_id = correlation_id
        existing.uploaded_at = uploaded_at
        record_audit_event(
            db,
            event_type="SERVICE_SESSION_PACKAGE_REUPLOADED",
            entity_type="SERVICE_SESSION",
            entity_id=session_id,
            operator_id=technician_id,
            result=rules.UPLOADED_STATUS,
            message="Service session package reuploaded",
            payload=_build_upload_audit_payload(
                device_serial_number=device_serial_number,
                technician_id=technician_id,
                device_type=device_type,
                result=result,
                firmware_version=firmware_version,
                bootloader_version=bootloader_version,
                package_hash=digest,
                upload_correlation_id=correlation_id,
                upload_count=next_upload_count,
                client_attempt_id=client_attempt_id,
                client_attempt_number=client_attempt_number,
                client_trigger_source=client_trigger_source,
            ),
        )
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
    record_audit_event(
        db,
        event_type="SERVICE_SESSION_PACKAGE_UPLOADED",
        entity_type="SERVICE_SESSION",
        entity_id=session_id,
        operator_id=technician_id,
        result=rules.UPLOADED_STATUS,
        message="Service session package uploaded",
        payload=_build_upload_audit_payload(
            device_serial_number=device_serial_number,
            technician_id=technician_id,
            device_type=device_type,
            result=result,
            firmware_version=firmware_version,
            bootloader_version=bootloader_version,
            package_hash=digest,
            upload_correlation_id=correlation_id,
            upload_count=1,
            client_attempt_id=client_attempt_id,
            client_attempt_number=client_attempt_number,
            client_trigger_source=client_trigger_source,
        ),
    )
    db.commit()
    db.refresh(service_session)
    return service_session


def list_service_sessions(
    db: Session,
    *,
    device_serial_number: str | None = None,
) -> list[ServiceSession]:
    return repository.list_service_sessions(
        db,
        device_serial_number=device_serial_number,
    )


def list_service_sessions_queue(
    db: Session,
    *,
    device_serial_number: str | None = None,
    device_type: str | None = None,
    technician_id: str | None = None,
    client_attempt_id: str | None = None,
    upload_correlation_id: str | None = None,
    only_reuploaded: bool = False,
    result: str | None = None,
    upload_status: str | None = None,
    client_trigger_source: str | None = None,
    sort_by: str = "uploaded_at",
    sort_desc: bool | None = None,
    offset: int = 0,
    limit: int = 100,
) -> dict[str, object]:
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if limit > MAX_QUEUE_LIMIT:
        raise HTTPException(status_code=400, detail=f"limit must be <= {MAX_QUEUE_LIMIT}")
    if sort_by not in VALID_SERVICE_SESSION_SORT_FIELDS:
        raise HTTPException(status_code=400, detail="Unsupported service session sort field")

    effective_sort_desc = (
        sort_desc if sort_desc is not None else sort_by in {"created_at", "uploaded_at", "upload_count"}
    )
    return repository.list_service_sessions_queue(
        db,
        device_serial_number=device_serial_number,
        device_type=device_type,
        technician_id=technician_id,
        client_attempt_id=client_attempt_id,
        upload_correlation_id=upload_correlation_id,
        only_reuploaded=only_reuploaded,
        result=result,
        upload_status=upload_status,
        client_trigger_source=client_trigger_source,
        sort_by=sort_by,
        sort_desc=effective_sort_desc,
        offset=offset,
        limit=limit,
    )


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


def _build_upload_audit_payload(
    *,
    device_serial_number: str,
    technician_id: str,
    device_type: str | None,
    result: str | None,
    firmware_version: str | None,
    bootloader_version: str | None,
    package_hash: str,
    upload_correlation_id: str,
    upload_count: int,
    client_attempt_id: str | None,
    client_attempt_number: int | None,
    client_trigger_source: str | None,
) -> dict[str, str | int | None]:
    return {
        "device_serial_number": device_serial_number,
        "technician_id": technician_id,
        "device_type": device_type,
        "result": result,
        "firmware_version": firmware_version,
        "bootloader_version": bootloader_version,
        "package_hash": package_hash,
        "upload_correlation_id": upload_correlation_id,
        "upload_count": upload_count,
        "client_attempt_id": client_attempt_id,
        "client_attempt_number": client_attempt_number,
        "client_trigger_source": client_trigger_source,
    }
