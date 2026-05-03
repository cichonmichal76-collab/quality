from fastapi import HTTPException, UploadFile
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
from app.modules.assembly import service as assembly_service
from app.modules.auth_rfid.service import QUALITY_SESSION_ROLES, require_active_work_session
from app.modules.files import service as files_service
from app.modules.qc import repository
from app.schemas import (
    FileRead,
    QcItemReservationRequest,
    QcChecklistCreate,
    QcChecklistUpdate,
    QcProductComponentConfigRead,
    QcProductConfigurationRead,
    QcReworkReleaseRequest,
    QcRunCreate,
    QcRunDetailsRead,
    QcRunStepResultDetailRead,
    QcStepCreate,
    QcStepUpdate,
    QcStepResultCreate,
)


ALLOWED_EVALUATION_MODES = {"MANUAL", "NUMERIC_RANGE", "TEXT_MATCH"}
QC_WAITING_ITEM_STATUSES = {"PRODUCED", "REWORK_REQUIRED"}
QC_RESERVABLE_ITEM_STATUSES = QC_WAITING_ITEM_STATUSES | {"QC_IN_PROGRESS", "QC_FAILED", "BLOCKED"}
QC_FAILURE_DISPOSITIONS = {
    "OPEN_CRITICAL_NCR",
    "REWORK_REQUIRED",
    "BLOCKED",
}


def create_checklist(db: Session, payload: QcChecklistCreate) -> QcChecklist:
    if repository.get_checklist_by_code(db, payload.checklist_code):
        raise HTTPException(status_code=409, detail="Checklist already exists")

    if payload.device_type and payload.component_type:
        existing_component_checklist = repository.get_component_qc_checklist(
            db,
            device_type=payload.device_type,
            variant_code=payload.variant_code or "DEFAULT",
            component_type=payload.component_type,
        )
        if existing_component_checklist:
            raise HTTPException(
                status_code=409,
                detail="QC configuration already exists for this BOM component",
            )

    checklist = QcChecklist(**payload.model_dump())
    db.add(checklist)
    db.commit()
    db.refresh(checklist)
    return checklist


def update_checklist(
    db: Session,
    checklist_code: str,
    payload: QcChecklistUpdate,
) -> QcChecklist:
    checklist = repository.get_checklist_by_code(db, checklist_code)
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return checklist

    merged_device_type = changes.get("device_type", checklist.device_type)
    merged_variant_code = changes.get("variant_code", checklist.variant_code) or "DEFAULT"
    merged_component_type = changes.get("component_type", checklist.component_type)
    if merged_device_type and merged_component_type:
        existing_component_checklist = repository.get_component_qc_checklist(
            db,
            device_type=merged_device_type,
            variant_code=merged_variant_code,
            component_type=merged_component_type,
        )
        if (
            existing_component_checklist
            and existing_component_checklist.checklist_code != checklist.checklist_code
        ):
            raise HTTPException(
                status_code=409,
                detail="QC configuration already exists for this BOM component",
            )

    for field_name, value in changes.items():
        setattr(checklist, field_name, value)

    db.commit()
    db.refresh(checklist)
    return checklist


