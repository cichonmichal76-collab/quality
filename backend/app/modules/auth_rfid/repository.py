from sqlalchemy import func
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Machine, Operator, WorkSession, Workstation


def get_operator_by_rfid(db: Session, rfid_uid_hash: str) -> Operator | None:
    return db.query(Operator).filter(Operator.rfid_uid_hash == rfid_uid_hash).first()


def get_workstation(db: Session, workstation_id: str) -> Workstation | None:
    return db.query(Workstation).filter(Workstation.workstation_id == workstation_id).first()


def get_machine(db: Session, machine_id: str) -> Machine | None:
    return db.query(Machine).filter(Machine.machine_id == machine_id).first()


def find_active_session(
    db: Session,
    *,
    operator_id: str,
    workstation_id: str,
    machine_id: str | None,
) -> WorkSession | None:
    return (
        db.query(WorkSession)
        .filter(
            WorkSession.operator_id == operator_id,
            WorkSession.workstation_id == workstation_id,
            WorkSession.machine_id == machine_id,
            WorkSession.status == "ACTIVE",
            WorkSession.ended_at.is_(None),
        )
        .first()
    )


def get_work_session_by_id(db: Session, work_session_id: str) -> WorkSession | None:
    return db.query(WorkSession).filter(WorkSession.work_session_id == work_session_id).first()


def list_work_sessions(db: Session) -> list[WorkSession]:
    return db.query(WorkSession).order_by(WorkSession.started_at.desc()).all()


def get_operator_by_id(db: Session, operator_id: str) -> Operator | None:
    return db.query(Operator).filter(Operator.operator_id == operator_id).first()


def get_operator_by_login(db: Session, login: str) -> Operator | None:
    normalized_login = login.strip().lower()
    return (
        db.query(Operator)
        .filter(
            or_(
                func.lower(Operator.login_name) == normalized_login,
                func.lower(Operator.operator_id) == normalized_login,
            )
        )
        .first()
    )


def list_operators(db: Session) -> list[Operator]:
    return db.query(Operator).order_by(Operator.created_at.desc()).all()


def get_workstation_by_id(db: Session, workstation_id: str) -> Workstation | None:
    return db.query(Workstation).filter(Workstation.workstation_id == workstation_id).first()


def list_workstations(db: Session) -> list[Workstation]:
    return db.query(Workstation).all()


def get_machine_by_id(db: Session, machine_id: str) -> Machine | None:
    return db.query(Machine).filter(Machine.machine_id == machine_id).first()


def list_machines(db: Session) -> list[Machine]:
    return db.query(Machine).all()
