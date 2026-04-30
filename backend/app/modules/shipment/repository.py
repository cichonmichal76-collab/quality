from sqlalchemy.orm import Session

from app.models import Device, Nonconformity


def get_device_by_serial_number(db: Session, device_serial_number: str) -> Device | None:
    return db.query(Device).filter(Device.device_serial_number == device_serial_number).first()


def has_critical_open_ncr(db: Session, device_serial_number: str) -> bool:
    return (
        db.query(Nonconformity)
        .filter(
            Nonconformity.device_serial_number == device_serial_number,
            Nonconformity.severity == "CRITICAL",
            Nonconformity.status != "CLOSED",
        )
        .first()
        is not None
    )
