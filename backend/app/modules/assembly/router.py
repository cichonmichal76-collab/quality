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
