import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import (
    AssemblyLink,
    Device,
    DeviceBomItem,
    DeviceBomTemplate,
    DeviceComponent,
    ProductionItem,
    ScanEvent,
)
from app.modules.auth_rfid.service import PRODUCTION_SESSION_ROLES, require_active_work_session
from app.modules.assembly import repository
from app.schemas import (
    AssemblyScanRequest,
    ComponentCreate,
    DeviceBomComponentCoverageRead,
    DeviceBomTemplateBindingRead,
    DeviceBomTemplateCoverageRead,
    DeviceBomItemDiffRead,
    DeviceBomTemplateActivateRequest,
    DeviceBomTemplateApproveRequest,
    DeviceBomTemplateCloneRequest,
    DeviceBomItemSnapshotRead,
    DeviceBomTemplatePromoteRequest,
    DeviceBomTemplateReleaseRequest,
    DeviceBomItemCreate,
    DeviceBomItemUpdate,
    DeviceBomTemplateCreate,
    DeviceBomTemplateDiffRead,
    DeviceBomTemplateReadinessRead,
    DeviceBomTemplateRetireRequest,
    DeviceBomTemplateUsageRead,
    DeviceCreate,
)


def get_device_or_404(db: Session, device_serial_number: str):
    device = repository.get_device_by_serial_number(db, device_serial_number)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def _normalize_bom_version(version: str) -> tuple[int, ...]:
    parts = [int(part) for part in version.split(".")]
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    return tuple(parts)


def _ensure_target_version_progresses(source_version: str, target_version: str) -> None:
    if _normalize_bom_version(target_version) <= _normalize_bom_version(source_version):
        raise HTTPException(
            status_code=400,
            detail="Target BOM version must be greater than source version",
        )


def create_device(db: Session, payload: DeviceCreate) -> Device:
    if repository.get_device_by_serial_number(db, payload.device_serial_number):
        raise HTTPException(status_code=409, detail="Device already exists")
    device = Device(**payload.model_dump(), production_status="CREATED")
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def list_devices(db: Session) -> list[Device]:
    return repository.list_devices(db)


def add_component(db: Session, device_serial_number: str, payload: ComponentCreate) -> DeviceComponent:
    get_device_or_404(db, device_serial_number)
    component = DeviceComponent(
        device_serial_number=device_serial_number,
        installed_at=utc_now(),
        **payload.model_dump(),
    )
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


def list_components(db: Session, device_serial_number: str) -> list[DeviceComponent]:
    get_device_or_404(db, device_serial_number)
    return repository.list_device_components(db, device_serial_number)


def create_device_bom_template(db: Session, payload: DeviceBomTemplateCreate) -> DeviceBomTemplate:
    if repository.get_bom_template_by_device_type_and_version(
        db,
        payload.device_type,
        payload.version,
        payload.variant_code,
    ):
        raise HTTPException(
            status_code=409,
            detail="BOM template version already exists for device type",
        )
    deactivated_templates: list[DeviceBomTemplate] = []
    if payload.is_active:
        deactivated_templates = repository.list_active_bom_templates_for_device_type(
            db,
            payload.device_type,
            payload.variant_code,
        )
        for active_template in deactivated_templates:
            active_template.is_active = False
            active_template.status = "INACTIVE"
    template = DeviceBomTemplate(
        **payload.model_dump(),
        status="ACTIVE" if payload.is_active else "INACTIVE",
    )
    db.add(template)
    db.flush()
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_CREATED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=template.id,
        result=template.status,
        message=f"Created BOM template {template.device_type} v{template.version}",
        payload={
            **payload.model_dump(),
            "status": template.status,
        },
    )
    for deactivated_template in deactivated_templates:
        record_audit_event(
            db,
            event_type="DEVICE_BOM_TEMPLATE_DEACTIVATED",
            entity_type="DEVICE_BOM_TEMPLATE",
            entity_id=deactivated_template.id,
            result="INACTIVE",
            message=(
                f"Deactivated BOM template {deactivated_template.device_type} "
                f"v{deactivated_template.version}"
            ),
            payload={
                "device_type": deactivated_template.device_type,
                "variant_code": deactivated_template.variant_code,
                "version": deactivated_template.version,
                "replaced_by_template_id": template.id,
                "replaced_by_variant_code": template.variant_code,
                "replaced_by_version": template.version,
            },
        )
    if template.is_active:
        record_audit_event(
            db,
            event_type="DEVICE_BOM_TEMPLATE_ACTIVATED",
            entity_type="DEVICE_BOM_TEMPLATE",
            entity_id=template.id,
            result=template.status,
            message=f"Activated BOM template {template.device_type} v{template.version}",
            payload={
                "device_type": template.device_type,
                "variant_code": template.variant_code,
                "version": template.version,
                "status": template.status,
            },
        )
    db.commit()
    db.refresh(template)
    return template


