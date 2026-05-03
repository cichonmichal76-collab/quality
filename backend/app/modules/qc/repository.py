from sqlalchemy.orm import Session

from app.models import QcChecklist, QcRun, QcStep, QcStepResult


def get_checklist_by_code(db: Session, checklist_code: str) -> QcChecklist | None:
    return db.query(QcChecklist).filter(QcChecklist.checklist_code == checklist_code).first()


def list_checklists(
    db: Session,
    *,
    device_type: str | None = None,
    variant_code: str | None = None,
    component_type: str | None = None,
) -> list[QcChecklist]:
    query = db.query(QcChecklist)
    if device_type is not None:
        query = query.filter(QcChecklist.device_type == device_type)
    if variant_code is not None:
        query = query.filter(QcChecklist.variant_code == variant_code)
    if component_type is not None:
        query = query.filter(QcChecklist.component_type == component_type)
    return query.order_by(QcChecklist.created_at.desc()).all()


def get_component_qc_checklist(
    db: Session,
    *,
    device_type: str,
    variant_code: str,
    component_type: str,
) -> QcChecklist | None:
    return (
        db.query(QcChecklist)
        .filter(
            QcChecklist.device_type == device_type,
            QcChecklist.variant_code == variant_code,
            QcChecklist.component_type == component_type,
        )
        .order_by(QcChecklist.created_at.desc())
        .first()
    )


def list_checklist_steps(db: Session, checklist_id: str) -> list[QcStep]:
    return (
        db.query(QcStep)
        .filter(QcStep.checklist_id == checklist_id)
        .order_by(QcStep.step_order.asc(), QcStep.id.asc())
        .all()
    )


def get_qc_run(db: Session, run_id: str) -> QcRun | None:
    return db.query(QcRun).filter(QcRun.run_id == run_id).first()


def get_qc_step(db: Session, step_id: str) -> QcStep | None:
    return db.query(QcStep).filter(QcStep.id == step_id).first()


def count_checklist_steps(db: Session, checklist_id: str) -> int:
    return db.query(QcStep).filter(QcStep.checklist_id == checklist_id).count()


def list_step_results_for_run(db: Session, qc_run_id: str) -> list[QcStepResult]:
    return (
        db.query(QcStepResult)
        .filter(QcStepResult.qc_run_id == qc_run_id)
        .order_by(QcStepResult.created_at.asc())
        .all()
    )
