from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database import utc_now
from app.models import Nonconformity
from app.modules.nonconformities import repository
from app.schemas import NonconformityCreate, NonconformityUpdate


def create_ncr(db: Session, payload: NonconformityCreate) -> Nonconformity:
    if repository.get_ncr_by_id(db, payload.ncr_id):
        raise HTTPException(status_code=409, detail="NCR already exists")
    ncr = Nonconformity(**payload.model_dump())
    db.add(ncr)
    db.commit()
    db.refresh(ncr)
    return ncr


def list_ncr(db: Session) -> list[Nonconformity]:
    return repository.list_ncr(db)


def get_ncr_or_404(db: Session, ncr_id: str) -> Nonconformity:
    ncr = repository.get_ncr_by_id(db, ncr_id)
    if not ncr:
        raise HTTPException(status_code=404, detail="NCR not found")
    return ncr


def update_ncr(db: Session, ncr_id: str, payload: NonconformityUpdate) -> Nonconformity:
    ncr = get_ncr_or_404(db, ncr_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(ncr, key, value)
    if ncr.status == "CLOSED" and ncr.closed_at is None:
        ncr.closed_at = utc_now()
    db.commit()
    db.refresh(ncr)
    return ncr
