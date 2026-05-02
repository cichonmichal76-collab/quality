from sqlalchemy.orm import Session

from app.models import ServiceSession


def get_service_session_by_id(db: Session, session_id: str) -> ServiceSession | None:
    return db.query(ServiceSession).filter(ServiceSession.session_id == session_id).first()


def list_service_sessions(
    db: Session,
    *,
    device_serial_number: str | None = None,
) -> list[ServiceSession]:
    query = db.query(ServiceSession)
    if device_serial_number:
        query = query.filter(ServiceSession.device_serial_number == device_serial_number)
    return query.order_by(ServiceSession.created_at.desc()).all()
