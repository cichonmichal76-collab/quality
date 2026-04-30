from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.shipment import service
from app.schemas import DeviceRead, DeviceStatusUpdate

router = APIRouter(tags=["shipment"])


@router.patch("/devices/{serial_number}/status", response_model=DeviceRead)
def update_device_status(
    serial_number: str,
    payload: DeviceStatusUpdate,
    db: Session = Depends(get_db),
):
    return service.update_device_status(db, serial_number, payload)