def add_checklist_step(db: Session, checklist_code: str, payload: QcStepCreate) -> QcStep:
    checklist = repository.get_checklist_by_code(db, checklist_code)
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    step = QcStep(
        checklist_id=checklist.id,
        **_normalize_step_payload(payload.model_dump(exclude_unset=True)),
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


def update_checklist_step(
    db: Session,
    checklist_code: str,
    step_id: str,
    payload: QcStepUpdate,
) -> QcStep:
    checklist = repository.get_checklist_by_code(db, checklist_code)
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    step = repository.get_qc_step(db, step_id)
    if not step or step.checklist_id != checklist.id:
        raise HTTPException(status_code=404, detail="QC step not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return step

    normalized_changes = _normalize_step_payload(changes, existing_step=step)
    for field_name, value in normalized_changes.items():
        setattr(step, field_name, value)

    db.commit()
    db.refresh(step)
    return step


def delete_checklist_step(db: Session, checklist_code: str, step_id: str) -> None:
    checklist = repository.get_checklist_by_code(db, checklist_code)
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    step = repository.get_qc_step(db, step_id)
    if not step or step.checklist_id != checklist.id:
        raise HTTPException(status_code=404, detail="QC step not found")
    db.delete(step)
    db.commit()


def list_checklist_steps(db: Session, checklist_code: str) -> list[QcStep]:
    checklist = repository.get_checklist_by_code(db, checklist_code)
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return repository.list_checklist_steps(db, checklist.id)


def list_checklists(
    db: Session,
    *,
    device_type: str | None = None,
    variant_code: str | None = None,
    component_type: str | None = None,
) -> list[QcChecklist]:
    return repository.list_checklists(
        db,
        device_type=device_type,
        variant_code=variant_code,
        component_type=component_type,
    )


def list_waiting_items(
    db: Session,
    *,
    component_type: str | None = None,
    limit: int = 25,
) -> list[ProductionItem]:
    normalized_limit = max(1, min(limit, 100))
    items = repository.list_waiting_production_items(
        db,
        component_type=component_type,
        statuses=QC_WAITING_ITEM_STATUSES,
        limit=normalized_limit,
    )
    if not items:
        return []

    checklists = repository.list_active_queue_checklists(
        db,
        component_type=component_type,
    )
    specific_checklists_by_component: dict[str, list[QcChecklist]] = {}
    generic_checklists: list[QcChecklist] = []

    for checklist in checklists:
        if checklist.component_type:
            specific_checklists_by_component.setdefault(
                checklist.component_type,
                [],
            ).append(checklist)
            continue
        generic_checklists.append(checklist)

    waiting_items: list[ProductionItem] = []
    generic_qc_enabled = any(not checklist.skip_component_qc for checklist in generic_checklists)

    for item in items:
        matching_specific_checklists = specific_checklists_by_component.get(item.item_type, [])
        if matching_specific_checklists:
            if any(not checklist.skip_component_qc for checklist in matching_specific_checklists):
                waiting_items.append(item)
            continue
        if generic_qc_enabled:
            waiting_items.append(item)

    return waiting_items


def list_open_critical_ncrs_for_item(
    db: Session,
    item_serial_number: str,
) -> list[Nonconformity]:
    get_production_item_or_404(db, item_serial_number)
    return (
        db.query(Nonconformity)
        .filter(
            Nonconformity.component_serial_number == item_serial_number,
            Nonconformity.severity == "CRITICAL",
            Nonconformity.status != "CLOSED",
        )
        .order_by(Nonconformity.detected_at.desc())
        .all()
    )


def list_closed_critical_ncrs_for_item(
    db: Session,
    item_serial_number: str,
    *,
    limit: int = 10,
) -> list[Nonconformity]:
    get_production_item_or_404(db, item_serial_number)
    normalized_limit = max(1, min(limit, 50))
    return repository.list_closed_critical_ncrs_for_item(
        db,
        item_serial_number,
        limit=normalized_limit,
    )


def list_qc_runs_for_item(
    db: Session,
    item_serial_number: str,
    *,
    limit: int = 10,
) -> list[QcRun]:
    get_production_item_or_404(db, item_serial_number)
    normalized_limit = max(1, min(limit, 50))
    return repository.list_qc_runs_for_item(
        db,
        item_serial_number,
        limit=normalized_limit,
    )


def get_qc_product_configuration(
    db: Session,
    device_type: str,
    variant_code: str = "DEFAULT",
) -> QcProductConfigurationRead:
    bom_items = assembly_service.list_device_bom_items(
        db,
        device_type,
        version=None,
        variant_code=variant_code,
    )

    entries: list[QcProductComponentConfigRead] = []
    for bom_item in bom_items:
        checklist = repository.get_component_qc_checklist(
            db,
            device_type=device_type,
            variant_code=variant_code,
            component_type=bom_item.component_type,
        )
        configured_step_count = (
            repository.count_checklist_steps(db, checklist.id) if checklist else 0
        )
        entries.append(
            QcProductComponentConfigRead(
                component_type=bom_item.component_type,
                substitution_group=bom_item.substitution_group,
                required_part_number=bom_item.required_part_number,
                required_revision=bom_item.required_revision,
                required_drawing_number=bom_item.required_drawing_number,
                required_drawing_revision=bom_item.required_drawing_revision,
                quantity_required=bom_item.quantity_required,
                is_required=bom_item.is_required,
                checklist_code=checklist.checklist_code if checklist else None,
                checklist_name=checklist.name if checklist else None,
                checklist_version=checklist.version if checklist else None,
                checklist_is_active=checklist.is_active if checklist else False,
                skip_component_qc=checklist.skip_component_qc if checklist else False,
                reference_image_file_id=checklist.reference_image_file_id if checklist else None,
                configured_step_count=configured_step_count,
            )
        )

    return QcProductConfigurationRead(
        device_type=device_type,
        variant_code=variant_code,
        items=entries,
    )


def upload_checklist_reference_image(
    db: Session,
    checklist_code: str,
    file: UploadFile,
    uploaded_by: str | None = None,
) -> QcChecklist:
    checklist = repository.get_checklist_by_code(db, checklist_code)
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")

    stored = files_service.upload_file(
        db,
        file=file,
        related_entity_type="QC_CHECKLIST",
        related_entity_id=checklist.id,
        uploaded_by=uploaded_by,
    )
    checklist.reference_image_file_id = stored.id
    db.commit()
    db.refresh(checklist)
    return checklist


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


def get_qc_run_details(db: Session, run_id: str) -> QcRunDetailsRead:
    run = get_qc_run_or_404(db, run_id)
    checklist = _get_checklist_for_run(db, run)
    detailed_step_results = _build_qc_run_step_details(db, run)
    completed_payload = _get_completed_qc_run_payload(db, run.run_id)

    return QcRunDetailsRead(
        id=run.id,
        run_id=run.run_id,
        device_serial_number=run.device_serial_number,
        item_serial_number=run.item_serial_number,
        barcode_value=run.barcode_value,
        checklist_id=run.checklist_id,
        process_stage=run.process_stage,
        operator_id=run.operator_id,
        status=run.status,
        result=run.result,
        started_at=run.started_at,
        ended_at=run.ended_at,
        checklist_code=checklist.checklist_code if checklist else None,
        checklist_name=checklist.name if checklist else None,
        failure_reason=_as_optional_payload_text(completed_payload.get("failure_reason")),
        failure_comment=_as_optional_payload_text(completed_payload.get("failure_comment")),
        failure_disposition=_as_optional_payload_text(
            completed_payload.get("failure_disposition")
        ),
        step_results=detailed_step_results,
        evidence_files=_build_qc_run_evidence_files(db, run.run_id),
    )


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
        observed_value=payload.observed_value,
        comment=payload.comment,
        mcu_snapshot=payload.mcu_snapshot,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def complete_qc_run(
    db: Session,
    run_id: str,
    result: str | None,
    *,
    failure_reason: str | None = None,
    failure_comment: str | None = None,
    failure_disposition: str | None = None,
) -> QcRun:
    run = get_qc_run_or_404(db, run_id)
    final_result = _normalize_run_result(result) or _derive_run_result(db, run)
    completed_at = utc_now()
    normalized_failure_reason = _normalize_optional_text(failure_reason)
    normalized_failure_comment = _normalize_optional_text(failure_comment)
    normalized_failure_disposition = _normalize_failure_disposition(failure_disposition)
    run.result = final_result
    run.status = "COMPLETED"
    run.ended_at = completed_at

    if run.item_serial_number:
        item = db.query(ProductionItem).filter(
            ProductionItem.item_serial_number == run.item_serial_number
        ).first()
        if item:
            item.current_status = resolve_failed_item_status(normalized_failure_disposition)
            if final_result == "PASS":
                item.current_status = "QC_PASSED"
            _clear_item_qc_reservation(item)

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

    if final_result == "FAIL" and normalized_failure_disposition == "OPEN_CRITICAL_NCR":
        ncr_id = f"NCR-QC-{run.run_id}"
        if not db.query(Nonconformity).filter(Nonconformity.ncr_id == ncr_id).first():
            failure_description = build_qc_failure_description(
                normalized_failure_reason,
                normalized_failure_comment,
            )
            db.add(
                Nonconformity(
                    ncr_id=ncr_id,
                    component_serial_number=run.item_serial_number,
                    process_stage=run.process_stage,
                    description=failure_description,
                    severity="CRITICAL",
                    status="OPEN",
                    detected_by=run.operator_id,
                )
            )

    audit_payload = {"result": final_result}
    if final_result == "FAIL":
        audit_payload["failure_disposition"] = normalized_failure_disposition
        if normalized_failure_reason:
            audit_payload["failure_reason"] = normalized_failure_reason
        if normalized_failure_comment:
            audit_payload["failure_comment"] = normalized_failure_comment

    record_audit_event(
        db,
        event_type="QC_RUN_COMPLETED",
        entity_type="QC_RUN",
        entity_id=run_id,
        operator_id=run.operator_id,
        result=final_result,
        message=f"QC run completed with {final_result}",
        payload=audit_payload,
    )
    db.commit()
    db.refresh(run)
    return run


def release_item_for_rework(
    db: Session,
    item_serial_number: str,
    payload: QcReworkReleaseRequest,
) -> ProductionItem:
    item = get_production_item_or_404(db, item_serial_number)
    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.operator_id,
        allowed_roles=QUALITY_SESSION_ROLES,
    )
    corrective_action = _normalize_optional_text(payload.corrective_action)
    if not corrective_action:
        raise HTTPException(status_code=400, detail="Corrective action is required")

    open_critical_ncrs = list_open_critical_ncrs_for_item(db, item_serial_number)
    if item.current_status not in {"QC_FAILED", "BLOCKED", "REWORK_REQUIRED"} and not open_critical_ncrs:
        raise HTTPException(
            status_code=400,
            detail="Production item is not awaiting NCR or rework handling",
        )

    previous_status = item.current_status
    closed_ncr_ids: list[str] = []
    closed_at = utc_now()

    for ncr in open_critical_ncrs:
        ncr.status = "CLOSED"
        ncr.corrective_action = corrective_action
        if ncr.closed_at is None:
            ncr.closed_at = closed_at
        closed_ncr_ids.append(ncr.ncr_id)

    item.current_status = "REWORK_REQUIRED"
    _clear_item_qc_reservation(item)

    installed_links = db.query(AssemblyLink).filter(
        AssemblyLink.child_item_serial_number == item_serial_number,
        AssemblyLink.status == "INSTALLED",
    ).all()
    if installed_links:
        parent_serial_numbers = {
            link.parent_device_serial_number for link in installed_links
        }
        parent_devices = db.query(Device).filter(
            Device.device_serial_number.in_(parent_serial_numbers)
        ).all()
        for device in parent_devices:
            device.updated_at = closed_at

    record_audit_event(
        db,
        event_type="QC_ITEM_RELEASED_FOR_REWORK",
        entity_type="PRODUCTION_ITEM",
        entity_id=item_serial_number,
        work_session=work_session,
        operator_id=payload.operator_id or work_session.operator_id,
        result=item.current_status,
        message=f"Production item {item_serial_number} released for rework",
        payload={
            "previous_status": previous_status,
            "current_status": item.current_status,
            "closed_ncr_ids": closed_ncr_ids,
            "corrective_action": corrective_action,
        },
    )
    db.commit()
    db.refresh(item)
    return item


def _compute_step_status(step: QcStep, payload: QcStepResultCreate) -> str:
    if step.evaluation_mode == "NUMERIC_RANGE" or step.requires_measurement:
        if payload.measurement_value is None:
            raise HTTPException(status_code=400, detail="Measurement value is required for this step")
        if step.tolerance_min is not None and payload.measurement_value < float(step.tolerance_min):
            return "FAIL"
        if step.tolerance_max is not None and payload.measurement_value > float(step.tolerance_max):
            return "FAIL"
        return "PASS"
    if step.evaluation_mode == "TEXT_MATCH":
        if payload.observed_value is None or not payload.observed_value.strip():
            raise HTTPException(status_code=400, detail="Observed value is required for this step")
        if step.expected_value is None or not step.expected_value.strip():
            raise HTTPException(status_code=400, detail="QC step does not define expected value")
        return (
            "PASS"
            if payload.observed_value.strip().casefold()
            == step.expected_value.strip().casefold()
            else "FAIL"
        )
    normalized = _normalize_run_result(payload.status)
    return normalized or payload.status


def _get_checklist_for_run(db: Session, run: QcRun) -> QcChecklist | None:
    if not run.checklist_id:
        return None
    return db.query(QcChecklist).filter(QcChecklist.id == run.checklist_id).first()


def _build_qc_run_step_details(
    db: Session,
    run: QcRun,
) -> list[QcRunStepResultDetailRead]:
    step_results = repository.list_step_results_for_run(db, run.id)
    checklist_steps = (
        repository.list_checklist_steps(db, run.checklist_id) if run.checklist_id else []
    )
    steps_by_id = {step.id: step for step in checklist_steps}

    detailed_step_results = [
        _build_qc_step_result_detail(result, steps_by_id.get(result.step_id))
        for result in step_results
    ]
    detailed_step_results.sort(key=lambda row: (row.step_order, row.created_at, row.id))
    return detailed_step_results


def _build_qc_step_result_detail(
    result: QcStepResult,
    step: QcStep | None,
) -> QcRunStepResultDetailRead:
    return QcRunStepResultDetailRead(
        id=result.id,
        qc_run_id=result.qc_run_id,
        step_id=result.step_id,
        step_order=step.step_order if step is not None else 0,
        step_title=step.title if step is not None else result.step_id,
        evaluation_mode=step.evaluation_mode if step is not None else "MANUAL",
        result_input_label=step.result_input_label if step is not None else None,
        control_area=step.control_area if step is not None else None,
        expected_value=step.expected_value if step is not None else None,
        tolerance_min=float(step.tolerance_min)
        if step is not None and step.tolerance_min is not None
        else None,
        tolerance_max=float(step.tolerance_max)
        if step is not None and step.tolerance_max is not None
        else None,
        unit=step.unit if step is not None else None,
        status=result.status,
        measurement_value=float(result.measurement_value)
        if result.measurement_value is not None
        else None,
        observed_value=result.observed_value,
        comment=result.comment,
        mcu_snapshot=result.mcu_snapshot,
        created_at=result.created_at,
    )


def _get_completed_qc_run_payload(db: Session, run_id: str) -> dict[str, object]:
    completed_audit_event = repository.get_latest_run_completed_audit_event(db, run_id)
    completed_payload = completed_audit_event.payload if completed_audit_event else {}
    if isinstance(completed_payload, dict):
        return completed_payload
    return {}


def _build_qc_run_evidence_files(db: Session, run_id: str) -> list[FileRead]:
    return [
        FileRead.model_validate(file)
        for file in repository.list_run_evidence_files(db, run_id)
    ]


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


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _as_optional_payload_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return _normalize_optional_text(value)


def _normalize_failure_disposition(value: str | None) -> str:
    if value is None:
        return "OPEN_CRITICAL_NCR"
    normalized = value.strip().upper()
    if not normalized:
        return "OPEN_CRITICAL_NCR"
    if normalized not in QC_FAILURE_DISPOSITIONS:
        raise HTTPException(status_code=400, detail="Unsupported QC failure disposition")
    return normalized


def resolve_failed_item_status(failure_disposition: str) -> str:
    if failure_disposition == "REWORK_REQUIRED":
        return "REWORK_REQUIRED"
    if failure_disposition == "BLOCKED":
        return "BLOCKED"
    return "QC_FAILED"


def build_qc_failure_description(
    failure_reason: str | None,
    failure_comment: str | None,
) -> str:
    if failure_reason and failure_comment:
        return f"QC failed: {failure_reason}. {failure_comment}"
    if failure_reason:
        return f"QC failed: {failure_reason}"
    if failure_comment:
        return f"QC failed: {failure_comment}"
    return "QC failed"


def get_production_item_or_404(
    db: Session,
    item_serial_number: str,
) -> ProductionItem:
    item = repository.get_production_item_by_serial(db, item_serial_number)
    if not item:
        raise HTTPException(status_code=404, detail="Production item not found")
    return item


def reserve_item_for_qc(
    db: Session,
    item_serial_number: str,
    payload: QcItemReservationRequest,
) -> ProductionItem:
    item = get_production_item_or_404(db, item_serial_number)
    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.operator_id,
        allowed_roles=QUALITY_SESSION_ROLES,
    )
    operator_id = payload.operator_id or work_session.operator_id

    if item.current_status not in QC_RESERVABLE_ITEM_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Production item is not available for QC reservation",
        )

    if item.qc_reserved_by_operator_id and item.qc_reserved_by_operator_id != operator_id:
        raise HTTPException(
            status_code=409,
            detail="Production item is already reserved by another QC operator",
        )

    previous_operator_id = item.qc_reserved_by_operator_id
    previous_workstation_id = item.qc_reserved_by_workstation_id
    previous_reserved_at = item.qc_reserved_at.isoformat() if item.qc_reserved_at else None

    item.qc_reserved_by_operator_id = operator_id
    item.qc_reserved_by_workstation_id = work_session.workstation_id
    item.qc_reserved_at = utc_now()

    record_audit_event(
        db,
        event_type="QC_ITEM_RESERVED",
        entity_type="PRODUCTION_ITEM",
        entity_id=item_serial_number,
        work_session=work_session,
        operator_id=operator_id,
        result=item.current_status,
        message=f"Production item {item_serial_number} reserved for QC",
        payload={
            "previous_reserved_by_operator_id": previous_operator_id,
            "previous_reserved_by_workstation_id": previous_workstation_id,
            "previous_reserved_at": previous_reserved_at,
            "current_reserved_by_operator_id": item.qc_reserved_by_operator_id,
            "current_reserved_by_workstation_id": item.qc_reserved_by_workstation_id,
            "current_reserved_at": item.qc_reserved_at.isoformat(),
        },
    )
    db.commit()
    db.refresh(item)
    return item


