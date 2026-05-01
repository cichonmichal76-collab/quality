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
        .first()
    )


def list_bom_templates(db: Session) -> list[DeviceBomTemplate]:
    return db.query(DeviceBomTemplate).order_by(DeviceBomTemplate.device_type.asc()).all()


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