def list_device_bom_templates(db: Session) -> list[DeviceBomTemplate]:
    return repository.list_bom_templates(db)


def get_device_bom_template_usage(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplateUsageRead:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    bound_device_count = repository.count_bound_devices_for_template(db, template.id)
    is_bound = bound_device_count > 0
    can_modify = template.status != "RETIRED" and not (template.status == "ACTIVE" and is_bound)
    if template.status == "RETIRED":
        recommended_action = "clone"
    elif template.status == "ACTIVE" and is_bound:
        recommended_action = "clone_or_promote"
    elif template.status == "ACTIVE":
        recommended_action = "modify_in_place"
    else:
        recommended_action = "modify_or_activate"

    return DeviceBomTemplateUsageRead(
        template_id=template.id,
        device_type=template.device_type,
        variant_code=template.variant_code,
        version=template.version,
        status=template.status,
        is_active=template.is_active,
        is_approved=template.approved_at is not None,
        bound_device_count=bound_device_count,
        is_bound=is_bound,
        can_modify=can_modify,
        recommended_action=recommended_action,
    )


def _evaluate_bom_template_readiness(
    db: Session,
    template: DeviceBomTemplate,
) -> DeviceBomTemplateReadinessRead:
    items = repository.list_bom_items_for_template(db, template.id)
    item_count = len(items)
    required_item_count = sum(1 for item in items if item.is_required)
    blocking_reasons: list[str] = []
    if item_count == 0:
        blocking_reasons.append("BOM template has no items")
    if required_item_count == 0:
        blocking_reasons.append("BOM template has no required items")
    return DeviceBomTemplateReadinessRead(
        template_id=template.id,
        device_type=template.device_type,
        variant_code=template.variant_code,
        version=template.version,
        status=template.status,
        is_active=template.is_active,
        is_approved=template.approved_at is not None,
        item_count=item_count,
        required_item_count=required_item_count,
        has_any_items=item_count > 0,
        can_activate=not blocking_reasons,
        blocking_reasons=blocking_reasons,
    )


def get_device_bom_template_readiness(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplateReadinessRead:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    return _evaluate_bom_template_readiness(db, template)


def list_device_bom_template_bindings(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> list[DeviceBomTemplateBindingRead]:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    return [
        DeviceBomTemplateBindingRead(
            device_serial_number=device_serial_number,
            device_type=bound_device_type,
            device_variant_code=device_variant_code,
            bom_variant_code=template.variant_code,
            production_status=production_status,
            bom_version=bom_version,
            installed_component_count=installed_component_count,
            first_bound_at=first_bound_at,
        )
        for (
            device_serial_number,
            bound_device_type,
            device_variant_code,
            production_status,
            bom_version,
            installed_component_count,
            first_bound_at,
        ) in repository.list_bound_devices_for_template(db, template.id)
    ]


def list_device_bom_template_coverage(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> list[DeviceBomTemplateCoverageRead]:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    bom_items = repository.list_bom_items_for_template(db, template.id)
    coverage_rows: list[DeviceBomTemplateCoverageRead] = []

    for (
        device_serial_number,
        bound_device_type,
        device_variant_code,
        production_status,
        bom_version,
        installed_component_count,
        first_bound_at,
    ) in repository.list_bound_devices_for_template(db, template.id):
        installed_links = repository.list_installed_assembly_links_for_device(
            db,
            device_serial_number,
        )
        installed_counts: dict[str, int] = {}
        for link in installed_links:
            installed_counts[link.component_type] = installed_counts.get(link.component_type, 0) + 1

        component_coverage: list[DeviceBomComponentCoverageRead] = []
        missing_required_components: list[str] = []
        unexpected_component_types: list[str] = []

        for bom_item in bom_items:
            installed_quantity = installed_counts.pop(bom_item.component_type, 0)
            if installed_quantity > bom_item.quantity_required:
                status = "OVER_INSTALLED"
            elif bom_item.is_required and installed_quantity < bom_item.quantity_required:
                status = "MISSING"
            elif bom_item.is_required:
                status = "SATISFIED"
            elif installed_quantity > 0:
                status = "OPTIONAL_PRESENT"
            else:
                status = "OPTIONAL_MISSING"

            if bom_item.is_required and installed_quantity < bom_item.quantity_required:
                if bom_item.quantity_required == 1:
                    missing_required_components.append(bom_item.component_type)
                else:
                    missing_required_components.append(
                        f"{bom_item.component_type} x{bom_item.quantity_required}"
                    )

            component_coverage.append(
                DeviceBomComponentCoverageRead(
                    component_type=bom_item.component_type,
                    required_quantity=bom_item.quantity_required,
                    installed_quantity=installed_quantity,
                    is_required=bom_item.is_required,
                    status=status,
                )
            )

        for unexpected_component_type, installed_quantity in sorted(installed_counts.items()):
            unexpected_component_types.append(unexpected_component_type)
            component_coverage.append(
                DeviceBomComponentCoverageRead(
                    component_type=unexpected_component_type,
                    required_quantity=0,
                    installed_quantity=installed_quantity,
                    is_required=False,
                    status="UNEXPECTED",
                )
            )

        coverage_rows.append(
            DeviceBomTemplateCoverageRead(
                device_serial_number=device_serial_number,
                device_type=bound_device_type,
                device_variant_code=device_variant_code,
                bom_variant_code=template.variant_code,
                production_status=production_status,
                bom_version=bom_version,
                installed_component_count=installed_component_count,
                first_bound_at=first_bound_at,
                is_complete=not missing_required_components and not unexpected_component_types,
                missing_required_components=missing_required_components,
                unexpected_component_types=unexpected_component_types,
                component_coverage=component_coverage,
            )
        )

    return coverage_rows


def _ensure_bom_template_can_be_activated(
    db: Session,
    template: DeviceBomTemplate,
) -> None:
    readiness = _evaluate_bom_template_readiness(db, template)
    if readiness.can_activate:
        return
    raise HTTPException(
        status_code=400,
        detail=(
            "BOM template is not ready for activation: "
            + "; ".join(readiness.blocking_reasons)
        ),
    )


def approve_device_bom_template(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplateApproveRequest,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    template = get_device_bom_template_or_404(db, device_type, payload.version, variant_code)
    if template.status == "RETIRED":
        raise HTTPException(status_code=400, detail="Retired BOM template cannot be approved")
    template.approved_by = payload.approved_by
    template.approved_at = utc_now()
    template.release_note = payload.release_note
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_APPROVED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=template.id,
        result=template.status,
        message=f"Approved BOM template {template.device_type} v{template.version}",
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            "approved_by": template.approved_by,
            "approved_at": template.approved_at.isoformat() if template.approved_at else None,
            "release_note": template.release_note,
        },
    )
    db.commit()
    db.refresh(template)
    return template


def release_device_bom_template(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplateReleaseRequest,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    template = approve_device_bom_template(
        db,
        device_type,
        DeviceBomTemplateApproveRequest(
            version=payload.version,
            approved_by=payload.approved_by,
            release_note=payload.release_note,
        ),
        variant_code,
    )
    if not template.is_active:
        template = activate_device_bom_template(
            db,
            device_type,
            DeviceBomTemplateActivateRequest(version=payload.version),
            variant_code,
        )
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_RELEASED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=template.id,
        result=template.status,
        message=f"Released BOM template {template.device_type} v{template.version}",
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            "approved_by": template.approved_by,
            "approved_at": template.approved_at.isoformat() if template.approved_at else None,
            "release_note": template.release_note,
            "status": template.status,
            "is_active": template.is_active,
        },
    )
    db.commit()
    db.refresh(template)
    return template


def _snapshot_bom_item(item: DeviceBomItem) -> DeviceBomItemSnapshotRead:
    return DeviceBomItemSnapshotRead(
        component_type=item.component_type,
        required_part_number=item.required_part_number,
        required_revision=item.required_revision,
        required_drawing_number=item.required_drawing_number,
        required_drawing_revision=item.required_drawing_revision,
        quantity_required=item.quantity_required,
        is_required=item.is_required,
    )


def get_device_bom_template_diff(
    db: Session,
    device_type: str,
    source_version: str,
    target_version: str,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplateDiffRead:
    source_template = get_device_bom_template_or_404(db, device_type, source_version, variant_code)
    target_template = get_device_bom_template_or_404(db, device_type, target_version, variant_code)

    source_items = {
        item.component_type: _snapshot_bom_item(item)
        for item in repository.list_bom_items_for_template(db, source_template.id)
    }
    target_items = {
        item.component_type: _snapshot_bom_item(item)
        for item in repository.list_bom_items_for_template(db, target_template.id)
    }

    added: list[DeviceBomItemSnapshotRead] = []
    removed: list[DeviceBomItemSnapshotRead] = []
    modified: list[DeviceBomItemDiffRead] = []
    unchanged_count = 0

    for component_type in sorted(set(source_items) | set(target_items)):
        source_item = source_items.get(component_type)
        target_item = target_items.get(component_type)
        if source_item is None and target_item is not None:
            added.append(target_item)
            continue
        if source_item is not None and target_item is None:
            removed.append(source_item)
            continue
        if source_item is None or target_item is None:
            continue
        if source_item.model_dump() == target_item.model_dump():
            unchanged_count += 1
            continue
        modified.append(
            DeviceBomItemDiffRead(
                component_type=component_type,
                change_type="MODIFIED",
                source=source_item,
                target=target_item,
            )
        )

    return DeviceBomTemplateDiffRead(
        device_type=device_type,
        variant_code=source_template.variant_code,
        source_version=source_template.version,
        target_version=target_template.version,
        added=added,
        removed=removed,
        modified=modified,
        unchanged_count=unchanged_count,
    )


def get_device_bom_template_or_404(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    if version is not None:
        template = repository.get_bom_template_by_device_type_and_version(
            db,
            device_type,
            version,
            variant_code,
        )
    else:
        template = repository.get_active_bom_template_by_device_type(db, device_type, variant_code)
    if not template:
        raise HTTPException(status_code=404, detail="BOM template not found")
    return template


def _ensure_bom_template_is_mutable(db: Session, template: DeviceBomTemplate) -> None:
    if template.status == "RETIRED":
        raise HTTPException(status_code=400, detail="Retired BOM template cannot be modified")
    if template.status == "ACTIVE" and repository.has_bom_template_bindings(db, template.id):
        raise HTTPException(
            status_code=400,
            detail="Active BOM template already used by devices cannot be modified; use clone or promote",
        )


def activate_device_bom_template(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplateActivateRequest,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    template = get_device_bom_template_or_404(db, device_type, payload.version, variant_code)
    if template.is_active:
        return template
    if template.status == "RETIRED":
        raise HTTPException(status_code=400, detail="Retired BOM template cannot be activated")
    _ensure_bom_template_can_be_activated(db, template)
    previously_active = repository.set_active_bom_template(db, template)
    for deactivated_template in previously_active:
        record_audit_event(
            db,
            event_type="DEVICE_BOM_TEMPLATE_DEACTIVATED",
            entity_type="DEVICE_BOM_TEMPLATE",
            entity_id=deactivated_template.id,
            result="INACTIVE",
            message=(
                f"Deactivated BOM template {deactivated_template.device_type} "
                f"v{deactivated_template.version}"
            ),
            payload={
                "device_type": deactivated_template.device_type,
                "variant_code": deactivated_template.variant_code,
                "version": deactivated_template.version,
                "status": deactivated_template.status,
                "replaced_by_template_id": template.id,
                "replaced_by_variant_code": template.variant_code,
                "replaced_by_version": template.version,
            },
        )
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_ACTIVATED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=template.id,
        result="ACTIVE",
        message=f"Activated BOM template {template.device_type} v{template.version}",
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            "status": template.status,
        },
    )
    db.commit()
    db.refresh(template)
    return template


def retire_device_bom_template(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplateRetireRequest,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    template = get_device_bom_template_or_404(db, device_type, payload.version, variant_code)
    if template.status == "RETIRED":
        return template
    template.is_active = False
    template.status = "RETIRED"
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_RETIRED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=template.id,
        result=template.status,
        message=f"Retired BOM template {template.device_type} v{template.version}",
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            "status": template.status,
            "reason": payload.reason,
        },
    )
    db.commit()
    db.refresh(template)
    return template


def clone_device_bom_template(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplateCloneRequest,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    source_template = get_device_bom_template_or_404(
        db,
        device_type,
        payload.source_version,
        variant_code,
    )
    _ensure_target_version_progresses(payload.source_version, payload.target_version)
    if repository.get_bom_template_by_device_type_and_version(
        db,
        device_type,
        payload.target_version,
        variant_code,
    ):
        raise HTTPException(
            status_code=409,
            detail="BOM template version already exists for device type",
        )
    source_items = repository.list_bom_items_for_template(db, source_template.id)
    if payload.activate:
        candidate_readiness = _evaluate_bom_template_readiness(db, source_template)
        if not candidate_readiness.can_activate:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cloned BOM template would not be ready for activation: "
                    + "; ".join(candidate_readiness.blocking_reasons)
                ),
            )

    deactivated_templates: list[DeviceBomTemplate] = []
    if payload.activate:
        deactivated_templates = repository.list_active_bom_templates_for_device_type(
            db,
            device_type,
            variant_code,
        )
        for active_template in deactivated_templates:
            active_template.is_active = False
            active_template.status = "INACTIVE"

    cloned_template = DeviceBomTemplate(
        device_type=device_type,
        variant_code=variant_code,
        name=payload.name or source_template.name,
        version=payload.target_version,
        is_active=payload.activate,
        status="ACTIVE" if payload.activate else "INACTIVE",
        approved_by=None,
        approved_at=None,
        release_note=None,
    )
    db.add(cloned_template)
    db.flush()

    for source_item in source_items:
        cloned_item = DeviceBomItem(
            template_id=cloned_template.id,
            component_type=source_item.component_type,
            required_part_number=source_item.required_part_number,
            required_revision=source_item.required_revision,
            required_drawing_number=source_item.required_drawing_number,
            required_drawing_revision=source_item.required_drawing_revision,
            quantity_required=source_item.quantity_required,
            is_required=source_item.is_required,
        )
        db.add(cloned_item)
        db.flush()

    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_CREATED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=cloned_template.id,
        result=cloned_template.status,
        message=f"Created BOM template {cloned_template.device_type} v{cloned_template.version}",
        payload={
            "device_type": cloned_template.device_type,
            "variant_code": cloned_template.variant_code,
            "name": cloned_template.name,
            "version": cloned_template.version,
            "is_active": cloned_template.is_active,
            "status": cloned_template.status,
            "created_from_version": source_template.version,
        },
    )
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_CLONED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=cloned_template.id,
        result=cloned_template.status,
        message=(
            f"Cloned BOM template {source_template.device_type} "
            f"v{source_template.version} to v{cloned_template.version}"
        ),
        payload={
            "device_type": cloned_template.device_type,
            "variant_code": cloned_template.variant_code,
            "source_template_id": source_template.id,
            "source_version": source_template.version,
            "target_template_id": cloned_template.id,
            "target_variant_code": cloned_template.variant_code,
            "target_version": cloned_template.version,
            "copied_item_count": len(source_items),
            "status": cloned_template.status,
        },
    )
    for source_item in source_items:
        audit_item = repository.get_bom_item(db, cloned_template.id, source_item.component_type)
        if not audit_item:
            continue
        record_audit_event(
            db,
            event_type="DEVICE_BOM_ITEM_ADDED",
            entity_type="DEVICE_BOM_ITEM",
            entity_id=audit_item.id,
            result="CLONED",
            message=(
                f"Cloned BOM item {source_item.component_type} to "
                f"{cloned_template.device_type} v{cloned_template.version}"
            ),
            payload={
                "device_type": cloned_template.device_type,
                "variant_code": cloned_template.variant_code,
                "version": cloned_template.version,
                "component_type": source_item.component_type,
                "quantity_required": source_item.quantity_required,
                "is_required": source_item.is_required,
                "required_part_number": source_item.required_part_number,
                "required_revision": source_item.required_revision,
                "required_drawing_number": source_item.required_drawing_number,
                "required_drawing_revision": source_item.required_drawing_revision,
                "copied_from_version": source_template.version,
            },
        )

    for deactivated_template in deactivated_templates:
        record_audit_event(
            db,
            event_type="DEVICE_BOM_TEMPLATE_DEACTIVATED",
            entity_type="DEVICE_BOM_TEMPLATE",
            entity_id=deactivated_template.id,
            result="INACTIVE",
            message=(
                f"Deactivated BOM template {deactivated_template.device_type} "
                f"v{deactivated_template.version}"
            ),
            payload={
                "device_type": deactivated_template.device_type,
                "variant_code": deactivated_template.variant_code,
                "version": deactivated_template.version,
                "status": deactivated_template.status,
                "replaced_by_template_id": cloned_template.id,
                "replaced_by_variant_code": cloned_template.variant_code,
                "replaced_by_version": cloned_template.version,
            },
        )
    if cloned_template.is_active:
        record_audit_event(
            db,
            event_type="DEVICE_BOM_TEMPLATE_ACTIVATED",
            entity_type="DEVICE_BOM_TEMPLATE",
            entity_id=cloned_template.id,
            result=cloned_template.status,
            message=(
                f"Activated BOM template {cloned_template.device_type} "
                f"v{cloned_template.version}"
            ),
            payload={
                "device_type": cloned_template.device_type,
                "variant_code": cloned_template.variant_code,
                "version": cloned_template.version,
                "status": cloned_template.status,
                "activated_from_version": source_template.version,
            },
        )

    db.commit()
    db.refresh(cloned_template)
    return cloned_template


