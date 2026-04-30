import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

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
) -> WorkSession | None:
    if not work_session_id:
        return None

    session = get_work_session_or_404(db, work_session_id)
    if session.status != "ACTIVE" or session.ended_at is not None:
        raise HTTPException(status_code=400, detail="Work session is not active")
    if operator_id and session.operator_id != operator_id:
        raise HTTPException(status_code=400, detail="Work session operator mismatch")
    if workstation_id and session.workstation_id != workstation_id:
        raise HTTPException(status_code=400, detail="Work session workstation mismatch")
    if machine_id and session.machine_id and session.machine_id != machine_id:
        raise HTTPException(status_code=400, detail="Work session machine mismatch")
    return session


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
        raise HTTPException(status_code=401, detail="Unknown or inactive RFID card")

    workstation = repository.get_workstation(db, payload.workstation_id)
    if not workstation or not workstation.is_active:
        raise HTTPException(status_code=400, detail="Unknown or inactive workstation")

    if payload.machine_id:
        machine = repository.get_machine(db, payload.machine_id)
        if not machine or not machine.is_active:
            raise HTTPException(status_code=400, detail="Unknown or inactive machine")

    session = repository.find_active_session(
        db,
        operator_id=operator.operator_id,
        workstation_id=payload.workstation_id,
        machine_id=payload.machine_id,
    )
    if session:
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
