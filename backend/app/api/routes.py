from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, utc_now
from app.models import (
    Device,
    DeviceComponent,
)
from app.schemas import (
    ComponentCreate,
    ComponentRead,
    DeviceCreate,
    DeviceRead,
)

router = APIRouter()


def get_device_or_404(db: Session, serial_number: str) -> Device:
    device = db.query(Device).filter(Device.device_serial_number == serial_number).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@router.post("/devices", response_model=DeviceRead)
def create_device(payload: DeviceCreate, db: Session = Depends(get_db)):
    exists = db.query(Device).filter(Device.device_serial_number == payload.device_serial_number).first()
    if exists:
        raise HTTPException(status_code=409, detail="Device already exists")
    device = Device(**payload.model_dump(), production_status="CREATED")
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("/devices", response_model=list[DeviceRead])
def list_devices(db: Session = Depends(get_db)):
    return db.query(Device).order_by(Device.created_at.desc()).all()


@router.get("/devices/{serial_number}", response_model=DeviceRead)
def get_device(serial_number: str, db: Session = Depends(get_db)):
    return get_device_or_404(db, serial_number)


@router.post("/devices/{serial_number}/components", response_model=ComponentRead)
def add_component(serial_number: str, payload: ComponentCreate, db: Session = Depends(get_db)):
    get_device_or_404(db, serial_number)
    component = DeviceComponent(
        device_serial_number=serial_number,
        installed_at=utc_now(),
        **payload.model_dump(),
    )
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


@router.get("/devices/{serial_number}/components", response_model=list[ComponentRead])
def list_components(serial_number: str, db: Session = Depends(get_db)):
    get_device_or_404(db, serial_number)
    return (
        db.query(DeviceComponent)
        .filter(DeviceComponent.device_serial_number == serial_number)
        .order_by(DeviceComponent.installed_at.desc())
        .all()
    )
