from sqlalchemy.orm import Session

from app.models import AssemblyLink, Device, ProductionItem


def get_device_by_serial_number(db: Session, device_serial_number: str) -> Device | None:
    return db.query(Device).filter(Device.device_serial_number == device_serial_number).first()


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
