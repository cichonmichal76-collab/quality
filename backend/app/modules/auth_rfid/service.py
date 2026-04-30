import uuid
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core import get_settings
from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import Machine, Operator, WorkSession, Workstation
from app.modules.auth_rfid import repository
from app.schemas import (
    MachineCreate,
    OperatorCreate,
    RfidLoginRequest,
    WorkSessionCloseRequest,
    WorkstationCreate,
)

PRODUCTION_SESSION_ROLES = {"ADMIN", "PRODUCTION_OPERATOR", "QUALITY_INSPECTOR"}
QUALITY_SESSION_ROLES = {"ADMIN", "QUALITY_INSPECTOR", "QUALITY_MANAGER"}
FINAL_TEST_SESSION_ROLES = {"ADMIN", "FINAL_TEST_OPERATOR", "QUALITY_MANAGER"}


def get_work_session_or_404(db: Session, work_session_id: str) -> WorkSession:
    session = repository.get_work_session_by_id(db, work_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Work session not found")
    return session


def resolve_active_work_session(
    db: Session,
    work_session_id: str | None,
    *,
    operator_id: str | None = None,
    workstation_id: str | None = None,
    machine_id: str | None = None,
    allowed_roles: set[str] | None = None,
) -> WorkSession | None:
    if not work_session_id:
        return None

    session = get_work_session_or_404(db, work_session_id)
    if _session_timed_out(session):
        _mark_session_timed_out(db, session)
    if session.status != "ACTIVE" or session.ended_at is not None:
        raise HTTPException(status_code=400, detail="Work session is not active")
    if operator_id and session.operator_id != operator_id:
        raise HTTPException(status_code=400, detail="Work session operator mismatch")
    if workstation_id and session.workstation_id != workstation_id:
        raise HTTPException(status_code=400, detail="Work session workstation mismatch")
    if machine_id and session.machine_id and session.machine_id != machine_id:
        raise HTTPException(status_code=400, detail="Work session machine mismatch")
    operator = repository.get_operator_by_id(db, session.operator_id)
    if not operator or not operator.is_active:
        raise HTTPException(status_code=401, detail="Operator for work session is inactive")
    if allowed_roles and operator.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Operator role {operator.role} is not allowed for this action",
        )
    return session


def require_active_work_session(
    db: Session,
    work_session_id: str | None,
    *,
    operator_id: str | None = None,
    workstation_id: str | None = None,
    machine_id: str | None = None,
    allowed_roles: set[str] | None = None,
) -> WorkSession:
    if not work_session_id:
        raise HTTPException(status_code=400, detail="Active work session is required")
    session = resolve_active_work_session(
        db,
        work_session_id,
        operator_id=operator_id,
        workstation_id=workstation_id,
        machine_id=machine_id,
        allowed_roles=allowed_roles,
    )
    if session is None:
        raise HTTPException(status_code=400, detail="Active work session is required")
    return session


def _session_timed_out(session: WorkSession) -> bool:
    timeout_minutes = get_settings().work_session_timeout_minutes
    expires_at = session.started_at + timedelta(minutes=timeout_minutes)
    return session.ended_at is None and utc_now() > expires_at


def _mark_session_timed_out(db: Session, session: WorkSession) -> None:
    if session.status == "TIMEOUT":
        return
    session.status = "TIMEOUT"
    session.ended_at = utc_now()
    record_audit_event(
        db,
        event_type="WORK_SESSION_TIMED_OUT",
        entity_type="WORK_SESSION",
        entity_id=session.work_session_id,
        work_session=session,
        result=session.status,
        message="Work session timed out",
    )
    db.commit()
    db.refresh(session)


def create_operator(db: Session, payload: OperatorCreate) -> Operator:
    if repository.get_operator_by_id(db, payload.operator_id):
        raise HTTPException(status_code=409, detail="Operator already exists")
    operator = Operator(**payload.model_dump())
    db.add(operator)
    db.commit()
    db.refresh(operator)
    return operator


def create_workstation(db: Session, payload: WorkstationCreate) -> Workstation:
    if repository.get_workstation_by_id(db, payload.workstation_id):
        raise HTTPException(status_code=409, detail="Workstation already exists")
    workstation = Workstation(**payload.model_dump())
    db.add(workstation)
    db.commit()
    db.refresh(workstation)
    return workstation


