import hashlib
import hmac
import secrets
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
    OperatorLoginRequest,
    OperatorCreate,
    OperatorUpdate,
    RfidLoginRequest,
    WorkSessionCloseRequest,
    WorkstationCreate,
    WorkstationUpdate,
)

PRODUCTION_SESSION_ROLES = {"ADMIN", "PRODUCTION_OPERATOR", "QUALITY_INSPECTOR"}
QUALITY_SESSION_ROLES = {"ADMIN", "QUALITY_INSPECTOR", "QUALITY_MANAGER"}
FINAL_TEST_SESSION_ROLES = {"ADMIN", "FINAL_TEST_OPERATOR", "QUALITY_MANAGER"}
PASSWORD_HASH_ITERATIONS = 150_000


def normalize_login_name(login_name: str | None, operator_id: str) -> str:
    candidate = (login_name or operator_id).strip().lower()
    if not candidate:
        raise HTTPException(status_code=400, detail="Operator login name cannot be empty")
    return candidate


def hash_operator_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password_bytes,
        salt.encode("utf-8"),
        PASSWORD_HASH_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt}${digest}"


def verify_operator_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False

    try:
        algorithm, iterations_text, salt, expected_digest = password_hash.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    try:
        iterations = int(iterations_text)
    except ValueError:
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(digest, expected_digest)


def sanitize_operator_login_payload(payload: OperatorLoginRequest) -> dict[str, str | None]:
    return {
        "login": payload.login,
        "workstation_id": payload.workstation_id,
        "machine_id": payload.machine_id,
    }


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
    login_name = normalize_login_name(payload.login_name, payload.operator_id)
    if repository.get_operator_by_login(db, login_name):
        raise HTTPException(status_code=409, detail="Operator login already exists")

    operator = Operator(
        operator_id=payload.operator_id,
        full_name=payload.full_name,
        role=payload.role,
        login_name=login_name,
        password_hash=hash_operator_password(payload.password or payload.operator_id),
        rfid_uid_hash=payload.rfid_uid_hash,
        is_active=payload.is_active,
    )
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


def update_operator(db: Session, operator_id: str, payload: OperatorUpdate) -> Operator:
    operator = repository.get_operator_by_id(db, operator_id)
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")

    updates = payload.model_dump(exclude_unset=True)
    if "login_name" in updates:
        normalized_login_name = normalize_login_name(updates["login_name"], operator.operator_id)
        existing_operator = repository.get_operator_by_login(db, normalized_login_name)
        if existing_operator and existing_operator.operator_id != operator.operator_id:
            raise HTTPException(status_code=409, detail="Operator login already exists")
        operator.login_name = normalized_login_name

    if "password" in updates:
        password = updates["password"]
        if password is None or not password.strip():
            raise HTTPException(status_code=400, detail="Operator password cannot be empty")
        operator.password_hash = hash_operator_password(password)

    if "rfid_uid_hash" in updates:
        rfid_uid_hash = updates["rfid_uid_hash"]
        if rfid_uid_hash:
            existing_rfid_operator = repository.get_operator_by_rfid(db, rfid_uid_hash)
            if existing_rfid_operator and existing_rfid_operator.operator_id != operator.operator_id:
                raise HTTPException(status_code=409, detail="Operator RFID already exists")
        operator.rfid_uid_hash = rfid_uid_hash

    if "full_name" in updates:
        operator.full_name = updates["full_name"]
    if "role" in updates:
        operator.role = updates["role"]
    if "is_active" in updates:
        operator.is_active = updates["is_active"]

    db.commit()
    db.refresh(operator)
    return operator