def release_item_reservation(
    db: Session,
    item_serial_number: str,
    payload: QcItemReservationRequest,
) -> ProductionItem:
    item = get_production_item_or_404(db, item_serial_number)
    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.operator_id,
        allowed_roles=QUALITY_SESSION_ROLES,
    )
    operator_id = payload.operator_id or work_session.operator_id

    if item.qc_reserved_by_operator_id and item.qc_reserved_by_operator_id != operator_id:
        raise HTTPException(
            status_code=409,
            detail="Production item reservation belongs to another QC operator",
        )

    previous_operator_id = item.qc_reserved_by_operator_id
    previous_workstation_id = item.qc_reserved_by_workstation_id
    previous_reserved_at = item.qc_reserved_at.isoformat() if item.qc_reserved_at else None

    item.qc_reserved_by_operator_id = None
    item.qc_reserved_by_workstation_id = None
    item.qc_reserved_at = None

    record_audit_event(
        db,
        event_type="QC_ITEM_RESERVATION_RELEASED",
        entity_type="PRODUCTION_ITEM",
        entity_id=item_serial_number,
        work_session=work_session,
        operator_id=operator_id,
        result=item.current_status,
        message=f"Production item {item_serial_number} reservation released",
        payload={
            "previous_reserved_by_operator_id": previous_operator_id,
            "previous_reserved_by_workstation_id": previous_workstation_id,
            "previous_reserved_at": previous_reserved_at,
        },
    )
    db.commit()
    db.refresh(item)
    return item


