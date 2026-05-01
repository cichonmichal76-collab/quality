import uuid
from datetime import datetime

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
from app.modules.assembly.bom_groups import build_bom_requirement_groups, evaluate_bom_requirement_groups
from app.modules.assembly import repository
from app.schemas import (
    AssemblyScanRequest,
    ComponentCreate,
    DeviceBomComplianceRead,
    DeviceBomResolutionRead,
    DeviceBomComponentCoverageRead,
    DeviceBomTemplateBindingRead,
    DeviceBomTemplateCatalogEntryRead,
    DeviceBomTemplateCoverageRead,
    DeviceBomItemDiffRead,
    DeviceBomTemplateActivateRequest,
    DeviceBomTemplateApproveRequest,
    DeviceBomTemplateCloneRequest,
    DeviceBomTemplateLineageNodeRead,
    DeviceBomTemplateLineageRead,
    DeviceBomItemSnapshotRead,
    DeviceBomTemplatePromoteRequest,
    DeviceBomTemplateRevokeApprovalRequest,
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


def _validate_effective_window(
    effective_from: datetime | None,
    effective_to: datetime | None,
) -> None:
    if effective_from and effective_to and effective_to < effective_from:
        raise HTTPException(
            status_code=400,
            detail="BOM template effective_to must be greater than or equal to effective_from",
        )


def _is_bom_template_effective_now(
    template: DeviceBomTemplate,
    reference_time: datetime | None = None,
) -> bool:
    now = reference_time or utc_now()
    if template.effective_from and template.effective_from > now:
        return False
    if template.effective_to and template.effective_to < now:
        return False
    return True


def _resolve_effective_window_for_versioned_copy(
    source_template: DeviceBomTemplate,
    payload: DeviceBomTemplateCloneRequest | DeviceBomTemplatePromoteRequest,
) -> tuple[datetime | None, datetime | None]:
    effective_from = (
        payload.effective_from
        if "effective_from" in payload.model_fields_set
        else source_template.effective_from
    )
    effective_to = (
        payload.effective_to
        if "effective_to" in payload.model_fields_set
        else source_template.effective_to
    )
    _validate_effective_window(effective_from, effective_to)
    return effective_from, effective_to


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


def resolve_bom_template_context(
    db: Session,
    device: Device,
) -> tuple[DeviceBomTemplate | None, str, str | None, bool, bool]:
    has_variant_templates = repository.has_bom_templates_for_device_type_and_variant(
        db,
        device.device_type,
        device.variant_code,
    )
    has_default_templates = repository.has_bom_templates_for_device_type_and_variant(
        db,
        device.device_type,
        "DEFAULT",
    )

    bound_template = repository.get_bound_bom_template_for_device(db, device.device_serial_number)
    if bound_template:
        return (
            bound_template,
            "BOUND_TEMPLATE",
            None,
            has_variant_templates,
            has_default_templates,
        )

    active_template = repository.get_active_bom_template_by_device_type(
        db,
        device.device_type,
        device.variant_code,
    )
    if active_template:
        return (
            active_template,
            "ACTIVE_VARIANT",
            None,
            has_variant_templates,
            has_default_templates,
        )

    if device.variant_code != "DEFAULT":
        fallback_template = repository.get_active_bom_template_by_device_type(
            db,
            device.device_type,
            "DEFAULT",
        )
        if fallback_template:
            return (
                fallback_template,
                "ACTIVE_DEFAULT_FALLBACK",
                None,
                has_variant_templates,
                has_default_templates,
            )

    if has_variant_templates or (device.variant_code != "DEFAULT" and has_default_templates):
        return (
            None,
            "NO_ACTIVE_EFFECTIVE_TEMPLATE",
            "No active effective BOM template available for device type",
            has_variant_templates,
            has_default_templates,
        )

    return (
        None,
        "NO_TEMPLATE_CONFIGURED",
        None,
        has_variant_templates,
        has_default_templates,
    )


def get_device_bom_resolution(
    db: Session,
    device_serial_number: str,
) -> DeviceBomResolutionRead:
    device = get_device_or_404(db, device_serial_number)
    template, resolution_source, blocking_reason, has_variant_templates, has_default_templates = (
        resolve_bom_template_context(db, device)
    )

    return DeviceBomResolutionRead(
        device_serial_number=device.device_serial_number,
        device_type=device.device_type,
        device_variant_code=device.variant_code,
        resolution_source=resolution_source,
        resolved_template_id=template.id if template else None,
        resolved_variant_code=template.variant_code if template else None,
        resolved_version=template.version if template else None,
        resolved_status=template.status if template else None,
        resolved_is_active=template.is_active if template else False,
        resolved_is_effective_now=_is_bom_template_effective_now(template) if template else False,
        is_bound_template=resolution_source == "BOUND_TEMPLATE",
        is_default_fallback=resolution_source == "ACTIVE_DEFAULT_FALLBACK",
        has_variant_templates=has_variant_templates,
        has_default_templates=has_default_templates,
        blocks_assembly=resolution_source == "NO_ACTIVE_EFFECTIVE_TEMPLATE",
        blocks_shipment=resolution_source == "NO_ACTIVE_EFFECTIVE_TEMPLATE",
        blocking_reason=blocking_reason,
    )


def _evaluate_installed_components_against_bom(
    bom_items: list[DeviceBomItem],
    installed_links: list[AssemblyLink],
) -> tuple[
    list[DeviceBomComponentCoverageRead],
    list[str],
    list[str],
    list[str],
]:
    installed_counts: dict[str, int] = {}
    for link in installed_links:
        installed_counts[link.component_type] = installed_counts.get(link.component_type, 0) + 1

    component_coverage: list[DeviceBomComponentCoverageRead] = []
    missing_required_components: list[str] = []
    over_installed_components: list[str] = []
    unexpected_component_types: list[str] = []

    evaluations, remaining_counts = evaluate_bom_requirement_groups(bom_items, installed_counts)

    for evaluation in evaluations:
        requirement = evaluation.requirement
        if requirement.is_required and evaluation.installed_quantity < requirement.quantity_required:
            if requirement.quantity_required == 1:
                missing_required_components.append(requirement.display_name)
            else:
                missing_required_components.append(
                    f"{requirement.display_name} x{requirement.quantity_required}"
                )
        if evaluation.installed_quantity > requirement.quantity_required:
            over_installed_components.append(
                f"{requirement.display_name} x{evaluation.installed_quantity}/{requirement.quantity_required}"
            )

        component_coverage.append(
            DeviceBomComponentCoverageRead(
                component_type=requirement.component_type,
                substitution_group=requirement.substitution_group,
                allowed_component_types=requirement.allowed_component_types,
                required_quantity=requirement.quantity_required,
                installed_quantity=evaluation.installed_quantity,
                is_required=requirement.is_required,
                status=evaluation.status,
            )
        )

    for unexpected_component_type, installed_quantity in sorted(remaining_counts.items()):
        unexpected_component_types.append(unexpected_component_type)
        component_coverage.append(
            DeviceBomComponentCoverageRead(
                component_type=unexpected_component_type,
                substitution_group=None,
                allowed_component_types=[unexpected_component_type],
                required_quantity=0,
                installed_quantity=installed_quantity,
                is_required=False,
                status="UNEXPECTED",
            )
        )

    return (
        component_coverage,
        missing_required_components,
        over_installed_components,
        unexpected_component_types,
    )


def _build_device_bom_compliance(
    db: Session,
    device: Device,
    template: DeviceBomTemplate | None,
    resolution_source: str,
    blocking_reason: str | None,
) -> DeviceBomComplianceRead:
    installed_links = repository.list_installed_assembly_links_for_device(
        db,
        device.device_serial_number,
    )
    installed_component_count = len(installed_links)

    if template is None:
        return DeviceBomComplianceRead(
            device_serial_number=device.device_serial_number,
            device_type=device.device_type,
            device_variant_code=device.variant_code,
            production_status=device.production_status,
            resolution_source=resolution_source,
            is_bom_resolved=False,
            passes_bom_gate=blocking_reason is None,
            installed_component_count=installed_component_count,
            missing_required_components=[],
            over_installed_components=[],
            unexpected_component_types=[],
            component_coverage=[],
            blocking_reason=blocking_reason,
        )

    bom_items = repository.list_bom_items_for_template(db, template.id)
    if not bom_items:
        return DeviceBomComplianceRead(
            device_serial_number=device.device_serial_number,
            device_type=device.device_type,
            device_variant_code=device.variant_code,
            production_status=device.production_status,
            resolution_source=resolution_source,
            resolved_template_id=template.id,
            resolved_variant_code=template.variant_code,
            resolved_version=template.version,
            resolved_status=template.status,
            resolved_is_active=template.is_active,
            resolved_is_effective_now=_is_bom_template_effective_now(template),
            is_bom_resolved=True,
            passes_bom_gate=True,
            installed_component_count=installed_component_count,
            missing_required_components=[],
            over_installed_components=[],
            unexpected_component_types=[],
            component_coverage=[],
            blocking_reason=blocking_reason,
        )

    (
        component_coverage,
        missing_required_components,
        over_installed_components,
        unexpected_component_types,
    ) = _evaluate_installed_components_against_bom(bom_items, installed_links)

    return DeviceBomComplianceRead(
        device_serial_number=device.device_serial_number,
        device_type=device.device_type,
        device_variant_code=device.variant_code,
        production_status=device.production_status,
        resolution_source=resolution_source,
        resolved_template_id=template.id,
        resolved_variant_code=template.variant_code,
        resolved_version=template.version,
        resolved_status=template.status,
        resolved_is_active=template.is_active,
        resolved_is_effective_now=_is_bom_template_effective_now(template),
        is_bom_resolved=True,
        passes_bom_gate=not missing_required_components
        and not over_installed_components
        and not unexpected_component_types,
        installed_component_count=installed_component_count,
        missing_required_components=missing_required_components,
        over_installed_components=over_installed_components,
        unexpected_component_types=unexpected_component_types,
        component_coverage=component_coverage,
        blocking_reason=blocking_reason,
    )


def get_device_bom_compliance(
    db: Session,
    device_serial_number: str,
) -> DeviceBomComplianceRead:
    device = get_device_or_404(db, device_serial_number)
    template, resolution_source, blocking_reason, _, _ = resolve_bom_template_context(db, device)
    return _build_device_bom_compliance(
        db,
        device,
        template,
        resolution_source,
        blocking_reason,
    )


def create_device_bom_template(db: Session, payload: DeviceBomTemplateCreate) -> DeviceBomTemplate:
    _validate_effective_window(payload.effective_from, payload.effective_to)
    if payload.is_active:
        raise HTTPException(
            status_code=400,
            detail="BOM template cannot be created active; create it inactive, add items, then release it",
        )
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
    template = DeviceBomTemplate(
        **payload.model_dump(exclude={"is_active"}),
        status="INACTIVE",
        is_active=False,
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
            **payload.model_dump(mode="json"),
            "status": template.status,
        },
    )
    db.commit()
    db.refresh(template)
    return template


