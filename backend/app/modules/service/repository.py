from sqlalchemy.orm import Session

from app.models import ServiceSession


def get_service_session_by_id(db: Session, session_id: str) -> ServiceSession | None:
    return db.query(ServiceSession).filter(ServiceSession.session_id == session_id).first()


def list_service_sessions(db: Session) -> list[ServiceSession]:
    return db.query(ServiceSession).order_by(ServiceSession.created_at.desc()).all()
