from sqlalchemy.orm import Session

from app.models import QcChecklist, QcRun, QcStep, QcStepResult


def get_checklist_by_code(db: Session, checklist_code: str) -> QcChecklist | None:
    return db.query(QcChecklist).filter(QcChecklist.checklist_code == checklist_code).first()


def list_checklists(db: Session) -> list[QcChecklist]:
    return db.query(QcChecklist).order_by(QcChecklist.created_at.desc()).all()


def get_qc_run(db: Session, run_id: str) -> QcRun | None:
    return db.query(QcRun).filter(QcRun.run_id == run_id).first()


def get_qc_step(db: Session, step_id: str) -> QcStep | None:
    return db.query(QcStep).filter(QcStep.id == step_id).first()


def list_step_results_for_run(db: Session, qc_run_id: str) -> list[QcStepResult]:
    return (
        db.query(QcStepResult)
        .filter(QcStepResult.qc_run_id == qc_run_id)
        .order_by(QcStepResult.created_at.asc())
        .all()
    )
