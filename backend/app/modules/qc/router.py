from fastapi import APIRouter
from fastapi import Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.qc import service
from app.schemas import (
    QcChecklistCreate,
    QcChecklistRead,
    QcChecklistUpdate,
    QcProductConfigurationRead,
    QcRunCreate,
    QcRunRead,
    QcStepCreate,
    QcStepRead,
    QcStepUpdate,
    QcStepResultCreate,
    QcStepResultRead,
)

router = APIRouter(tags=["qc"])


@router.post("/qc-checklists", response_model=QcChecklistRead)
def create_checklist(payload: QcChecklistCreate, db: Session = Depends(get_db)):
    return service.create_checklist(db, payload)


@router.get("/qc-checklists", response_model=list[QcChecklistRead])
def list_checklists(
    device_type: str | None = None,
    variant_code: str | None = None,
    component_type: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_checklists(
        db,
        device_type=device_type,
        variant_code=variant_code,
        component_type=component_type,
    )


@router.patch("/qc-checklists/{checklist_code}", response_model=QcChecklistRead)
def update_checklist(
    checklist_code: str,
    payload: QcChecklistUpdate,
    db: Session = Depends(get_db),
):
    return service.update_checklist(db, checklist_code, payload)


@router.post("/qc-checklists/{checklist_code}/reference-image", response_model=QcChecklistRead)
def upload_checklist_reference_image(
    checklist_code: str,
    file: UploadFile = File(...),
    uploaded_by: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    return service.upload_checklist_reference_image(
        db,
        checklist_code,
        file,
        uploaded_by,
    )


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


@router.patch("/qc-checklists/{checklist_code}/steps/{step_id}", response_model=QcStepRead)
def update_checklist_step(
    checklist_code: str,
    step_id: str,
    payload: QcStepUpdate,
    db: Session = Depends(get_db),
):
    return service.update_checklist_step(db, checklist_code, step_id, payload)


@router.delete("/qc-checklists/{checklist_code}/steps/{step_id}", status_code=204)
def delete_checklist_step(
    checklist_code: str,
    step_id: str,
    db: Session = Depends(get_db),
):
    service.delete_checklist_step(db, checklist_code, step_id)
    return None


@router.get(
    "/qc-product-configurations/{device_type}",
    response_model=QcProductConfigurationRead,
)
def get_qc_product_configuration(
    device_type: str,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.get_qc_product_configuration(db, device_type, variant_code)


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
