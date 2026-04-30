from sqlalchemy.orm import Session

from app.models import AuditEvent, WorkSession


def record_audit_event(
    db: Session,
    *,
    event_type: str,
    entity_type: str,
    entity_id: str,
    work_session: WorkSession | None = None,
    operator_id: str | None = None,
    workstation_id: str | None = None,
    machine_id: str | None = None,
    result: str | None = None,
    message: str | None = None,
    payload: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            work_session_id=work_session.work_session_id if work_session else None,
            operator_id=operator_id or (work_session.operator_id if work_session else None),
            workstation_id=workstation_id or (work_session.workstation_id if work_session else None),
            machine_id=machine_id or (work_session.machine_id if work_session else None),
            result=result,
            message=message,
            payload=payload,
        )
    )
