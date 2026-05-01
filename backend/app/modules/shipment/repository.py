from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import utc_now
from app.models import AuditEvent, AssemblyLink, Device, DeviceBomItem, DeviceBomTemplate, Nonconformity


def get_device_by_serial_number(db: Session, device_serial_number: str) -> Device | None:
    return db.query(Device).filter(Device.device_serial_number == device_serial_number).first()


def list_devices_for_shipment(
    db: Session,
    *,
    device_type: str | None = None,
    variant_code: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[Device]:
    query = db.query(Device)
    if device_type:
        query = query.filter(Device.device_type == device_type)
    if variant_code:
        query = query.filter(Device.variant_code == variant_code)
    query = query.order_by(Device.created_at.desc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


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


def list_critical_open_ncr_ids(db: Session, device_serial_number: str) -> list[str]:
    return [
        row.ncr_id
        for row in db.query(Nonconformity.ncr_id)
        .filter(
            Nonconformity.device_serial_number == device_serial_number,
            Nonconformity.severity == "CRITICAL",
            Nonconformity.status != "CLOSED",
        )
        .order_by(Nonconformity.detected_at.asc())
        .all()
    ]


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
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate | None:
    now = utc_now()
    return (
        db.query(DeviceBomTemplate)
        .filter(
            DeviceBomTemplate.device_type == device_type,
            DeviceBomTemplate.variant_code == variant_code,
            DeviceBomTemplate.status == "ACTIVE",
            or_(
                DeviceBomTemplate.effective_from.is_(None),
                DeviceBomTemplate.effective_from <= now,
            ),
            or_(
                DeviceBomTemplate.effective_to.is_(None),
                DeviceBomTemplate.effective_to >= now,
            ),
        )
        .first()
    )


def get_any_bom_template_by_device_type_and_variant(
    db: Session,
    device_type: str,
    variant_code: str,
) -> DeviceBomTemplate | None:
    return (
        db.query(DeviceBomTemplate)
        .filter(
            DeviceBomTemplate.device_type == device_type,
            DeviceBomTemplate.variant_code == variant_code,
        )
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


def list_bom_items_for_template(db: Session, template_id: str) -> list[DeviceBomItem]:
    return db.query(DeviceBomItem).filter(DeviceBomItem.template_id == template_id).all()


def list_shipment_gate_audit_events_for_device(
    db: Session,
    device_serial_number: str,
    *,
    result: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditEvent]:
    query = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.entity_type == "DEVICE",
            AuditEvent.entity_id == device_serial_number,
            AuditEvent.event_type.in_(["SHIPMENT_GATE_PASSED", "SHIPMENT_GATE_BLOCKED"]),
        )
        .order_by(AuditEvent.created_at.desc())
    )
    if result:
        query = query.filter(AuditEvent.result == result)
    if offset:
        query = query.offset(offset)
    return query.limit(limit).all()


def get_latest_shipment_gate_audit_event_for_device(
    db: Session,
    device_serial_number: str,
) -> AuditEvent | None:
    return (
        db.query(AuditEvent)
        .filter(
            AuditEvent.entity_type == "DEVICE",
            AuditEvent.entity_id == device_serial_number,
            AuditEvent.event_type.in_(["SHIPMENT_GATE_PASSED", "SHIPMENT_GATE_BLOCKED"]),
        )
        .order_by(AuditEvent.created_at.desc())
        .first()
    )
