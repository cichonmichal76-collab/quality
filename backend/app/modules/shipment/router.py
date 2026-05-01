from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.shipment import service
from app.schemas import DeviceRead, DeviceShipmentReadinessRead, DeviceStatusUpdate

router = APIRouter(tags=["shipment"])


@router.get(
    "/devices/{serial_number}/shipment-readiness",
    response_model=DeviceShipmentReadinessRead,
)
def get_device_shipment_readiness(
    serial_number: str,
    db: Session = Depends(get_db),
):
    return service.get_device_shipment_readiness(db, serial_number)


@router.patch("/devices/{serial_number}/status", response_model=DeviceRead)
def update_device_status(
    serial_number: str,
    payload: DeviceStatusUpdate,
    db: Session = Depends(get_db),
):
    return service.update_device_status(db, serial_number, payload)