def _clear_item_qc_reservation(item: ProductionItem) -> None:
    item.qc_reserved_by_operator_id = None
    item.qc_reserved_by_workstation_id = None
    item.qc_reserved_at = None


def _normalize_step_payload(
    payload: dict,
    *,
    existing_step: QcStep | None = None,
) -> dict:
    normalized_payload = dict(payload)
    raw_evaluation_mode = normalized_payload.get("evaluation_mode")
    if raw_evaluation_mode is None:
        if normalized_payload.get("requires_measurement") is True:
            evaluation_mode = "NUMERIC_RANGE"
        else:
            evaluation_mode = existing_step.evaluation_mode if existing_step else "MANUAL"
    else:
        evaluation_mode = str(raw_evaluation_mode).upper()
    if evaluation_mode not in ALLOWED_EVALUATION_MODES:
        raise HTTPException(status_code=400, detail="Unsupported QC evaluation mode")

    normalized_payload["evaluation_mode"] = evaluation_mode
    normalized_payload["requires_measurement"] = evaluation_mode == "NUMERIC_RANGE"
    if evaluation_mode == "MANUAL":
        normalized_payload["tolerance_min"] = None
        normalized_payload["tolerance_max"] = None
    if evaluation_mode == "TEXT_MATCH":
        normalized_payload["tolerance_min"] = None
        normalized_payload["tolerance_max"] = None
    if evaluation_mode == "TEXT_MATCH":
        expected_value = normalized_payload.get("expected_value")
        if expected_value is None and existing_step is not None:
            expected_value = existing_step.expected_value
        if expected_value is None or not str(expected_value).strip():
            raise HTTPException(
                status_code=400,
                detail="TEXT_MATCH step requires expected_value",
            )
    if evaluation_mode == "NUMERIC_RANGE":
        tolerance_min = normalized_payload.get("tolerance_min")
        tolerance_max = normalized_payload.get("tolerance_max")
        if tolerance_min is None and existing_step is not None:
            tolerance_min = existing_step.tolerance_min
        if tolerance_max is None and existing_step is not None:
            tolerance_max = existing_step.tolerance_max
        if tolerance_min is None and tolerance_max is None:
            raise HTTPException(
                status_code=400,
                detail="NUMERIC_RANGE step requires tolerance_min or tolerance_max",
            )
        if (
            tolerance_min is not None
            and tolerance_max is not None
            and float(tolerance_min) > float(tolerance_max)
        ):
            raise HTTPException(
                status_code=400,
                detail="tolerance_min must be <= tolerance_max",
            )
    if evaluation_mode == "NUMERIC_RANGE" and normalized_payload.get("expected_value") is None:
        normalized_payload["expected_value"] = (
            existing_step.expected_value if existing_step else None
        )
    _normalize_control_region(normalized_payload, existing_step=existing_step)
    return normalized_payload


