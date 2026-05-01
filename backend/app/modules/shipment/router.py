from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.shipment import service
from app.schemas import DeviceRead, DeviceShipmentQueueRead, DeviceShipmentReadinessRead, DeviceStatusUpdate

router = APIRouter(tags=["shipment"])


@router.get("/shipment-readiness", response_model=DeviceShipmentQueueRead)
def list_device_shipment_readiness(
    device_type: str | None = None,
    variant_code: str | None = None,
    only_blocked: bool = False,
    only_ready: bool = False,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return service.list_device_shipment_readiness(
        db,
        device_type=device_type,
        variant_code=variant_code,
        only_blocked=only_blocked,
        only_ready=only_ready,
        limit=limit,
    )


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