def update_workstation(
    db: Session,
    workstation_id: str,
    payload: WorkstationUpdate,
) -> Workstation:
    workstation = repository.get_workstation_by_id(db, workstation_id)
    if not workstation:
        raise HTTPException(status_code=404, detail="Workstation not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        workstation.name = updates["name"]
    if "area" in updates:
        workstation.area = updates["area"]
    if "station_type" in updates:
        workstation.station_type = updates["station_type"]
    if "is_active" in updates:
        workstation.is_active = updates["is_active"]

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


def _require_active_workstation(
    db: Session,
    workstation_id: str,
    *,
    operator_id: str | None,
    machine_id: str | None,
    failure_event_type: str,
    failure_payload: dict,
) -> Workstation:
    workstation = repository.get_workstation(db, workstation_id)
    if workstation and workstation.is_active:
        return workstation

    record_audit_event(
        db,
        event_type=failure_event_type,
        entity_type="WORKSTATION",
        entity_id=workstation_id,
        operator_id=operator_id,
        workstation_id=workstation_id,
        machine_id=machine_id,
        result="DENIED",
        message="Unknown or inactive workstation",
        payload=failure_payload,
    )
    db.commit()
    raise HTTPException(status_code=400, detail="Unknown or inactive workstation")


def _require_active_machine(
    db: Session,
    machine_id: str | None,
    *,
    operator_id: str | None,
    workstation_id: str,
    failure_event_type: str,
    failure_payload: dict,
) -> Machine | None:
    if not machine_id:
        return None

    machine = repository.get_machine(db, machine_id)
    if machine and machine.is_active:
        return machine

    record_audit_event(
        db,
        event_type=failure_event_type,
        entity_type="MACHINE",
        entity_id=machine_id,
        operator_id=operator_id,
        workstation_id=workstation_id,
        machine_id=machine_id,
        result="DENIED",
        message="Unknown or inactive machine",
        payload=failure_payload,
    )
    db.commit()
    raise HTTPException(status_code=400, detail="Unknown or inactive machine")


def _reuse_or_create_work_session(
    db: Session,
    *,
    operator: Operator,
    workstation_id: str,
    machine_id: str | None,
    rfid_uid_hash: str | None,
    audit_logger,
    created_event_type: str,
    reused_event_type: str,
    created_message: str,
    reused_message: str,
    payload: dict,
) -> WorkSession:
    session = repository.find_active_session(
        db,
        operator_id=operator.operator_id,
        workstation_id=workstation_id,
        machine_id=machine_id,
    )
    if session:
        if _session_timed_out(session):
            _mark_session_timed_out(db, session)
        else:
            audit_logger(
                db,
                event_type=reused_event_type,
                entity_type="WORK_SESSION",
                entity_id=session.work_session_id,
                work_session=session,
                result="ACTIVE",
                message=reused_message,
                payload=payload,
            )
            db.commit()
            db.refresh(session)
            return session

    session = WorkSession(
        work_session_id=f"WS-{uuid.uuid4().hex[:12]}",
        operator_id=operator.operator_id,
        workstation_id=workstation_id,
        machine_id=machine_id,
        rfid_uid_hash=rfid_uid_hash,
    )
    db.add(session)
    audit_logger(
        db,
        event_type=created_event_type,
        entity_type="WORK_SESSION",
        entity_id=session.work_session_id,
        work_session=session,
        result="ACTIVE",
        message=created_message,
        payload=payload,
    )
    db.commit()
    db.refresh(session)
    return session


def operator_login(db: Session, payload: OperatorLoginRequest, *, audit_logger) -> WorkSession:
    sanitized_payload = sanitize_operator_login_payload(payload)
    operator = repository.get_operator_by_login(db, payload.login)
    if not operator or not operator.is_active:
        record_audit_event(
            db,
            event_type="OPERATOR_LOGIN_FAILED",
            entity_type="WORKSTATION",
            entity_id=payload.workstation_id,
            workstation_id=payload.workstation_id,
            machine_id=payload.machine_id,
            result="DENIED",
            message="Unknown or inactive operator login",
            payload=sanitized_payload,
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Unknown or inactive operator login")

    if not verify_operator_password(payload.password, operator.password_hash):
        record_audit_event(
            db,
            event_type="OPERATOR_LOGIN_FAILED",
            entity_type="WORKSTATION",
            entity_id=payload.workstation_id,
            operator_id=operator.operator_id,
            workstation_id=payload.workstation_id,
            machine_id=payload.machine_id,
            result="DENIED",
            message="Invalid operator password",
            payload=sanitized_payload,
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid operator password")

    _require_active_workstation(
        db,
        payload.workstation_id,
        operator_id=operator.operator_id,
        machine_id=payload.machine_id,
        failure_event_type="OPERATOR_LOGIN_FAILED",
        failure_payload=sanitized_payload,
    )
    _require_active_machine(
        db,
        payload.machine_id,
        operator_id=operator.operator_id,
        workstation_id=payload.workstation_id,
        failure_event_type="OPERATOR_LOGIN_FAILED",
        failure_payload=sanitized_payload,
    )

    return _reuse_or_create_work_session(
        db,
        operator=operator,
        workstation_id=payload.workstation_id,
        machine_id=payload.machine_id,
        rfid_uid_hash=operator.rfid_uid_hash,
        audit_logger=audit_logger,
        created_event_type="OPERATOR_LOGIN",
        reused_event_type="OPERATOR_LOGIN_REUSED",
        created_message="Operator login started work session",
        reused_message="Operator login reused active work session",
        payload=sanitized_payload,
    )


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

    _require_active_workstation(
        db,
        payload.workstation_id,
        operator_id=operator.operator_id,
        machine_id=payload.machine_id,
        failure_event_type="RFID_LOGIN_FAILED",
        failure_payload=payload.model_dump(),
    )
    _require_active_machine(
        db,
        payload.machine_id,
        operator_id=operator.operator_id,
        workstation_id=payload.workstation_id,
        failure_event_type="RFID_LOGIN_FAILED",
        failure_payload=payload.model_dump(),
    )

    return _reuse_or_create_work_session(
        db,
        operator=operator,
        workstation_id=payload.workstation_id,
        machine_id=payload.machine_id,
        rfid_uid_hash=payload.rfid_uid_hash,
        audit_logger=audit_logger,
        created_event_type="RFID_LOGIN",
        reused_event_type="RFID_LOGIN_REUSED",
        created_message="RFID login started work session",
        reused_message="RFID login reused active work session",
        payload=payload.model_dump(),
    )


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
