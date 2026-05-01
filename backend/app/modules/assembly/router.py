from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.assembly import service
from app.schemas import (
    AssemblyLinkRead,
    AssemblyScanRequest,
    DeviceBomComplianceRead,
    ComponentCreate,
    ComponentRead,
    DeviceBomResolutionRead,
    DeviceBomTemplateBindingRead,
    DeviceBomTemplateCatalogEntryRead,
    DeviceBomTemplateCoverageRead,
    DeviceBomTemplateDiffRead,
    DeviceBomTemplateLineageRead,
    DeviceBomTemplateActivateRequest,
    DeviceBomTemplateApproveRequest,
    DeviceBomTemplateCloneRequest,
    DeviceBomTemplatePromoteRequest,
    DeviceBomTemplateRevokeApprovalRequest,
    DeviceBomTemplateReleaseRequest,
    DeviceBomItemCreate,
    DeviceBomItemUpdate,
    DeviceBomItemRead,
    DeviceBomTemplateCreate,
    DeviceBomTemplateReadinessRead,
    DeviceBomTemplateRetireRequest,
    DeviceBomTemplateRead,
    DeviceBomTemplateUsageRead,
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


@router.get(
    "/devices/{device_serial_number}/bom-resolution",
    response_model=DeviceBomResolutionRead,
)
def get_device_bom_resolution(
    device_serial_number: str,
    db: Session = Depends(get_db),
):
    return service.get_device_bom_resolution(db, device_serial_number)


@router.get(
    "/devices/{device_serial_number}/bom-compliance",
    response_model=DeviceBomComplianceRead,
)
def get_device_bom_compliance(
    device_serial_number: str,
    db: Session = Depends(get_db),
):
    return service.get_device_bom_compliance(db, device_serial_number)


@router.post("/device-bom-templates", response_model=DeviceBomTemplateRead)
def create_device_bom_template(
    payload: DeviceBomTemplateCreate,
    db: Session = Depends(get_db),
):
    return service.create_device_bom_template(db, payload)


@router.get("/device-bom-templates", response_model=list[DeviceBomTemplateRead])
def list_device_bom_templates(db: Session = Depends(get_db)):
    return service.list_device_bom_templates(db)


@router.get(
    "/device-bom-templates/{device_type}/catalog",
    response_model=list[DeviceBomTemplateCatalogEntryRead],
)
def list_device_bom_template_catalog(
    device_type: str,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.list_device_bom_template_catalog(db, device_type, variant_code)


@router.get(
    "/device-bom-templates/{device_type}/lineage",
    response_model=DeviceBomTemplateLineageRead,
)
def get_device_bom_template_lineage(
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.get_device_bom_template_lineage(db, device_type, version, variant_code)


@router.get(
    "/device-bom-templates/{device_type}/usage",
    response_model=DeviceBomTemplateUsageRead,
)
def get_device_bom_template_usage(
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.get_device_bom_template_usage(db, device_type, version, variant_code)


@router.get(
    "/device-bom-templates/{device_type}/readiness",
    response_model=DeviceBomTemplateReadinessRead,
)
def get_device_bom_template_readiness(
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.get_device_bom_template_readiness(db, device_type, version, variant_code)


@router.get(
    "/device-bom-templates/{device_type}/bindings",
    response_model=list[DeviceBomTemplateBindingRead],
)
def list_device_bom_template_bindings(
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.list_device_bom_template_bindings(db, device_type, version, variant_code)


@router.get(
    "/device-bom-templates/{device_type}/coverage",
    response_model=list[DeviceBomTemplateCoverageRead],
)
def list_device_bom_template_coverage(
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.list_device_bom_template_coverage(db, device_type, version, variant_code)


@router.get(
    "/device-bom-templates/{device_type}/diff",
    response_model=DeviceBomTemplateDiffRead,
)
def get_device_bom_template_diff(
    device_type: str,
    source_version: str,
    target_version: str,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.get_device_bom_template_diff(
        db,
        device_type,
        source_version,
        target_version,
        variant_code,
    )


@router.post(
    "/device-bom-templates/{device_type}/activate",
    response_model=DeviceBomTemplateRead,
)
def activate_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplateActivateRequest,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.activate_device_bom_template(db, device_type, payload, variant_code)


@router.post(
    "/device-bom-templates/{device_type}/approve",
    response_model=DeviceBomTemplateRead,
)
def approve_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplateApproveRequest,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.approve_device_bom_template(db, device_type, payload, variant_code)


@router.post(
    "/device-bom-templates/{device_type}/revoke-approval",
    response_model=DeviceBomTemplateRead,
)
def revoke_device_bom_template_approval(
    device_type: str,
    payload: DeviceBomTemplateRevokeApprovalRequest,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.revoke_device_bom_template_approval(db, device_type, payload, variant_code)


@router.post(
    "/device-bom-templates/{device_type}/release",
    response_model=DeviceBomTemplateRead,
)
def release_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplateReleaseRequest,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.release_device_bom_template(db, device_type, payload, variant_code)


@router.post(
    "/device-bom-templates/{device_type}/retire",
    response_model=DeviceBomTemplateRead,
)
def retire_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplateRetireRequest,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.retire_device_bom_template(db, device_type, payload, variant_code)


@router.post(
    "/device-bom-templates/{device_type}/clone",
    response_model=DeviceBomTemplateRead,
)
def clone_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplateCloneRequest,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.clone_device_bom_template(db, device_type, payload, variant_code)


@router.post(
    "/device-bom-templates/{device_type}/promote",
    response_model=DeviceBomTemplateRead,
)
def promote_device_bom_template(
    device_type: str,
    payload: DeviceBomTemplatePromoteRequest,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.promote_device_bom_template(db, device_type, payload, variant_code)


@router.post(
    "/device-bom-templates/{device_type}/items",
    response_model=DeviceBomItemRead,
)
def add_device_bom_item(
    device_type: str,
    payload: DeviceBomItemCreate,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.add_device_bom_item(db, device_type, payload, version, variant_code)


@router.patch(
    "/device-bom-templates/{device_type}/items/{component_type}",
    response_model=DeviceBomItemRead,
)
def update_device_bom_item(
    device_type: str,
    component_type: str,
    payload: DeviceBomItemUpdate,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.update_device_bom_item(
        db,
        device_type,
        component_type,
        payload,
        version,
        variant_code,
    )


@router.delete(
    "/device-bom-templates/{device_type}/items/{component_type}",
    response_model=DeviceBomItemRead,
)
def delete_device_bom_item(
    device_type: str,
    component_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.delete_device_bom_item(db, device_type, component_type, version, variant_code)


@router.get(
    "/device-bom-templates/{device_type}/items",
    response_model=list[DeviceBomItemRead],
)
def list_device_bom_items(
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
    db: Session = Depends(get_db),
):
    return service.list_device_bom_items(db, device_type, version, variant_code)


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
