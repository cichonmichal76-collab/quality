from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import FinalTestRun, Nonconformity
from app.modules.auth_rfid.service import FINAL_TEST_SESSION_ROLES, require_active_work_session
from app.modules.final_test import repository
from app.schemas import FinalTestCreate

FINAL_TEST_PASSED = "FINAL_TEST_PASSED"
FINAL_TEST_FAILED = "FINAL_TEST_FAILED"


def get_device_or_404(db: Session, device_serial_number: str):
    device = repository.get_device_by_serial_number(db, device_serial_number)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def get_final_test_or_404(db: Session, test_run_id: str) -> FinalTestRun:
    test = repository.get_final_test_by_run_id(db, test_run_id)
    if not test:
        raise HTTPException(status_code=404, detail="Final test not found")
    return test


def create_final_test(db: Session, payload: FinalTestCreate) -> FinalTestRun:
    device = get_device_or_404(db, payload.device_serial_number)
    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.operator_id,
        allowed_roles=FINAL_TEST_SESSION_ROLES,
    )
    operator_id = payload.operator_id or work_session.operator_id
    test = FinalTestRun(
        test_run_id=payload.test_run_id,
        device_serial_number=payload.device_serial_number,
        operator_id=operator_id,
        result=payload.result,
        firmware_version=payload.firmware_version,
        bootloader_version=payload.bootloader_version,
        report_path=payload.report_path,
        mcu_log_path=payload.mcu_log_path,
        started_at=utc_now(),
        ended_at=utc_now(),
    )
    db.add(test)

    if payload.result == "PASS":
        device.production_status = FINAL_TEST_PASSED
    elif payload.result == "FAIL":
        device.production_status = FINAL_TEST_FAILED
        db.add(
            Nonconformity(
                ncr_id=f"NCR-{payload.test_run_id}",
                device_serial_number=payload.device_serial_number,
                process_stage="FINAL_TEST",
                description="Final test failed",
                severity="CRITICAL",
                status="OPEN",
                detected_by=operator_id,
            )
        )
    device.updated_at = utc_now()
    record_audit_event(
        db,
        event_type="FINAL_TEST_RECORDED",
        entity_type="FINAL_TEST",
        entity_id=payload.test_run_id,
        work_session=work_session,
        operator_id=operator_id,
        result=payload.result,
        message=f"Final test {payload.result} for {payload.device_serial_number}",
        payload=payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(test)
    return test


def complete_final_test(db: Session, test_run_id: str) -> FinalTestRun:
    test = get_final_test_or_404(db, test_run_id)
    test.ended_at = utc_now()
    db.commit()
    db.refresh(test)
    return test
