from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import (
    AssemblyLink,
    Device,
    Nonconformity,
    ProductionItem,
    QcChecklist,
    QcRun,
    QcStep,
    QcStepResult,
)
from app.modules.auth_rfid.service import QUALITY_SESSION_ROLES, require_active_work_session
from app.modules.qc import repository
from app.schemas import (
    QcChecklistCreate,
    QcRunCreate,
    QcStepCreate,
    QcStepResultCreate,
)


def create_checklist(db: Session, payload: QcChecklistCreate) -> QcChecklist:
    if repository.get_checklist_by_code(db, payload.checklist_code):
        raise HTTPException(status_code=409, detail="Checklist already exists")
    checklist = QcChecklist(**payload.model_dump())
    db.add(checklist)
    db.commit()
    db.refresh(checklist)
    return checklist


def add_checklist_step(db: Session, checklist_code: str, payload: QcStepCreate) -> QcStep:
    checklist = repository.get_checklist_by_code(db, checklist_code)
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    step = QcStep(checklist_id=checklist.id, **payload.model_dump())
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


def create_qc_run(db: Session, payload: QcRunCreate) -> QcRun:
    if repository.get_qc_run(db, payload.run_id):
        raise HTTPException(status_code=409, detail="QC run already exists")

    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.operator_id,
        allowed_roles=QUALITY_SESSION_ROLES,
    )
    target_serial_number = payload.device_serial_number or payload.item_serial_number
    if not target_serial_number:
        raise HTTPException(status_code=400, detail="QC run requires device or item serial number")

    item = None
    if payload.item_serial_number:
        item = db.query(ProductionItem).filter(
            ProductionItem.item_serial_number == payload.item_serial_number
        ).first()
        if not item:
            raise HTTPException(status_code=404, detail="Production item not found")
        if payload.barcode_value and item.barcode_value != payload.barcode_value:
            raise HTTPException(status_code=400, detail="Barcode does not match production item")

    run = QcRun(
        run_id=payload.run_id,
        device_serial_number=target_serial_number,
        item_serial_number=payload.item_serial_number,
        barcode_value=payload.barcode_value or (item.barcode_value if item else None),
        checklist_id=payload.checklist_id,
        process_stage=payload.process_stage,
        operator_id=payload.operator_id or work_session.operator_id,
        started_at=utc_now(),
        status="IN_PROGRESS",
    )
    db.add(run)
    if item:
        item.current_status = "QC_IN_PROGRESS"
    record_audit_event(
        db,
        event_type="QC_RUN_STARTED",
        entity_type="QC_RUN",
        entity_id=payload.run_id,
        work_session=work_session,
        operator_id=run.operator_id,
        result=run.status,
        message=f"QC run started for {target_serial_number}",
        payload=payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(run)
    return run


def get_qc_run_or_404(db: Session, run_id: str) -> QcRun:
    run = repository.get_qc_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="QC run not found")
    return run


def add_qc_step_result(
    db: Session,
    run_id: str,
    step_id: str,
    payload: QcStepResultCreate,
) -> QcStepResult:
    run = get_qc_run_or_404(db, run_id)
    step = repository.get_qc_step(db, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="QC step not found")

    computed_status = _compute_step_status(step, payload)
    result = QcStepResult(
        qc_run_id=run.id,
        step_id=step_id,
        status=computed_status,
        measurement_value=payload.measurement_value,
        comment=payload.comment,
        mcu_snapshot=payload.mcu_snapshot,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def complete_qc_run(db: Session, run_id: str, result: str | None) -> QcRun:
    run = get_qc_run_or_404(db, run_id)
    final_result = _normalize_run_result(result) or _derive_run_result(db, run)
    completed_at = utc_now()
    run.result = final_result
    run.status = "COMPLETED"
    run.ended_at = completed_at

    if run.item_serial_number:
        item = db.query(ProductionItem).filter(
            ProductionItem.item_serial_number == run.item_serial_number
        ).first()
        if item:
            item.current_status = "QC_PASSED" if final_result == "PASS" else "QC_FAILED"

        installed_links = db.query(AssemblyLink).filter(
            AssemblyLink.child_item_serial_number == run.item_serial_number,
            AssemblyLink.status == "INSTALLED",
        ).all()
        if installed_links:
            parent_serial_numbers = set()
            component_qc_passed = final_result == "PASS"
            for link in installed_links:
                link.component_qc_passed = component_qc_passed
                parent_serial_numbers.add(link.parent_device_serial_number)

            if parent_serial_numbers:
                parent_devices = db.query(Device).filter(
                    Device.device_serial_number.in_(parent_serial_numbers)
                ).all()
                for device in parent_devices:
                    device.updated_at = completed_at

    if final_result == "FAIL":
        ncr_id = f"NCR-QC-{run.run_id}"
        if not db.query(Nonconformity).filter(Nonconformity.ncr_id == ncr_id).first():
            db.add(
                Nonconformity(
                    ncr_id=ncr_id,
                    component_serial_number=run.item_serial_number,
                    process_stage=run.process_stage,
                    description="QC failed",
                    severity="CRITICAL",
                    status="OPEN",
                    detected_by=run.operator_id,
                )
            )

    record_audit_event(
        db,
        event_type="QC_RUN_COMPLETED",
        entity_type="QC_RUN",
        entity_id=run_id,
        operator_id=run.operator_id,
        result=final_result,
        message=f"QC run completed with {final_result}",
        payload={"result": final_result},
    )
    db.commit()
    db.refresh(run)
    return run


def _compute_step_status(step: QcStep, payload: QcStepResultCreate) -> str:
    if step.requires_measurement and payload.measurement_value is not None:
        if step.tolerance_min is not None and payload.measurement_value < float(step.tolerance_min):
            return "FAIL"
        if step.tolerance_max is not None and payload.measurement_value > float(step.tolerance_max):
            return "FAIL"
        return "PASS"
    normalized = _normalize_run_result(payload.status)
    return normalized or payload.status


def _derive_run_result(db: Session, run: QcRun) -> str:
    results = repository.list_step_results_for_run(db, run.id)
    if any(result.status in {"FAIL", "NOK"} for result in results):
        return "FAIL"
    return "PASS"


def _normalize_run_result(result: str | None) -> str | None:
    if result is None:
        return None
    normalized = result.upper()
    mapping = {"OK": "PASS", "NOK": "FAIL"}
    return mapping.get(normalized, normalized)