def promote_device_bom_template(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplatePromoteRequest,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    source_template = get_device_bom_template_or_404(
        db,
        device_type,
        payload.source_version,
        variant_code,
    )
    if source_template.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Only active BOM template can be promoted")
    _ensure_target_version_progresses(payload.source_version, payload.target_version)

    cloned_template = clone_device_bom_template(
        db,
        device_type,
        DeviceBomTemplateCloneRequest(
            source_version=payload.source_version,
            target_version=payload.target_version,
            name=payload.name,
            activate=True,
        ),
        variant_code,
    )

    refreshed_source = get_device_bom_template_or_404(
        db,
        device_type,
        payload.source_version,
        variant_code,
    )
    refreshed_source.is_active = False
    refreshed_source.status = "RETIRED"
    retire_reason = payload.retire_reason or f"Promoted to version {cloned_template.version}"
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_RETIRED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=refreshed_source.id,
        result=refreshed_source.status,
        message=(
            f"Retired BOM template {refreshed_source.device_type} "
            f"v{refreshed_source.version} after promotion"
        ),
        payload={
            "device_type": refreshed_source.device_type,
            "variant_code": refreshed_source.variant_code,
            "version": refreshed_source.version,
            "status": refreshed_source.status,
            "reason": retire_reason,
            "replaced_by_template_id": cloned_template.id,
            "replaced_by_variant_code": cloned_template.variant_code,
            "replaced_by_version": cloned_template.version,
        },
    )
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_PROMOTED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=cloned_template.id,
        result=cloned_template.status,
        message=(
            f"Promoted BOM template {source_template.device_type} "
            f"from v{source_template.version} to v{cloned_template.version}"
        ),
        payload={
            "device_type": cloned_template.device_type,
            "variant_code": cloned_template.variant_code,
            "source_template_id": refreshed_source.id,
            "source_version": refreshed_source.version,
            "target_template_id": cloned_template.id,
            "target_variant_code": cloned_template.variant_code,
            "target_version": cloned_template.version,
            "retire_reason": retire_reason,
            "status": cloned_template.status,
        },
    )
    db.commit()
    db.refresh(cloned_template)
    return cloned_template