def create_machine(db: Session, payload: MachineCreate) -> Machine:
    if repository.get_machine_by_id(db, payload.machine_id):
        raise HTTPException(status_code=409, detail="Machine already exists")
    machine = Machine(**payload.model_dump())
    db.add(machine)
    db.commit()
    db.refresh(machine)
    return machine


def rfid_login(db: Session, payload: RfidLoginRequest, *, audit_logger) -> WorkSession:
    operator = repository.get_operator_by_rfid(db, payload.rfid_uid_hash)
    if not operator or not operator.is_active:
        record_audit_event(
            db,
            event_type="RFID_LOGIN_FAILED",
            entity_type="WORKSTATION",
            entity_id=payload.workstation_id,
            workstation_id=payload.workstation_id,
            machine_id=payload.machine_id,
            result="DENIED",
            message="Unknown or inactive RFID card",
            payload=payload.model_dump(),
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Unknown or inactive RFID card")

    workstation = repository.get_workstation(db, payload.workstation_id)
    if not workstation or not workstation.is_active:
        record_audit_event(
            db,
            event_type="RFID_LOGIN_FAILED",
            entity_type="WORKSTATION",
            entity_id=payload.workstation_id,
            operator_id=operator.operator_id,
            workstation_id=payload.workstation_id,
            machine_id=payload.machine_id,
            result="DENIED",
            message="Unknown or inactive workstation",
            payload=payload.model_dump(),
        )
        db.commit()
        raise HTTPException(status_code=400, detail="Unknown or inactive workstation")

    if payload.machine_id:
        machine = repository.get_machine(db, payload.machine_id)
        if not machine or not machine.is_active:
            record_audit_event(
                db,
                event_type="RFID_LOGIN_FAILED",
                entity_type="MACHINE",
                entity_id=payload.machine_id,
                operator_id=operator.operator_id,
                workstation_id=payload.workstation_id,
                machine_id=payload.machine_id,
                result="DENIED",
                message="Unknown or inactive machine",
                payload=payload.model_dump(),
            )
            db.commit()
            raise HTTPException(status_code=400, detail="Unknown or inactive machine")

    session = repository.find_active_session(
        db,
        operator_id=operator.operator_id,
        workstation_id=payload.workstation_id,
        machine_id=payload.machine_id,
    )
    if session:
        if _session_timed_out(session):
            _mark_session_timed_out(db, session)
        else:
            audit_logger(
                db,
                event_type="RFID_LOGIN_REUSED",
                entity_type="WORK_SESSION",
                entity_id=session.work_session_id,
                work_session=session,
                result="ACTIVE",
                message="RFID login reused active work session",
                payload=payload.model_dump(),
            )
            db.commit()
            db.refresh(session)
            return session

    session = WorkSession(
        work_session_id=f"WS-{uuid.uuid4().hex[:12]}",
        operator_id=operator.operator_id,
        workstation_id=payload.workstation_id,
        machine_id=payload.machine_id,
        rfid_uid_hash=payload.rfid_uid_hash,
    )
    db.add(session)
    audit_logger(
        db,
        event_type="RFID_LOGIN",
        entity_type="WORK_SESSION",
        entity_id=session.work_session_id,
        work_session=session,
        result="ACTIVE",
        message="RFID login started work session",
        payload=payload.model_dump(),
    )
    db.commit()
    db.refresh(session)
    return session


def close_work_session(
    db: Session,
    work_session_id: str,
    payload: WorkSessionCloseRequest | None,
    *,
    audit_logger,
) -> WorkSession:
    session = get_work_session_or_404(db, work_session_id)
    if session.status != "CLOSED":
        session.status = "CLOSED"
        session.ended_at = utc_now()
    audit_logger(
        db,
        event_type="WORK_SESSION_CLOSED",
        entity_type="WORK_SESSION",
        entity_id=work_session_id,
        work_session=session,
        result=session.status,
        message=(payload.reason if payload and payload.reason else "Work session closed"),
        payload=payload.model_dump(exclude_none=True) if payload else None,
    )
    db.commit()
    db.refresh(session)
    return session
