from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import get_db
from app.modules.auth_rfid import repository, service
from app.schemas import (
    MachineCreate,
    MachineRead,
    OperatorLoginRequest,
    OperatorCreate,
    OperatorRead,
    RfidLoginRequest,
    WorkSessionCloseRequest,
    WorkSessionRead,
    WorkstationCreate,
    WorkstationRead,
)

router = APIRouter(tags=["auth-rfid"])


@router.post("/operators", response_model=OperatorRead)
def create_operator(payload: OperatorCreate, db: Session = Depends(get_db)):
    return service.create_operator(db, payload)


@router.get("/operators", response_model=list[OperatorRead])
def list_operators(db: Session = Depends(get_db)):
    return repository.list_operators(db)


@router.post("/auth/operator-login", response_model=WorkSessionRead)
def operator_login(payload: OperatorLoginRequest, db: Session = Depends(get_db)):
    return service.operator_login(db, payload, audit_logger=record_audit_event)


@router.post("/auth/rfid-login", response_model=WorkSessionRead)
def rfid_login(payload: RfidLoginRequest, db: Session = Depends(get_db)):
    return service.rfid_login(db, payload, audit_logger=record_audit_event)


@router.get("/work-sessions", response_model=list[WorkSessionRead])
def list_work_sessions(db: Session = Depends(get_db)):
    return repository.list_work_sessions(db)


@router.post("/work-sessions/{work_session_id}/close", response_model=WorkSessionRead)
def close_work_session(
    work_session_id: str,
    payload: WorkSessionCloseRequest | None = None,
    db: Session = Depends(get_db),
):
    return service.close_work_session(db, work_session_id, payload, audit_logger=record_audit_event)


@router.post("/workstations", response_model=WorkstationRead)
def create_workstation(payload: WorkstationCreate, db: Session = Depends(get_db)):
    return service.create_workstation(db, payload)


@router.get("/workstations", response_model=list[WorkstationRead])
def list_workstations(db: Session = Depends(get_db)):
    return repository.list_workstations(db)


@router.post("/machines", response_model=MachineRead)
def create_machine(payload: MachineCreate, db: Session = Depends(get_db)):
    return service.create_machine(db, payload)


@router.get("/machines", response_model=list[MachineRead])
def list_machines(db: Session = Depends(get_db)):
    return repository.list_machines(db)
