from sqlalchemy.orm import Session

from app.models import Device, FinalTestRun


def get_device_by_serial_number(db: Session, device_serial_number: str) -> Device | None:
    return db.query(Device).filter(Device.device_serial_number == device_serial_number).first()


def get_final_test_by_run_id(db: Session, test_run_id: str) -> FinalTestRun | None:
    return db.query(FinalTestRun).filter(FinalTestRun.test_run_id == test_run_id).first()
