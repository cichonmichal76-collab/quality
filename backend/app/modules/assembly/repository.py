from sqlalchemy.orm import Session

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
) -> DeviceBomTemplate | None:
    return (
        db.query(DeviceBomTemplate)
        .filter(
            DeviceBomTemplate.device_type == device_type,
            DeviceBomTemplate.version == version,
        )
        .first()
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


def list_bom_templates(db: Session) -> list[DeviceBomTemplate]:
    return (
        db.query(DeviceBomTemplate)
        .order_by(DeviceBomTemplate.device_type.asc(), DeviceBomTemplate.created_at.desc())
        .all()
    )


def list_active_bom_templates_for_device_type(
    db: Session,
    device_type: str,
    *,
    exclude_template_id: str | None = None,
) -> list[DeviceBomTemplate]:
    query = db.query(DeviceBomTemplate).filter(
        DeviceBomTemplate.device_type == device_type,
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
        exclude_template_id=template.id,
    )
    for active_template in previously_active:
        active_template.is_active = False
        active_template.status = "INACTIVE"
    template.is_active = True
    template.status = "ACTIVE"
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
