from sqlalchemy.orm import Session

from app.models import AssemblyLink, Device, DeviceBomItem, DeviceBomTemplate, Nonconformity


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


def list_installed_assembly_links_for_device(
    db: Session,
    device_serial_number: str,
) -> list[AssemblyLink]:
    return (
        db.query(AssemblyLink)
        .filter(
            AssemblyLink.parent_device_serial_number == device_serial_number,
            AssemblyLink.status == "INSTALLED",
        )
        .all()
    )


def get_active_bom_template_by_device_type(
    db: Session,
    device_type: str,
) -> DeviceBomTemplate | None:
    return (
        db.query(DeviceBomTemplate)
        .filter(
            DeviceBomTemplate.device_type == device_type,
            DeviceBomTemplate.status == "ACTIVE",
        )
        .first()
    )


def get_any_bom_template_by_device_type(
    db: Session,
    device_type: str,
) -> DeviceBomTemplate | None:
    return (
        db.query(DeviceBomTemplate)
        .filter(DeviceBomTemplate.device_type == device_type)
        .order_by(DeviceBomTemplate.created_at.desc())
        .first()
    )


def get_bound_bom_template_for_device(
    db: Session,
    device_serial_number: str,
) -> DeviceBomTemplate | None:
    link = (
        db.query(AssemblyLink)
        .filter(
            AssemblyLink.parent_device_serial_number == device_serial_number,
            AssemblyLink.bom_template_id.is_not(None),
        )
        .order_by(AssemblyLink.installed_at.asc())
        .first()
    )
    if not link or not link.bom_template_id:
        return None
    return db.query(DeviceBomTemplate).filter(DeviceBomTemplate.id == link.bom_template_id).first()


def list_required_bom_items_for_template(db: Session, template_id: str) -> list[DeviceBomItem]:
    return (
        db.query(DeviceBomItem)
        .filter(
            DeviceBomItem.template_id == template_id,
            DeviceBomItem.is_required.is_(True),
        )
        .all()
    )