def _normalize_control_region(
    normalized_payload: dict,
    *,
    existing_step: QcStep | None = None,
) -> None:
    field_names = ("region_x", "region_y", "region_width", "region_height")
    merged_values: dict[str, float | None] = {}

    for field_name in field_names:
        value = normalized_payload.get(field_name)
        if value is None and existing_step is not None:
            value = getattr(existing_step, field_name)
        merged_values[field_name] = None if value is None else float(value)

    if all(value is None for value in merged_values.values()):
        for field_name in field_names:
            normalized_payload[field_name] = None
        return

    if any(value is None for value in merged_values.values()):
        raise HTTPException(
            status_code=400,
            detail="Control region requires region_x, region_y, region_width and region_height",
        )

    region_x = merged_values["region_x"]
    region_y = merged_values["region_y"]
    region_width = merged_values["region_width"]
    region_height = merged_values["region_height"]

    assert region_x is not None
    assert region_y is not None
    assert region_width is not None
    assert region_height is not None

    if not 0 <= region_x <= 100 or not 0 <= region_y <= 100:
        raise HTTPException(
            status_code=400,
            detail="Control region origin must be between 0 and 100 percent",
        )
    if not 0 < region_width <= 100 or not 0 < region_height <= 100:
        raise HTTPException(
            status_code=400,
            detail="Control region width and height must be greater than 0 and at most 100 percent",
        )
    if region_x + region_width > 100 or region_y + region_height > 100:
        raise HTTPException(
            status_code=400,
            detail="Control region must fit inside the reference image bounds",
        )

    normalized_payload["region_x"] = region_x
    normalized_payload["region_y"] = region_y
    normalized_payload["region_width"] = region_width
    normalized_payload["region_height"] = region_height
