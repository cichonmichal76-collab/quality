from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.shipment import service
from app.schemas import AuditEventRead, DeviceRead, DeviceShipmentQueueRead, DeviceShipmentReadinessRead, DeviceStatusUpdate

router = APIRouter(tags=["shipment"])


@router.get("/shipment-readiness", response_model=DeviceShipmentQueueRead)
def list_device_shipment_readiness(
    device_type: str | None = None,
    variant_code: str | None = None,
    production_status: str | None = None,
    blocking_code: str | None = None,
    primary_blocking_code: str | None = None,
    recommended_action: str | None = None,
    latest_gate_result: str | None = None,
    only_blocked: bool = False,
    only_ready: bool = False,
    sort_by: str = "created_at",
    sort_desc: bool | None = None,
    offset: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return service.list_device_shipment_readiness(
        db,
        device_type=device_type,
        variant_code=variant_code,
        production_status=production_status,
        blocking_code=blocking_code,
        primary_blocking_code=primary_blocking_code,
        recommended_action=recommended_action,
        latest_gate_result=latest_gate_result,
        only_blocked=only_blocked,
        only_ready=only_ready,
        sort_by=sort_by,
        sort_desc=sort_desc,
        offset=offset,
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


@router.get(
    "/devices/{serial_number}/shipment-gate-history",
    response_model=list[AuditEventRead],
)
def get_device_shipment_gate_history(
    serial_number: str,
    result: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    return service.get_device_shipment_gate_history(
        db,
        serial_number,
        result=result,
        limit=limit,
        offset=offset,
    )


@router.patch("/devices/{serial_number}/status", response_model=DeviceRead)
def update_device_status(
    serial_number: str,
    payload: DeviceStatusUpdate,
    db: Session = Depends(get_db),
):
    return service.update_device_status(db, serial_number, payload)
