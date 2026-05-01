from datetime import datetime

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import utc_now
from app.models import (
    AssemblyLink,
    Device,
    DeviceBomItem,
    DeviceBomTemplate,
    DeviceComponent,
    ProductionItem,
)


def get_device_by_serial_number(db: Session, device_serial_number: str) -> Device | None:
    return db.query(Device).filter(Device.device_serial_number == device_serial_number).first()


def list_devices(db: Session) -> list[Device]:
    return db.query(Device).order_by(Device.created_at.desc()).all()


def get_production_item_by_barcode(db: Session, barcode_value: str) -> ProductionItem | None:
    return db.query(ProductionItem).filter(ProductionItem.barcode_value == barcode_value).first()


def get_active_assembly_link_by_barcode(db: Session, barcode_value: str) -> AssemblyLink | None:
    return (
        db.query(AssemblyLink)
        .filter(
            AssemblyLink.child_barcode_value == barcode_value,
            AssemblyLink.status == "INSTALLED",
        )
        .first()
    )


def list_assembly_links_for_device(db: Session, device_serial_number: str) -> list[AssemblyLink]:
    return (
        db.query(AssemblyLink)
        .filter(AssemblyLink.parent_device_serial_number == device_serial_number)
        .order_by(AssemblyLink.installed_at.asc())
        .all()
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
        .order_by(AssemblyLink.installed_at.asc())
        .all()
    )


def list_device_components(db: Session, device_serial_number: str) -> list[DeviceComponent]:
    return (
        db.query(DeviceComponent)
        .filter(DeviceComponent.device_serial_number == device_serial_number)
        .order_by(DeviceComponent.installed_at.desc())
        .all()
    )


def get_bom_template_by_device_type(db: Session, device_type: str) -> DeviceBomTemplate | None:
    return (
        db.query(DeviceBomTemplate)
        .filter(DeviceBomTemplate.device_type == device_type)
        .order_by(DeviceBomTemplate.created_at.desc())
        .first()
    )


def get_bom_template_by_device_type_and_version(
    db: Session,
    device_type: str,
    version: str,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate | None:
    return (
        db.query(DeviceBomTemplate)
        .filter(
            DeviceBomTemplate.device_type == device_type,
            DeviceBomTemplate.variant_code == variant_code,
            DeviceBomTemplate.version == version,
        )
        .first()
    )


def get_bom_template_by_id(db: Session, template_id: str) -> DeviceBomTemplate | None:
    return db.query(DeviceBomTemplate).filter(DeviceBomTemplate.id == template_id).first()


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


def list_bom_templates(db: Session) -> list[DeviceBomTemplate]:
    return (
        db.query(DeviceBomTemplate)
        .order_by(DeviceBomTemplate.device_type.asc(), DeviceBomTemplate.created_at.desc())
        .all()
    )


def list_bom_templates_for_device_type_and_variant(
    db: Session,
    device_type: str,
    variant_code: str = "DEFAULT",
) -> list[DeviceBomTemplate]:
    return (
        db.query(DeviceBomTemplate)
        .filter(
            DeviceBomTemplate.device_type == device_type,
            DeviceBomTemplate.variant_code == variant_code,
        )
        .order_by(DeviceBomTemplate.created_at.asc())
        .all()
    )


def list_active_bom_templates_for_device_type(
    db: Session,
    device_type: str,
    variant_code: str = "DEFAULT",
    *,
    exclude_template_id: str | None = None,
) -> list[DeviceBomTemplate]:
    query = db.query(DeviceBomTemplate).filter(
        DeviceBomTemplate.device_type == device_type,
        DeviceBomTemplate.variant_code == variant_code,
        DeviceBomTemplate.status == "ACTIVE",
    )
    if exclude_template_id:
        query = query.filter(DeviceBomTemplate.id != exclude_template_id)
    return query.order_by(DeviceBomTemplate.created_at.desc()).all()


def set_active_bom_template(
    db: Session,
    template: DeviceBomTemplate,
) -> list[DeviceBomTemplate]:
    previously_active = list_active_bom_templates_for_device_type(
        db,
        template.device_type,
        template.variant_code,
        exclude_template_id=template.id,
    )
    for active_template in previously_active:
        active_template.is_active = False
        active_template.status = "APPROVED" if active_template.approved_at is not None else "INACTIVE"
        active_template.replaced_by_template_id = template.id
    template.is_active = True
    template.status = "ACTIVE"
    template.replaced_by_template_id = None
    return previously_active


def list_bom_items_for_template(db: Session, template_id: str) -> list[DeviceBomItem]:
    return (
        db.query(DeviceBomItem)
        .filter(DeviceBomItem.template_id == template_id)
        .order_by(DeviceBomItem.component_type.asc())
        .all()
    )


def get_bom_item(
    db: Session,
    template_id: str,
    component_type: str,
) -> DeviceBomItem | None:
    return (
        db.query(DeviceBomItem)
        .filter(
            DeviceBomItem.template_id == template_id,
            DeviceBomItem.component_type == component_type,
        )
        .first()
    )


def count_installed_component_type_for_device(
    db: Session,
    device_serial_number: str,
    component_type: str,
) -> int:
    return (
        db.query(AssemblyLink)
        .filter(
            AssemblyLink.parent_device_serial_number == device_serial_number,
            AssemblyLink.component_type == component_type,
            AssemblyLink.status == "INSTALLED",
        )
        .count()
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


def has_bom_templates_for_device_type_and_variant(
    db: Session,
    device_type: str,
    variant_code: str,
) -> bool:
    return (
        db.query(DeviceBomTemplate)
        .filter(
            DeviceBomTemplate.device_type == device_type,
            DeviceBomTemplate.variant_code == variant_code,
        )
        .first()
        is not None
    )


def has_bom_template_bindings(db: Session, template_id: str) -> bool:
    return (
        db.query(AssemblyLink)
        .filter(AssemblyLink.bom_template_id == template_id)
        .first()
        is not None
    )


def count_bound_devices_for_template(db: Session, template_id: str) -> int:
    return (
        db.query(AssemblyLink.parent_device_serial_number)
        .filter(AssemblyLink.bom_template_id == template_id)
        .distinct()
        .count()
    )


def list_bound_devices_for_template(
    db: Session,
    template_id: str,
) -> list[tuple[str, str, str, str, str, int, datetime]]:
    return [
        (
            row.device_serial_number,
            row.device_type,
            row.device_variant_code,
            row.production_status,
            row.bom_version,
            row.installed_component_count,
            row.first_bound_at,
        )
        for row in (
            db.query(
                Device.device_serial_number.label("device_serial_number"),
                Device.device_type.label("device_type"),
                Device.variant_code.label("device_variant_code"),
                Device.production_status.label("production_status"),
                AssemblyLink.bom_version.label("bom_version"),
                func.count(AssemblyLink.id).label("installed_component_count"),
                func.min(AssemblyLink.installed_at).label("first_bound_at"),
            )
            .join(
                AssemblyLink,
                AssemblyLink.parent_device_serial_number == Device.device_serial_number,
            )
            .filter(AssemblyLink.bom_template_id == template_id)
            .group_by(
                Device.device_serial_number,
                Device.device_type,
                Device.variant_code,
                Device.production_status,
                AssemblyLink.bom_version,
            )
            .order_by(func.min(AssemblyLink.installed_at).asc(), Device.device_serial_number.asc())
            .all()
        )
    ]