def list_device_bom_templates(db: Session) -> list[DeviceBomTemplate]:
    return repository.list_bom_templates(db)


def _get_bom_template_recommended_action(template: DeviceBomTemplate) -> str:
    if template.status == "RETIRED":
        return "clone"
    if template.status == "ACTIVE":
        return "clone_or_promote"
    if template.status == "APPROVED":
        return "activate_or_modify"
    return "modify_or_approve"


def _get_bom_template_activation_status_blockers(template: DeviceBomTemplate) -> list[str]:
    if template.status == "ACTIVE":
        return ["BOM template is already active"]
    if template.status == "RETIRED":
        return ["Retired BOM template cannot be activated"]
    return []


def _get_bom_template_release_status_blockers(template: DeviceBomTemplate) -> list[str]:
    if template.status == "ACTIVE":
        return ["Active BOM template is already released"]
    if template.status == "RETIRED":
        return ["Retired BOM template cannot be released"]
    return []


def _build_device_bom_template_catalog_entry(
    db: Session,
    template: DeviceBomTemplate,
) -> DeviceBomTemplateCatalogEntryRead:
    bound_device_count = repository.count_bound_devices_for_template(db, template.id)
    is_bound = bound_device_count > 0
    can_modify = template.status in {"INACTIVE", "APPROVED"}
    recommended_action = _get_bom_template_recommended_action(template)
    item_count, required_item_count, is_effective_now, release_blocking_reasons = (
        _evaluate_bom_template_requirements(
            db,
            template,
            require_approval=False,
        )
    )
    activation_readiness = _evaluate_bom_template_readiness(db, template)
    activation_blocking_reasons = list(activation_readiness.blocking_reasons)

    activation_status_blockers = _get_bom_template_activation_status_blockers(template)
    if activation_status_blockers:
        activation_blocking_reasons = activation_status_blockers

    release_status_blockers = _get_bom_template_release_status_blockers(template)
    if release_status_blockers:
        release_blocking_reasons = release_status_blockers
    elif template.status == "APPROVED":
        release_blocking_reasons = list(activation_blocking_reasons)

    return DeviceBomTemplateCatalogEntryRead(
        template_id=template.id,
        device_type=template.device_type,
        variant_code=template.variant_code,
        version=template.version,
        status=template.status,
        is_active=template.is_active,
        is_approved=template.approved_at is not None,
        approved_by=template.approved_by,
        approved_at=template.approved_at,
        release_note=template.release_note,
        effective_from=template.effective_from,
        effective_to=template.effective_to,
        is_effective_now=is_effective_now,
        created_at=template.created_at,
        item_count=item_count,
        required_item_count=required_item_count,
        has_any_items=item_count > 0,
        bound_device_count=bound_device_count,
        is_bound=is_bound,
        can_modify=can_modify,
        can_activate=not activation_blocking_reasons,
        can_release=not release_blocking_reasons,
        recommended_action=recommended_action,
        activation_blocking_reasons=activation_blocking_reasons,
        release_blocking_reasons=release_blocking_reasons,
    )


