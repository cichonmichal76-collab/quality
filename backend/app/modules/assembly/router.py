from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.assembly import service
from app.schemas import (
    AssemblyLinkRead,
    AssemblyScanRequest,
    ComponentCreate,
    ComponentRead,
    DeviceBomTemplateActivateRequest,
    DeviceBomItemCreate,
    DeviceBomItemRead,
    DeviceBomTemplateCreate,
    DeviceBomTemplateRetireRequest,
    DeviceBomTemplateRead,
    DeviceCreate,
    DeviceRead,
)

router = APIRouter(tags=["assembly"])


@router.post("/devices", response_model=DeviceRead)
def create_device(payload: DeviceCreate, db: Session = Depends(get_db)):
    return service.create_device(db, payload)


@router.get("/devices", response_model=list[DeviceRead])
def list_devices(db: Session = Depends(get_db)):
    return service.list_devices(db)


@router.get("/devices/{device_serial_number}", response_model=DeviceRead)
def get_device(device_serial_number: str, db: Session = Depends(get_db)):
    return service.get_device_or_404(db, device_serial_number)


@router.post("/device-bom-templates", response_model=DeviceBomTemplateRead)
def create_device_bom_template(
    payload: DeviceBomTemplateCreate,
    db: Session = Depends(get_db),
):
    return service.create_device_bom_template(db, payload)


@router.get("/device-bom-templates", response_model=list[DeviceBomTemplateRead])
def list_device_bom_templates(db: Session = Depends(get_db)):
    return service.list_device_bom_templates(db)


@router.post(
    "/device-bom-templates/{device_type}/activate",
    response_model=DeviceBomTemplateRead,
)
def activate_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplateActivateRequest,
    db: Session = Depends(get_db),
):
    return service.activate_device_bom_template(db, device_type, payload)


@router.post(
    "/device-bom-templates/{device_type}/retire",
    response_model=DeviceBomTemplateRead,
)
def retire_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplateRetireRequest,
    db: Session = Depends(get_db),
):
    return service.retire_device_bom_template(db, device_type, payload)


@router.post(
    "/device-bom-templates/{device_type}/items",
    response_model=DeviceBomItemRead,
)
def add_device_bom_item(
    device_type: str,
    payload: DeviceBomItemCreate,
    version: str | None = None,
    db: Session = Depends(get_db),
):
    return service.add_device_bom_item(db, device_type, payload, version)


@router.get(
    "/device-bom-templates/{device_type}/items",
    response_model=list[DeviceBomItemRead],
)
def list_device_bom_items(
    device_type: str,
    version: str | None = None,
    db: Session = Depends(get_db),
):
    return service.list_device_bom_items(db, device_type, version)


@router.post("/devices/{device_serial_number}/components", response_model=ComponentRead)
def add_component(
    device_serial_number: str,
    payload: ComponentCreate,
    db: Session = Depends(get_db),
):
    return service.add_component(db, device_serial_number, payload)


@router.get("/devices/{device_serial_number}/components", response_model=list[ComponentRead])
def list_components(device_serial_number: str, db: Session = Depends(get_db)):
    return service.list_components(db, device_serial_number)


@router.post("/devices/{device_serial_number}/assembly/scan-component", response_model=AssemblyLinkRead)
def scan_component_for_assembly(
    device_serial_number: str,
    payload: AssemblyScanRequest,
    db: Session = Depends(get_db),
):
    return service.scan_component_for_assembly(db, device_serial_number, payload)


@router.get("/devices/{device_serial_number}/assembly-tree", response_model=list[AssemblyLinkRead])
def get_assembly_tree(device_serial_number: str, db: Session = Depends(get_db)):
    return service.get_assembly_tree(db, device_serial_number)
