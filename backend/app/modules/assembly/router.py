from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.assembly import service
from app.schemas import AssemblyLinkRead, AssemblyScanRequest

router = APIRouter(tags=["assembly"])


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
