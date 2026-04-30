from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.models import StoredFile
from app.modules.files import repository
from app.services.files import save_upload


def upload_file(
    db: Session,
    *,
    file: UploadFile,
    related_entity_type: str,
    related_entity_id: str,
    uploaded_by: str | None = None,
) -> StoredFile:
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


def get_stored_file_or_404(db: Session, file_id: str) -> StoredFile:
    stored = repository.get_stored_file_by_id(db, file_id)
    if not stored:
        raise HTTPException(status_code=404, detail="File not found")
    return stored


def download_file(db: Session, file_id: str) -> FileResponse:
    stored = get_stored_file_or_404(db, file_id)
    return FileResponse(stored.file_path, filename=stored.file_name)
