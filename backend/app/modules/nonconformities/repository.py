from sqlalchemy.orm import Session

from app.models import Nonconformity


def get_ncr_by_id(db: Session, ncr_id: str) -> Nonconformity | None:
    return db.query(Nonconformity).filter(Nonconformity.ncr_id == ncr_id).first()


def list_ncr(db: Session) -> list[Nonconformity]:
    return db.query(Nonconformity).order_by(Nonconformity.detected_at.desc()).all()
