from sqlalchemy.orm import Session

from app.models import StoredFile


def get_stored_file_by_id(db: Session, file_id: str) -> StoredFile | None:
    return db.query(StoredFile).filter(StoredFile.id == file_id).first()