def list_device_bom_template_catalog(
    db: Session,
    device_type: str,
    variant_code: str = "DEFAULT",
) -> list[DeviceBomTemplateCatalogEntryRead]:
    templates = repository.list_bom_templates_for_device_type_and_variant(
        db,
        device_type,
        variant_code,
    )
    return [
        _build_device_bom_template_catalog_entry(db, template)
        for template in templates
    ]


def _to_bom_lineage_node(template: DeviceBomTemplate) -> DeviceBomTemplateLineageNodeRead:
    return DeviceBomTemplateLineageNodeRead(
        template_id=template.id,
        device_type=template.device_type,
        variant_code=template.variant_code,
        version=template.version,
        status=template.status,
        is_active=template.is_active,
        source_template_id=template.source_template_id,
        replaced_by_template_id=template.replaced_by_template_id,
        approved_at=template.approved_at,
        effective_from=template.effective_from,
        effective_to=template.effective_to,
    )


def get_device_bom_template_lineage(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplateLineageRead:
    focus_template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    all_templates = repository.list_bom_templates_for_device_type_and_variant(
        db,
        focus_template.device_type,
        focus_template.variant_code,
    )
    by_id = {template.id: template for template in all_templates}

    ancestors: list[DeviceBomTemplateLineageNodeRead] = []
    ancestor_id = focus_template.source_template_id
    while ancestor_id:
        ancestor = by_id.get(ancestor_id)
        if ancestor is None:
            break
        ancestors.append(_to_bom_lineage_node(ancestor))
        ancestor_id = ancestor.source_template_id

    descendants: list[DeviceBomTemplateLineageNodeRead] = []
    queue = [template for template in all_templates if template.source_template_id == focus_template.id]
    seen_template_ids = {focus_template.id}
    while queue:
        current = queue.pop(0)
        if current.id in seen_template_ids:
            continue
        seen_template_ids.add(current.id)
        descendants.append(_to_bom_lineage_node(current))
        queue.extend(
            template for template in all_templates if template.source_template_id == current.id
        )

    replacement = None
    if focus_template.replaced_by_template_id:
        replacement_template = by_id.get(focus_template.replaced_by_template_id)
        if replacement_template is not None:
            replacement = _to_bom_lineage_node(replacement_template)

    return DeviceBomTemplateLineageRead(
        focus=_to_bom_lineage_node(focus_template),
        ancestors=ancestors,
        descendants=descendants,
        replacement=replacement,
    )


def get_device_bom_template_usage(
    db: Session,
    device_type: str,
    version: str | None = None,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplateUsageRead:
    template = get_device_bom_template_or_404(db, device_type, version, variant_code)
    bound_device_count = repository.count_bound_devices_for_template(db, template.id)
    is_bound = bound_device_count > 0
    can_modify = template.status in {"INACTIVE", "APPROVED"}
    is_effective_now = _is_bom_template_effective_now(template)
    recommended_action = _get_bom_template_recommended_action(template)

    return DeviceBomTemplateUsageRead(
        template_id=template.id,
        device_type=template.device_type,
        variant_code=template.variant_code,
        version=template.version,
        status=template.status,
        is_active=template.is_active,
        is_approved=template.approved_at is not None,
        effective_from=template.effective_from,
        effective_to=template.effective_to,
        is_effective_now=is_effective_now,
        bound_device_count=bound_device_count,
        is_bound=is_bound,
        can_modify=can_modify,
        recommended_action=recommended_action,
    )


def _evaluate_bom_template_readiness(
    db: Session,
    template: DeviceBomTemplate,
) -> DeviceBomTemplateReadinessRead:
    item_count, required_item_count, is_effective_now, blocking_reasons = _evaluate_bom_template_requirements(
        db,
        template,
        require_approval=True,
    )
    now = utc_now()
    if template.effective_to and template.effective_to < now and "BOM template effectivity window already ended" not in blocking_reasons:
        blocking_reasons.append("BOM template effectivity window already ended")
    if template.approved_at is None and "BOM template is not approved" not in blocking_reasons:
        blocking_reasons.append("BOM template is not approved")
    return DeviceBomTemplateReadinessRead(
        template_id=template.id,
        device_type=template.device_type,
        variant_code=template.variant_code,
        version=template.version,
        status=template.status,
        is_active=template.is_active,
        is_approved=template.approved_at is not None,
        effective_from=template.effective_from,
        effective_to=template.effective_to,
        is_effective_now=is_effective_now,
        item_count=item_count,
        required_item_count=required_item_count,
        has_any_items=item_count > 0,
        can_activate=not blocking_reasons,
        blocking_reasons=blocking_reasons,
    )


def _evaluate_bom_template_requirements(
    db: Session,
    template: DeviceBomTemplate,
    require_approval: bool,
) -> tuple[int, int, bool, list[str]]:
    items = repository.list_bom_items_for_template(db, template.id)
    item_count = len(items)
    required_item_count = sum(1 for item in items if item.is_required)
    now = utc_now()
    is_effective_now = _is_bom_template_effective_now(template, now)
    blocking_reasons: list[str] = []
    if item_count == 0:
        blocking_reasons.append("BOM template has no items")
    if required_item_count == 0:
        blocking_reasons.append("BOM template has no required items")
    if template.effective_to and template.effective_to < now:
        blocking_reasons.append("BOM template effectivity window already ended")
    if require_approval and template.approved_at is None:
        blocking_reasons.append("BOM template is not approved")
    return item_count, required_item_count, is_effective_now, blocking_reasons


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
        bom_items = repository.list_bom_items_for_template(db, template.id)
        (
            component_coverage,
            missing_required_components,
            over_installed_components,
            unexpected_component_types,
        ) = _evaluate_installed_components_against_bom(bom_items, installed_links)

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
                is_complete=not missing_required_components
                and not over_installed_components
                and not unexpected_component_types,
                missing_required_components=missing_required_components,
                over_installed_components=over_installed_components,
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
    if template.status == "ACTIVE":
        raise HTTPException(status_code=400, detail="Active BOM template cannot be approved again")
    if template.status == "APPROVED":
        raise HTTPException(status_code=400, detail="BOM template is already approved")
    _, _, _, blocking_reasons = _evaluate_bom_template_requirements(
        db,
        template,
        require_approval=False,
    )
    if blocking_reasons:
        raise HTTPException(
            status_code=400,
            detail="BOM template is not ready for approval: " + "; ".join(blocking_reasons),
        )
    template.status = "APPROVED"
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


def revoke_device_bom_template_approval(
    db: Session,
    device_type: str,
    payload: DeviceBomTemplateRevokeApprovalRequest,
    variant_code: str = "DEFAULT",
) -> DeviceBomTemplate:
    template = get_device_bom_template_or_404(db, device_type, payload.version, variant_code)
    if template.status == "RETIRED":
        raise HTTPException(status_code=400, detail="Retired BOM template cannot have approval revoked")
    if template.status == "ACTIVE":
        raise HTTPException(status_code=400, detail="Active BOM template cannot have approval revoked")
    if template.status != "APPROVED" or template.approved_at is None:
        raise HTTPException(status_code=400, detail="BOM template is not approved")

    previous_approval = {
        "approved_by": template.approved_by,
        "approved_at": template.approved_at.isoformat() if template.approved_at else None,
        "release_note": template.release_note,
    }
    template.status = "INACTIVE"
    template.approved_by = None
    template.approved_at = None
    template.release_note = None
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_APPROVAL_REVOKED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=template.id,
        result=template.status,
        message=f"Revoked approval for BOM template {template.device_type} v{template.version}",
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            "reason": payload.reason,
            "previous_approval": previous_approval,
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
    template = get_device_bom_template_or_404(db, device_type, payload.version, variant_code)
    if template.status == "RETIRED":
        raise HTTPException(status_code=400, detail="Retired BOM template cannot be released")
    if template.status == "ACTIVE":
        raise HTTPException(status_code=400, detail="Active BOM template is already released")
    if template.status == "INACTIVE":
        if payload.approved_by is None:
            raise HTTPException(
                status_code=400,
                detail="Release requires approved_by when BOM template is not yet approved",
            )
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
    elif template.status == "APPROVED":
        if (
            payload.approved_by is not None
            and template.approved_by is not None
            and payload.approved_by != template.approved_by
        ):
            raise HTTPException(
                status_code=400,
                detail="Release approved_by does not match existing BOM approval",
            )
        if template.release_note is None and payload.release_note is not None:
            template.release_note = payload.release_note
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
        substitution_group=item.substitution_group,
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
    if template.status == "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail="Active BOM template cannot be modified; use clone or promote",
        )


def _clear_inactive_bom_template_approval(
    db: Session,
    template: DeviceBomTemplate,
    mutation_type: str,
    component_type: str | None = None,
) -> None:
    if template.status not in {"INACTIVE", "APPROVED"} or template.approved_at is None:
        return
    previous_approval = {
        "approved_by": template.approved_by,
        "approved_at": template.approved_at.isoformat() if template.approved_at else None,
        "release_note": template.release_note,
    }
    template.status = "INACTIVE"
    template.approved_by = None
    template.approved_at = None
    template.release_note = None
    record_audit_event(
        db,
        event_type="DEVICE_BOM_TEMPLATE_APPROVAL_CLEARED",
        entity_type="DEVICE_BOM_TEMPLATE",
        entity_id=template.id,
        result=template.status,
        message=(
            f"Cleared approval for BOM template {template.device_type} v{template.version} "
            f"after {mutation_type.lower()}"
        ),
        payload={
            "device_type": template.device_type,
            "variant_code": template.variant_code,
            "version": template.version,
            "mutation_type": mutation_type,
            "component_type": component_type,
            "previous_approval": previous_approval,
        },
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
            result=deactivated_template.status,
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
    effective_from, effective_to = _resolve_effective_window_for_versioned_copy(
        source_template,
        payload,
    )
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
        if payload.approved_by is None:
            raise HTTPException(
                status_code=400,
                detail="Cloned BOM template requires approved_by when activate=true",
            )
        candidate_readiness = _evaluate_bom_template_readiness(db, source_template)
        blocking_reasons = list(candidate_readiness.blocking_reasons)
        blocking_reasons = [
            reason
            for reason in blocking_reasons
            if reason != "BOM template is not approved"
        ]
        if effective_to and effective_to < utc_now():
            blocking_reasons.append("BOM template effectivity window already ended")
        if blocking_reasons:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cloned BOM template would not be ready for activation: "
                    + "; ".join(blocking_reasons)
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
            active_template.status = "APPROVED" if active_template.approved_at is not None else "INACTIVE"

    cloned_template = DeviceBomTemplate(
        device_type=device_type,
        variant_code=variant_code,
        name=payload.name or source_template.name,
        version=payload.target_version,
        is_active=payload.activate,
        status="ACTIVE" if payload.activate else "INACTIVE",
        source_template_id=source_template.id,
        replaced_by_template_id=None,
        approved_by=payload.approved_by if payload.activate else None,
        approved_at=utc_now() if payload.activate and payload.approved_by else None,
        release_note=payload.release_note if payload.activate else None,
        effective_from=effective_from,
        effective_to=effective_to,
    )
    db.add(cloned_template)
    db.flush()

    for source_item in source_items:
        cloned_item = DeviceBomItem(
            template_id=cloned_template.id,
            component_type=source_item.component_type,
            substitution_group=source_item.substitution_group,
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
            "effective_from": (
                cloned_template.effective_from.isoformat()
                if cloned_template.effective_from
                else None
            ),
            "effective_to": (
                cloned_template.effective_to.isoformat()
                if cloned_template.effective_to
                else None
            ),
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
            "effective_from": (
                cloned_template.effective_from.isoformat()
                if cloned_template.effective_from
                else None
            ),
            "effective_to": (
                cloned_template.effective_to.isoformat()
                if cloned_template.effective_to
                else None
            ),
        },
    )
    if cloned_template.approved_at is not None:
        record_audit_event(
            db,
            event_type="DEVICE_BOM_TEMPLATE_APPROVED",
            entity_type="DEVICE_BOM_TEMPLATE",
            entity_id=cloned_template.id,
            result=cloned_template.status,
            message=(
                f"Approved cloned BOM template {cloned_template.device_type} "
                f"v{cloned_template.version}"
            ),
            payload={
                "device_type": cloned_template.device_type,
                "variant_code": cloned_template.variant_code,
                "version": cloned_template.version,
                "approved_by": cloned_template.approved_by,
                "approved_at": (
                    cloned_template.approved_at.isoformat()
                    if cloned_template.approved_at
                    else None
                ),
                "release_note": cloned_template.release_note,
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
                "substitution_group": source_item.substitution_group,
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
            result=deactivated_template.status,
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
            approved_by=payload.approved_by,
            release_note=payload.release_note,
            effective_from=payload.effective_from,
            effective_to=payload.effective_to,
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
    refreshed_source.replaced_by_template_id = cloned_template.id
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
    _validate_substitution_group_consistency(
        db,
        template.id,
        payload.component_type,
        payload.substitution_group,
        payload.quantity_required,
        payload.is_required,
    )
    item = DeviceBomItem(template_id=template.id, **payload.model_dump())
    db.add(item)
    db.flush()
    _clear_inactive_bom_template_approval(
        db,
        template,
        mutation_type="BOM_ITEM_ADDED",
        component_type=payload.component_type,
    )
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
        "substitution_group": item.substitution_group,
        "required_part_number": item.required_part_number,
        "required_revision": item.required_revision,
        "required_drawing_number": item.required_drawing_number,
        "required_drawing_revision": item.required_drawing_revision,
        "quantity_required": item.quantity_required,
        "is_required": item.is_required,
    }
    for field_name, value in changes.items():
        setattr(item, field_name, value)
    _validate_substitution_group_consistency(
        db,
        template.id,
        item.component_type,
        item.substitution_group,
        item.quantity_required,
        item.is_required,
    )
    _clear_inactive_bom_template_approval(
        db,
        template,
        mutation_type="BOM_ITEM_UPDATED",
        component_type=component_type,
    )

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
                "substitution_group": item.substitution_group,
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
        "substitution_group": item.substitution_group,
        "required_part_number": item.required_part_number,
        "required_revision": item.required_revision,
        "required_drawing_number": item.required_drawing_number,
        "required_drawing_revision": item.required_drawing_revision,
        "quantity_required": item.quantity_required,
        "is_required": item.is_required,
    }
    _clear_inactive_bom_template_approval(
        db,
        template,
        mutation_type="BOM_ITEM_REMOVED",
        component_type=component_type,
    )
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
    template, _, blocking_reason, _, _ = resolve_bom_template_context(db, device)
    if blocking_reason:
        raise HTTPException(
            status_code=400,
            detail=blocking_reason,
        )
    return template


def _validate_substitution_group_consistency(
    db: Session,
    template_id: str,
    component_type: str,
    substitution_group: str | None,
    quantity_required: int,
    is_required: bool,
) -> None:
    if not substitution_group:
        return
    peer_items = [
        item
        for item in repository.list_bom_items_for_template(db, template_id)
        if item.component_type != component_type and item.substitution_group == substitution_group
    ]
    if not peer_items:
        return
    reference_item = peer_items[0]
    if (
        reference_item.quantity_required != quantity_required
        or reference_item.is_required != is_required
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "All BOM items in the same substitution group must share "
                "quantity_required and is_required"
            ),
        )


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
    existing = repository.get_active_assembly_link_by_barcode(db, payload.child_barcode_value)
    if existing:
        raise HTTPException(status_code=409, detail="Component already installed in another device")
    if item.current_status != "QC_PASSED":
        raise HTTPException(status_code=400, detail="Component must be QC_PASSED before assembly")
    critical_component_ncr_ids = repository.list_critical_open_ncr_ids_for_component(
        db,
        item.item_serial_number,
    )
    if critical_component_ncr_ids:
        raise HTTPException(
            status_code=400,
            detail="Component has open critical NCR and cannot be assembled",
        )
    bom_template, bom_item = _validate_component_against_bom(
        db,
        device,
        item,
        payload.component_type,
    )
    if bom_item is not None:
        assert bom_template is not None
        installed_links = repository.list_installed_assembly_links_for_device(
            db,
            device.device_serial_number,
        )
        installed_counts: dict[str, int] = {}
        for link in installed_links:
            installed_counts[link.component_type] = installed_counts.get(link.component_type, 0) + 1
        requirement = next(
            group
            for group in build_bom_requirement_groups(
                repository.list_bom_items_for_template(db, bom_template.id)
            )
            if payload.component_type in group.allowed_component_types
        )
        installed_count = sum(
            installed_counts.get(allowed_component_type, 0)
            for allowed_component_type in requirement.allowed_component_types
        )
        if installed_count >= requirement.quantity_required:
            if requirement.substitution_group:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Device BOM quantity already satisfied for substitution group "
                        f"{requirement.substitution_group}"
                    ),
                )
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
        component_qc_passed=True,
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
            "component_qc_passed": True,
            "component_critical_open_ncr_ids": [],
        },
    )
    db.commit()
    db.refresh(link)
    return link


def get_assembly_tree(db: Session, device_serial_number: str) -> list[AssemblyLink]:
    get_device_or_404(db, device_serial_number)
    return repository.list_assembly_links_for_device(db, device_serial_number)
