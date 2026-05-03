from fastapi import APIRouter
from fastapi import Depends, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.qc import repository, service
from app.schemas import (
    QcChecklistCreate,
    QcChecklistRead,
    QcRunCreate,
    QcRunRead,
    QcStepCreate,
    QcStepRead,
    QcStepResultCreate,
    QcStepResultRead,
)

router = APIRouter(tags=["qc"])


@router.post("/qc-checklists", response_model=QcChecklistRead)
def create_checklist(payload: QcChecklistCreate, db: Session = Depends(get_db)):
    return service.create_checklist(db, payload)


@router.get("/qc-checklists", response_model=list[QcChecklistRead])
def list_checklists(db: Session = Depends(get_db)):
    return repository.list_checklists(db)


@router.get("/qc-checklists/{checklist_code}/steps", response_model=list[QcStepRead])
def list_checklist_steps(
    checklist_code: str,
    db: Session = Depends(get_db),
):
    return service.list_checklist_steps(db, checklist_code)


@router.post("/qc-checklists/{checklist_code}/steps", response_model=QcStepRead)
def add_checklist_step(
    checklist_code: str,
    payload: QcStepCreate,
    db: Session = Depends(get_db),
):
    return service.add_checklist_step(db, checklist_code, payload)


@router.post("/qc-runs", response_model=QcRunRead)
def create_qc_run(payload: QcRunCreate, db: Session = Depends(get_db)):
    return service.create_qc_run(db, payload)


@router.get("/qc-runs/{run_id}", response_model=QcRunRead)
def get_qc_run(run_id: str, db: Session = Depends(get_db)):
    return service.get_qc_run_or_404(db, run_id)


@router.post("/qc-runs/{run_id}/steps/{step_id}/result", response_model=QcStepResultRead)
def add_qc_step_result(
    run_id: str,
    step_id: str,
    payload: QcStepResultCreate,
    db: Session = Depends(get_db),
):
    return service.add_qc_step_result(db, run_id, step_id, payload)


@router.post("/qc-runs/{run_id}/complete", response_model=QcRunRead)
def complete_qc_run(
    run_id: str,
    result: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    return service.complete_qc_run(db, run_id, result)
