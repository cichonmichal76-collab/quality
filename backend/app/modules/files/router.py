from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.files import service
from app.schemas import FileRead

router = APIRouter(tags=["files"])


@router.post("/files/upload", response_model=FileRead)
def upload_file(
    file: UploadFile = File(...),
    related_entity_type: str = Form(...),
    related_entity_id: str = Form(...),
    uploaded_by: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    return service.upload_file(
        db,
        file=file,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        uploaded_by=uploaded_by,
    )


@router.get("/files/{file_id}")
def download_file(file_id: str, db: Session = Depends(get_db)):
    return service.download_file(db, file_id)