def add_device_bom_item(
    db: Session,
    device_type: str,
    payload: DeviceBomItemCreate,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomItem:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    _ensure_bom_template_is_mutable(db, template)
    if repository.get_bom_item(db, template.id, payload.component_type):
        raise HTTPException(status_code=409, detail="BOM item already exists for component type")
    item = DeviceBomItem(template_id=template.id, **payload.model_dump())
    db.add(item)
    db.flush()
    record_audit_event(
        db,
        event_type="DEVICE_BOM_ITEM_ADDED",
        entity_type="DEVICE_BOM_ITEM",
        entity_id=item.id,
        result="ADDED",
        message=(
            f"Added BOM item {payload.component_type} to "
            f"{template.device_type} v{template.version}"
        ),
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            **payload.model_dump(exclude_none=True),
        },
    )
    db.commit()
    db.refresh(item)
    return item


def update_device_bom_item(
    db: Session,
    device_type: str,
    component_type: str,
    payload: DeviceBomItemUpdate,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomItem:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    _ensure_bom_template_is_mutable(db, template)
    item = repository.get_bom_item(db, template.id, component_type)
    if not item:
        raise HTTPException(status_code=404, detail="BOM item not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return item

    previous_state = {
        "required_part_number": item.required_part_number,
        "required_revision": item.required_revision,
        "required_drawing_number": item.required_drawing_number,
        "required_drawing_revision": item.required_drawing_revision,
        "quantity_required": item.quantity_required,
        "is_required": item.is_required,
    }
    for field_name, value in changes.items():
        setattr(item, field_name, value)

    record_audit_event(
        db,
        event_type="DEVICE_BOM_ITEM_UPDATED",
        entity_type="DEVICE_BOM_ITEM",
        entity_id=item.id,
        result="UPDATED",
        message=(
            f"Updated BOM item {component_type} in "
            f"{template.device_type} v{template.version}"
        ),
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            "component_type": component_type,
            "before": previous_state,
            "after": {
                "required_part_number": item.required_part_number,
                "required_revision": item.required_revision,
                "required_drawing_number": item.required_drawing_number,
                "required_drawing_revision": item.required_drawing_revision,
                "quantity_required": item.quantity_required,
                "is_required": item.is_required,
            },
        },
    )
    db.commit()
    db.refresh(item)
    return item


def delete_device_bom_item(
    db: Session,
    device_type: str,
    component_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomItem:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    _ensure_bom_template_is_mutable(db, template)
    item = repository.get_bom_item(db, template.id, component_type)
    if not item:
        raise HTTPException(status_code=404, detail="BOM item not found")

    removed_snapshot = {
        "component_type": item.component_type,
        "required_part_number": item.required_part_number,
        "required_revision": item.required_revision,
        "required_drawing_number": item.required_drawing_number,
        "required_drawing_revision": item.required_drawing_revision,
        "quantity_required": item.quantity_required,
        "is_required": item.is_required,
    }
    record_audit_event(
        db,
        event_type="DEVICE_BOM_ITEM_REMOVED",
        entity_type="DEVICE_BOM_ITEM",
        entity_id=item.id,
        result="REMOVED",
        message=(
            f"Removed BOM item {component_type} from "
            f"{template.device_type} v{template.version}"
        ),
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            **removed_snapshot,
        },
    )
    db.delete(item)
    db.commit()
    return item


def list_device_bom_items(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> list[DeviceBomItem]:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    return repository.list_bom_items_for_template(db, template.id)


def _resolve_bom_template_for_device(db: Session, device: Device) -> DeviceBomTemplate | None:
    bound_template = repository.get_bound_bom_template_for_device(db, device.device_serial_number)
    if bound_template:
        return bound_template
    active_template = repository.get_active_bom_template_by_device_type(
        db,
        device.device_type,
        device.variant_code,
    )
    if active_template:
        return active_template
    if device.variant_code != "DEFAULT":
        fallback_template = repository.get_active_bom_template_by_device_type(
            db,
            device.device_type,
            "DEFAULT",
        )
        if fallback_template:
            return fallback_template
    if repository.has_bom_templates_for_device_type_and_variant(
        db,
        device.device_type,
        device.variant_code,
    ) or (
        device.variant_code != "DEFAULT"
        and repository.has_bom_templates_for_device_type_and_variant(
            db,
            device.device_type,
            "DEFAULT",
        )
    ):
        raise HTTPException(status_code=400, detail="No active BOM template available for device type")
    return None


def _validate_component_against_bom(
    db: Session,
    device: Device,
    item: ProductionItem,
    component_type: str,
) -> tuple[DeviceBomTemplate | None, DeviceBomItem | None]:
    if item.item_type != component_type:
        raise HTTPException(
            status_code=400,
            detail="Scanned item type does not match requested component type",
        )

    bom_template = _resolve_bom_template_for_device(db, device)
    if not bom_template:
        return None, None

    bom_item = repository.get_bom_item(db, bom_template.id, component_type)
    if not bom_item:
        raise HTTPException(
            status_code=400,
            detail="Component type is not allowed by device BOM",
        )
    if bom_item.required_part_number and item.part_number != bom_item.required_part_number:
        raise HTTPException(
            status_code=400,
            detail="Scanned item part number does not match device BOM",
        )
    if bom_item.required_revision and item.revision != bom_item.required_revision:
        raise HTTPException(
            status_code=400,
            detail="Scanned item revision does not match device BOM",
        )
    if bom_item.required_drawing_number and item.drawing_number != bom_item.required_drawing_number:
        raise HTTPException(
            status_code=400,
            detail="Scanned item drawing number does not match device BOM",
        )
    if bom_item.required_drawing_revision and item.drawing_revision != bom_item.required_drawing_revision:
        raise HTTPException(
            status_code=400,
            detail="Scanned item drawing revision does not match device BOM",
        )
    return bom_template, bom_item


def scan_component_for_assembly(
    db: Session,
    device_serial_number: str,
    payload: AssemblyScanRequest,
) -> AssemblyLink:
    device = get_device_or_404(db, device_serial_number)
    work_session = require_active_work_session(
        db,
        payload.work_session_id,
        operator_id=payload.installed_by,
        workstation_id=payload.workstation_id,
        allowed_roles=PRODUCTION_SESSION_ROLES,
    )
    item = repository.get_production_item_by_barcode(db, payload.child_barcode_value)
    if not item:
        raise HTTPException(status_code=404, detail="Component barcode not found")
    if item.current_status in {"QC_FAILED", "SCRAPPED", "REWORK_REQUIRED"}:
        raise HTTPException(status_code=400, detail="Component status blocks assembly")
    bom_template, bom_item = _validate_component_against_bom(
        db,
        device,
        item,
        payload.component_type,
    )

    existing = repository.get_active_assembly_link_by_barcode(db, payload.child_barcode_value)
    if existing:
        raise HTTPException(status_code=409, detail="Component already installed in another device")
    if bom_item is not None:
        installed_count = repository.count_installed_component_type_for_device(
            db,
            device.device_serial_number,
            payload.component_type,
        )
        if installed_count >= bom_item.quantity_required:
            raise HTTPException(
                status_code=409,
                detail="Device BOM quantity already satisfied for component type",
            )

    scan_event_id = f"SCAN-{uuid.uuid4().hex[:12]}"
    operator_id = payload.installed_by or work_session.operator_id
    workstation_id = payload.workstation_id or work_session.workstation_id
    event = ScanEvent(
        scan_event_id=scan_event_id,
        barcode_value=payload.child_barcode_value,
        operator_id=operator_id,
        workstation_id=workstation_id,
        context="ASSEMBLY_SCAN",
        result="ACCEPTED",
        message=f"Installed as {payload.component_type} in {device_serial_number}",
    )
    link = AssemblyLink(
        parent_device_serial_number=device_serial_number,
        child_item_serial_number=item.item_serial_number,
        child_barcode_value=item.barcode_value,
        component_type=payload.component_type,
        installed_by=operator_id,
        workstation_id=workstation_id,
        scan_event_id=scan_event_id,
        bom_template_id=bom_template.id if bom_template else None,
        bom_version=bom_template.version if bom_template else None,
    )
    item.current_status = "INSTALLED"
    db.add(event)
    db.add(link)
    record_audit_event(
        db,
        event_type="ASSEMBLY_COMPONENT_INSTALLED",
        entity_type="ASSEMBLY_LINK",
        entity_id=scan_event_id,
        work_session=work_session,
        operator_id=operator_id,
        workstation_id=workstation_id,
        result=link.status,
        message=f"Installed {item.item_serial_number} into {device_serial_number}",
        payload={
            **payload.model_dump(exclude_none=True),
            "bom_template_id": bom_template.id if bom_template else None,
            "bom_version": bom_template.version if bom_template else None,
        },
    )
    db.commit()
    db.refresh(link)
    return link


def get_assembly_tree(db: Session, device_serial_number: str) -> list[AssemblyLink]:
    get_device_or_404(db, device_serial_number)
    return repository.list_assembly_links_for_device(db, device_serial_number)
