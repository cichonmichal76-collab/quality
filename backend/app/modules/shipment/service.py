from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import AuditEvent, Device
from app.modules.assembly.service import get_device_bom_compliance
from app.modules.shipment import repository, rules
from app.schemas import (
    DeviceComponentPrimaryQualityStatusSummaryRead,
    DeviceComponentQualityRead,
    DeviceComponentQualityQueueRead,
    DeviceComponentQualityStatusSummaryRead,
    DeviceComponentTypeSummaryRead,
    DeviceShipmentActionSummaryRead,
    DeviceBomComplianceRead,
    DeviceShipmentBlockingCheckRead,
    DeviceInstalledComponentQualityRead,
    DeviceShipmentBlockingSummaryRead,
    DeviceShipmentLatestDecisionRead,
    DeviceShipmentLatestDecisionSummaryRead,
    DeviceShipmentProductionStatusSummaryRead,
    DeviceShipmentQueueRead,
    DeviceShipmentReadinessRead,
    DeviceStatusUpdate,
    DeviceVariantCodeSummaryRead,
)

READY_FOR_SHIPMENT_REQUIRES_FINAL_TEST = "READY_FOR_SHIPMENT requires FINAL_TEST_PASSED"
READY_FOR_SHIPMENT_REQUIRES_ACTIVE_BOM = "READY_FOR_SHIPMENT requires an active effective BOM template"
READY_FOR_SHIPMENT_BLOCKED_BY_NCR = "Open critical NCR blocks shipment"
READY_FOR_SHIPMENT_REQUIRES_COMPONENT_QC = "READY_FOR_SHIPMENT requires installed components with QC_PASSED"
READY_FOR_SHIPMENT_BLOCKED_BY_COMPONENT_NCR = (
    "Open critical NCR on installed components blocks shipment"
)
FINAL_TEST_NOT_PASSED_CODE = "FINAL_TEST_NOT_PASSED"
BOM_TEMPLATE_NOT_EFFECTIVE_CODE = "BOM_TEMPLATE_NOT_EFFECTIVE"
BOM_REQUIRED_COMPONENTS_MISSING_CODE = "BOM_REQUIRED_COMPONENTS_MISSING"
BOM_OVER_INSTALLED_COMPONENTS_CODE = "BOM_OVER_INSTALLED_COMPONENTS"
BOM_UNEXPECTED_COMPONENTS_CODE = "BOM_UNEXPECTED_COMPONENTS"
CRITICAL_OPEN_NCR_CODE = "CRITICAL_OPEN_NCR"
COMPONENT_QC_NOT_PASSED_CODE = "COMPONENT_QC_NOT_PASSED"
COMPONENT_CRITICAL_OPEN_NCR_CODE = "COMPONENT_CRITICAL_OPEN_NCR"
MARK_READY_FOR_SHIPMENT_ACTION = "MARK_READY_FOR_SHIPMENT"
RESOLVE_CRITICAL_NCR_ACTION = "RESOLVE_CRITICAL_NCR"
RESOLVE_COMPONENT_QUALITY_ACTION = "RESOLVE_COMPONENT_QUALITY"
ACTIVATE_OR_CONFIGURE_BOM_ACTION = "ACTIVATE_OR_CONFIGURE_BOM"
FIX_ASSEMBLY_MISMATCH_ACTION = "FIX_ASSEMBLY_MISMATCH"
COMPLETE_ASSEMBLY_ACTION = "COMPLETE_ASSEMBLY"
RUN_FINAL_TEST_ACTION = "RUN_FINAL_TEST"
VALID_QUEUE_SORT_FIELDS = {"created_at", "device_serial_number", "priority", "recommended_action"}
VALID_COMPONENT_QUALITY_SORT_FIELDS = {
    "device_serial_number",
    "blocked_components",
    "production_status",
    "variant_code",
    "recommended_action",
}
MAX_QUEUE_LIMIT = 500
MAX_SHIPMENT_GATE_HISTORY_LIMIT = 200
VALID_LATEST_GATE_RESULTS = {"PASS", "BLOCKED", "NONE"}
VALID_COMPONENT_QUALITY_STATUSES = {"PASS", "QC_NOT_PASSED", "CRITICAL_NCR_OPEN"}
RESOLVE_COMPONENT_NCR_ACTION = "RESOLVE_COMPONENT_NCR"
RUN_COMPONENT_QC_OR_REWORK_ACTION = "RUN_COMPONENT_QC_OR_REWORK"
NO_COMPONENT_ACTION = "NO_ACTION"
VALID_COMPONENT_QUALITY_RECOMMENDED_ACTIONS = {
    RESOLVE_COMPONENT_NCR_ACTION,
    RUN_COMPONENT_QC_OR_REWORK_ACTION,
    NO_COMPONENT_ACTION,
}


def get_device_or_404(db: Session, serial_number: str) -> Device:
    device = repository.get_device_by_serial_number(db, serial_number)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def _build_shipment_gate_audit_payload(
    device: Device,
    readiness: DeviceShipmentReadinessRead,
    *,
    requested_status: str,
) -> dict:
    component_qc_blocking_details = next(
        (
            check.details
            for check in readiness.blocking_checks
            if check.code == COMPONENT_QC_NOT_PASSED_CODE
        ),
        [],
    )
    component_ncr_blocking_details = next(
        (
            check.details
            for check in readiness.blocking_checks
            if check.code == COMPONENT_CRITICAL_OPEN_NCR_CODE
        ),
        [],
    )
    return {
        "requested_status": requested_status,
        "current_status_before": device.production_status,
        "can_transition_to_ready_for_shipment": readiness.can_transition_to_ready_for_shipment,
        "primary_blocking_code": readiness.primary_blocking_code,
        "primary_blocking_message": readiness.primary_blocking_message,
        "recommended_action": readiness.recommended_action,
        "blocking_reasons": readiness.blocking_reasons,
        "blocking_codes": [check.code for check in readiness.blocking_checks if check.is_blocking],
        "final_test_passed": readiness.final_test_passed,
        "critical_open_ncr_ids": readiness.critical_open_ncr_ids,
        "bom_resolution_source": readiness.bom_compliance.resolution_source,
        "bom_passes_gate": readiness.bom_compliance.passes_bom_gate,
        "missing_required_components": readiness.bom_compliance.missing_required_components,
        "over_installed_components": readiness.bom_compliance.over_installed_components,
        "unexpected_component_types": readiness.bom_compliance.unexpected_component_types,
        "component_qc_blocking_details": component_qc_blocking_details,
        "component_critical_open_ncr_ids": component_ncr_blocking_details,
    }


def _record_shipment_gate_decision_audit(
    db: Session,
    device: Device,
    readiness: DeviceShipmentReadinessRead,
    *,
    requested_status: str,
) -> None:
    is_allowed = readiness.can_transition_to_ready_for_shipment
    record_audit_event(
        db,
        event_type="SHIPMENT_GATE_PASSED" if is_allowed else "SHIPMENT_GATE_BLOCKED",
        entity_type="DEVICE",
        entity_id=device.device_serial_number,
        result="PASS" if is_allowed else "BLOCKED",
        message=(
            "Shipment gate passed"
            if is_allowed
            else (readiness.primary_blocking_message or readiness.blocking_reasons[0])
        ),
        payload=_build_shipment_gate_audit_payload(
            device,
            readiness,
            requested_status=requested_status,
        ),
    )


def update_device_status(db: Session, serial_number: str, payload: DeviceStatusUpdate) -> Device:
    device = get_device_or_404(db, serial_number)
    if payload.production_status == rules.READY_FOR_SHIPMENT:
        readiness = _build_device_shipment_readiness(db, device)
        _record_shipment_gate_decision_audit(
            db,
            device,
            readiness,
            requested_status=payload.production_status,
        )
        if not readiness.can_transition_to_ready_for_shipment:
            db.commit()
            raise HTTPException(status_code=400, detail=readiness.blocking_reasons[0])
    device.production_status = payload.production_status
    device.updated_at = utc_now()
    record_audit_event(
        db,
        event_type="DEVICE_STATUS_UPDATED",
        entity_type="DEVICE",
        entity_id=serial_number,
        result=payload.production_status,
        payload={"production_status": payload.production_status},
    )
    db.commit()
    db.refresh(device)
    return device


def _build_bom_shipment_blocking_reason(
    bom_compliance: DeviceBomComplianceRead,
) -> str | None:
    if bom_compliance.passes_bom_gate:
        return None
    if bom_compliance.blocking_reason:
        return READY_FOR_SHIPMENT_REQUIRES_ACTIVE_BOM
    if bom_compliance.missing_required_components:
        return "READY_FOR_SHIPMENT requires installed components: " + ", ".join(
            bom_compliance.missing_required_components
        )

    issue_fragments: list[str] = []
    if bom_compliance.over_installed_components:
        issue_fragments.append(
            "over-installed components: " + ", ".join(bom_compliance.over_installed_components)
        )
    if bom_compliance.unexpected_component_types:
        issue_fragments.append(
            "unexpected components: " + ", ".join(sorted(bom_compliance.unexpected_component_types))
        )
    if not issue_fragments:
        return None
    return "READY_FOR_SHIPMENT requires BOM-compliant assembly: " + "; ".join(issue_fragments)


def _build_bom_shipment_blocking_checks(
    bom_compliance: DeviceBomComplianceRead,
) -> list[DeviceShipmentBlockingCheckRead]:
    if bom_compliance.blocking_reason:
        return [
            DeviceShipmentBlockingCheckRead(
                code=BOM_TEMPLATE_NOT_EFFECTIVE_CODE,
                is_blocking=True,
                message=READY_FOR_SHIPMENT_REQUIRES_ACTIVE_BOM,
                details=[bom_compliance.blocking_reason],
            )
        ]

    checks: list[DeviceShipmentBlockingCheckRead] = []
    if bom_compliance.missing_required_components:
        checks.append(
            DeviceShipmentBlockingCheckRead(
                code=BOM_REQUIRED_COMPONENTS_MISSING_CODE,
                is_blocking=True,
                message="READY_FOR_SHIPMENT requires installed components",
                details=bom_compliance.missing_required_components,
            )
        )
    if bom_compliance.over_installed_components:
        checks.append(
            DeviceShipmentBlockingCheckRead(
                code=BOM_OVER_INSTALLED_COMPONENTS_CODE,
                is_blocking=True,
                message="READY_FOR_SHIPMENT requires BOM-compliant assembly",
                details=bom_compliance.over_installed_components,
            )
        )
    if bom_compliance.unexpected_component_types:
        checks.append(
            DeviceShipmentBlockingCheckRead(
                code=BOM_UNEXPECTED_COMPONENTS_CODE,
                is_blocking=True,
                message="READY_FOR_SHIPMENT requires BOM-compliant assembly",
                details=sorted(bom_compliance.unexpected_component_types),
            )
        )
    return checks


def _pick_primary_blocking_code(
    blocking_checks: list[DeviceShipmentBlockingCheckRead],
) -> str | None:
    blocking_codes = [check.code for check in blocking_checks if check.is_blocking]
    if not blocking_codes:
        return None
    return min(blocking_codes, key=lambda code: (_blocking_priority_value(code), code))


def _blocking_priority_value(code: str | None) -> int:
    priority = {
        CRITICAL_OPEN_NCR_CODE: 0,
        COMPONENT_CRITICAL_OPEN_NCR_CODE: 1,
        COMPONENT_QC_NOT_PASSED_CODE: 2,
        BOM_TEMPLATE_NOT_EFFECTIVE_CODE: 3,
        BOM_OVER_INSTALLED_COMPONENTS_CODE: 4,
        BOM_UNEXPECTED_COMPONENTS_CODE: 4,
        BOM_REQUIRED_COMPONENTS_MISSING_CODE: 5,
        FINAL_TEST_NOT_PASSED_CODE: 6,
    }
    if code is None:
        return 99
    return priority.get(code, 99)


def _primary_blocking_message(
    primary_blocking_code: str | None,
    blocking_checks: list[DeviceShipmentBlockingCheckRead],
) -> str | None:
    if primary_blocking_code is None:
        return None
    for check in blocking_checks:
        if check.code == primary_blocking_code:
            return check.message
    return None


def _recommended_action_for_primary_blocking_code(primary_blocking_code: str | None) -> str:
    if primary_blocking_code is None:
        return MARK_READY_FOR_SHIPMENT_ACTION
    if primary_blocking_code == CRITICAL_OPEN_NCR_CODE:
        return RESOLVE_CRITICAL_NCR_ACTION
    if primary_blocking_code in {COMPONENT_QC_NOT_PASSED_CODE, COMPONENT_CRITICAL_OPEN_NCR_CODE}:
        return RESOLVE_COMPONENT_QUALITY_ACTION
    if primary_blocking_code == BOM_TEMPLATE_NOT_EFFECTIVE_CODE:
        return ACTIVATE_OR_CONFIGURE_BOM_ACTION
    if primary_blocking_code in {BOM_OVER_INSTALLED_COMPONENTS_CODE, BOM_UNEXPECTED_COMPONENTS_CODE}:
        return FIX_ASSEMBLY_MISMATCH_ACTION
    if primary_blocking_code == BOM_REQUIRED_COMPONENTS_MISSING_CODE:
        return COMPLETE_ASSEMBLY_ACTION
    if primary_blocking_code == FINAL_TEST_NOT_PASSED_CODE:
        return RUN_FINAL_TEST_ACTION
    return RUN_FINAL_TEST_ACTION


def _build_installed_component_quality_rows(
    db: Session,
    device: Device,
) -> list[DeviceInstalledComponentQualityRead]:
    installed_links = repository.list_installed_assembly_links_for_device(
        db,
        device.device_serial_number,
    )
    component_ncr_ids_by_serial = repository.list_component_critical_open_ncr_ids_grouped_for_device(
        db,
        device.device_serial_number,
    )

    component_rows: list[DeviceInstalledComponentQualityRead] = []
    for link in installed_links:
        critical_open_ncr_ids = component_ncr_ids_by_serial.get(link.child_item_serial_number, [])
        if critical_open_ncr_ids:
            quality_status = "CRITICAL_NCR_OPEN"
        elif not link.component_qc_passed:
            quality_status = "QC_NOT_PASSED"
        else:
            quality_status = "PASS"
        component_rows.append(
            DeviceInstalledComponentQualityRead(
                component_serial_number=link.child_item_serial_number,
                component_type=link.component_type,
                child_barcode_value=link.child_barcode_value,
                installed_at=link.installed_at,
                installed_by=link.installed_by,
                workstation_id=link.workstation_id,
                bom_template_id=link.bom_template_id,
                bom_version=link.bom_version,
                component_qc_passed=link.component_qc_passed,
                has_critical_open_ncr=bool(critical_open_ncr_ids),
                critical_open_ncr_ids=critical_open_ncr_ids,
                blocks_shipment=quality_status != "PASS",
                quality_status=quality_status,
            )
        )
    return component_rows


def _primary_component_quality_status(
    component_rows: list[DeviceInstalledComponentQualityRead],
) -> str:
    if any(row.quality_status == "CRITICAL_NCR_OPEN" for row in component_rows):
        return "CRITICAL_NCR_OPEN"
    if any(row.quality_status == "QC_NOT_PASSED" for row in component_rows):
        return "QC_NOT_PASSED"
    return "PASS"


def _recommended_action_for_component_quality_status(primary_quality_status: str) -> str:
    if primary_quality_status == "CRITICAL_NCR_OPEN":
        return RESOLVE_COMPONENT_NCR_ACTION
    if primary_quality_status == "QC_NOT_PASSED":
        return RUN_COMPONENT_QC_OR_REWORK_ACTION
    return NO_COMPONENT_ACTION


def get_device_component_quality(
    db: Session,
    serial_number: str,
) -> DeviceComponentQualityRead:
    device = get_device_or_404(db, serial_number)
    component_rows = _build_installed_component_quality_rows(db, device)
    blocked_components = sum(1 for row in component_rows if row.blocks_shipment)
    primary_quality_status = _primary_component_quality_status(component_rows)
    return DeviceComponentQualityRead(
        device_serial_number=device.device_serial_number,
        device_type=device.device_type,
        device_variant_code=device.variant_code,
        production_status=device.production_status,
        total_installed_components=len(component_rows),
        passing_components=len(component_rows) - blocked_components,
        blocked_components=blocked_components,
        primary_quality_status=primary_quality_status,
        recommended_action=_recommended_action_for_component_quality_status(primary_quality_status),
        components=component_rows,
    )


def _build_component_quality_status_summary(
    quality_rows: list[DeviceComponentQualityRead],
) -> list[DeviceComponentQualityStatusSummaryRead]:
    component_counts: dict[str, int] = {}
    device_sets: dict[str, set[str]] = {}
    for row in quality_rows:
        for component in row.components:
            component_counts[component.quality_status] = (
                component_counts.get(component.quality_status, 0) + 1
            )
            device_sets.setdefault(component.quality_status, set()).add(row.device_serial_number)
    return [
        DeviceComponentQualityStatusSummaryRead(
            quality_status=quality_status,
            component_count=component_count,
            device_count=len(device_sets.get(quality_status, set())),
        )
        for quality_status, component_count in sorted(
            component_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _build_primary_component_quality_status_summary(
    quality_rows: list[DeviceComponentQualityRead],
) -> list[DeviceComponentPrimaryQualityStatusSummaryRead]:
    summary: dict[str, int] = {}
    for row in quality_rows:
        summary[row.primary_quality_status] = (
            summary.get(row.primary_quality_status, 0) + 1
        )
    return [
        DeviceComponentPrimaryQualityStatusSummaryRead(
            primary_quality_status=primary_quality_status,
            device_count=device_count,
        )
        for primary_quality_status, device_count in sorted(
            summary.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _build_component_quality_production_status_summary(
    quality_rows: list[DeviceComponentQualityRead],
) -> list[DeviceShipmentProductionStatusSummaryRead]:
    summary: dict[str, int] = {}
    for row in quality_rows:
        summary[row.production_status] = summary.get(row.production_status, 0) + 1
    return [
        DeviceShipmentProductionStatusSummaryRead(
            production_status=production_status,
            device_count=device_count,
        )
        for production_status, device_count in sorted(
            summary.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _build_component_quality_variant_code_summary(
    quality_rows: list[DeviceComponentQualityRead],
) -> list[DeviceVariantCodeSummaryRead]:
    summary: dict[str, int] = {}
    for row in quality_rows:
        summary[row.device_variant_code] = summary.get(row.device_variant_code, 0) + 1
    return [
        DeviceVariantCodeSummaryRead(
            variant_code=variant_code,
            device_count=device_count,
        )
        for variant_code, device_count in sorted(
            summary.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _build_component_type_summary(
    quality_rows: list[DeviceComponentQualityRead],
    *,
    component_type_filter: str | None = None,
) -> list[DeviceComponentTypeSummaryRead]:
    component_counts: dict[str, int] = {}
    device_sets: dict[str, set[str]] = {}
    for row in quality_rows:
        for component in row.components:
            if component_type_filter and component.component_type != component_type_filter:
                continue
            component_counts[component.component_type] = (
                component_counts.get(component.component_type, 0) + 1
            )
            device_sets.setdefault(component.component_type, set()).add(row.device_serial_number)
    return [
        DeviceComponentTypeSummaryRead(
            component_type=component_type,
            component_count=component_count,
            device_count=len(device_sets.get(component_type, set())),
        )
        for component_type, component_count in sorted(
            component_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _build_component_quality_recommended_action_summary(
    quality_rows: list[DeviceComponentQualityRead],
) -> list[DeviceShipmentActionSummaryRead]:
    summary: dict[str, int] = {}
    for row in quality_rows:
        summary[row.recommended_action] = summary.get(row.recommended_action, 0) + 1
    return [
        DeviceShipmentActionSummaryRead(
            recommended_action=recommended_action,
            device_count=device_count,
        )
        for recommended_action, device_count in sorted(
            summary.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _sort_component_quality_rows(
    quality_rows: list[DeviceComponentQualityRead],
    *,
    sort_by: str,
    sort_desc: bool | None,
) -> list[DeviceComponentQualityRead]:
    if sort_by not in VALID_COMPONENT_QUALITY_SORT_FIELDS:
        raise HTTPException(status_code=400, detail="Unsupported component quality sort_by value")

    effective_sort_desc = sort_desc if sort_desc is not None else sort_by == "blocked_components"

    if sort_by == "device_serial_number":
        return sorted(
            quality_rows,
            key=lambda row: row.device_serial_number,
            reverse=effective_sort_desc,
        )
    if sort_by == "production_status":
        return sorted(
            quality_rows,
            key=lambda row: (row.production_status, row.device_serial_number),
            reverse=effective_sort_desc,
        )
    if sort_by == "variant_code":
        return sorted(
            quality_rows,
            key=lambda row: (row.device_variant_code, row.device_serial_number),
            reverse=effective_sort_desc,
        )
    if sort_by == "recommended_action":
        return sorted(
            quality_rows,
            key=lambda row: (row.recommended_action, row.device_serial_number),
            reverse=effective_sort_desc,
        )
    return sorted(
        quality_rows,
        key=lambda row: (row.blocked_components, row.device_serial_number),
        reverse=effective_sort_desc,
    )


def list_device_component_quality(
    db: Session,
    *,
    device_type: str | None = None,
    variant_code: str | None = None,
    production_status: str | None = None,
    component_type: str | None = None,
    quality_status: str | None = None,
    primary_quality_status: str | None = None,
    recommended_action: str | None = None,
    only_blocking: bool = False,
    sort_by: str = "blocked_components",
    sort_desc: bool | None = None,
    offset: int = 0,
    limit: int = 100,
) -> DeviceComponentQualityQueueRead:
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if limit > MAX_QUEUE_LIMIT:
        raise HTTPException(status_code=400, detail=f"limit must be <= {MAX_QUEUE_LIMIT}")
    if quality_status and quality_status not in VALID_COMPONENT_QUALITY_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported quality_status filter")
    if (
        primary_quality_status
        and primary_quality_status not in VALID_COMPONENT_QUALITY_STATUSES
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported primary_quality_status filter",
        )
    if (
        recommended_action
        and recommended_action not in VALID_COMPONENT_QUALITY_RECOMMENDED_ACTIONS
    ):
        raise HTTPException(
            status_code=400,
            detail="Unsupported component quality recommended_action filter",
        )

    devices = repository.list_devices_for_shipment(
        db,
        device_type=device_type,
        variant_code=variant_code,
        limit=None,
    )
    quality_rows = [get_device_component_quality(db, device.device_serial_number) for device in devices]

    if production_status:
        quality_rows = [row for row in quality_rows if row.production_status == production_status]
    if component_type:
        quality_rows = [
            row
            for row in quality_rows
            if any(component.component_type == component_type for component in row.components)
        ]
    if only_blocking:
        quality_rows = [row for row in quality_rows if row.blocked_components > 0]
    if quality_status:
        quality_rows = [
            row
            for row in quality_rows
            if any(component.quality_status == quality_status for component in row.components)
        ]
    if primary_quality_status:
        quality_rows = [
            row for row in quality_rows if row.primary_quality_status == primary_quality_status
        ]
    if recommended_action:
        quality_rows = [row for row in quality_rows if row.recommended_action == recommended_action]
    quality_rows = _sort_component_quality_rows(
        quality_rows,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )

    total_devices = len(quality_rows)
    devices_with_issues = sum(1 for row in quality_rows if row.blocked_components > 0)
    paged_rows = quality_rows[offset : offset + limit]
    returned_count = len(paged_rows)
    has_more = offset + returned_count < total_devices
    next_offset = offset + returned_count if has_more else None

    return DeviceComponentQualityQueueRead(
        total_devices=total_devices,
        devices_with_issues=devices_with_issues,
        returned_count=returned_count,
        offset=offset,
        limit=limit,
        has_more=has_more,
        next_offset=next_offset,
        filters={
            "device_type": device_type,
            "variant_code": variant_code,
            "production_status": production_status,
            "component_type": component_type,
            "quality_status": quality_status,
            "primary_quality_status": primary_quality_status,
            "recommended_action": recommended_action,
            "only_blocking": only_blocking,
            "sort_by": sort_by,
            "sort_desc": sort_desc,
            "offset": offset,
            "limit": limit,
        },
        quality_status_summary=_build_component_quality_status_summary(quality_rows),
        variant_code_summary=_build_component_quality_variant_code_summary(quality_rows),
        production_status_summary=_build_component_quality_production_status_summary(
            quality_rows
        ),
        primary_quality_status_summary=_build_primary_component_quality_status_summary(
            quality_rows
        ),
        component_type_summary=_build_component_type_summary(
            quality_rows,
            component_type_filter=component_type,
        ),
        recommended_action_summary=_build_component_quality_recommended_action_summary(
            quality_rows
        ),
        devices=paged_rows,
    )


def _build_device_shipment_readiness(db: Session, device: Device) -> DeviceShipmentReadinessRead:
    final_test_passed = device.production_status == rules.FINAL_TEST_PASSED
    critical_open_ncr_ids = repository.list_critical_open_ncr_ids(db, device.device_serial_number)
    has_critical_open_ncr = bool(critical_open_ncr_ids)
    bom_compliance = get_device_bom_compliance(db, device.device_serial_number)
    component_quality_rows = _build_installed_component_quality_rows(db, device)
    component_qc_blocking_details = sorted(
        f"{row.component_serial_number} ({row.component_type})"
        for row in component_quality_rows
        if not row.component_qc_passed
    )
    component_critical_open_ncr_ids = sorted(
        {
            ncr_id
            for row in component_quality_rows
            for ncr_id in row.critical_open_ncr_ids
        }
    )
    latest_shipment_gate_event = repository.get_latest_shipment_gate_audit_event_for_device(
        db,
        device.device_serial_number,
    )

    blocking_reasons: list[str] = []
    blocking_checks: list[DeviceShipmentBlockingCheckRead] = []
    if not final_test_passed:
        blocking_reasons.append(READY_FOR_SHIPMENT_REQUIRES_FINAL_TEST)
        blocking_checks.append(
            DeviceShipmentBlockingCheckRead(
                code=FINAL_TEST_NOT_PASSED_CODE,
                is_blocking=True,
                message=READY_FOR_SHIPMENT_REQUIRES_FINAL_TEST,
            )
        )

    bom_blocking_reason = _build_bom_shipment_blocking_reason(bom_compliance)
    if bom_blocking_reason:
        blocking_reasons.append(bom_blocking_reason)
    blocking_checks.extend(_build_bom_shipment_blocking_checks(bom_compliance))

    if component_qc_blocking_details:
        blocking_reasons.append(READY_FOR_SHIPMENT_REQUIRES_COMPONENT_QC)
        blocking_checks.append(
            DeviceShipmentBlockingCheckRead(
                code=COMPONENT_QC_NOT_PASSED_CODE,
                is_blocking=True,
                message=READY_FOR_SHIPMENT_REQUIRES_COMPONENT_QC,
                details=component_qc_blocking_details,
            )
        )

    if component_critical_open_ncr_ids:
        blocking_reasons.append(READY_FOR_SHIPMENT_BLOCKED_BY_COMPONENT_NCR)
        blocking_checks.append(
            DeviceShipmentBlockingCheckRead(
                code=COMPONENT_CRITICAL_OPEN_NCR_CODE,
                is_blocking=True,
                message=READY_FOR_SHIPMENT_BLOCKED_BY_COMPONENT_NCR,
                details=component_critical_open_ncr_ids,
            )
        )

    if has_critical_open_ncr:
        blocking_reasons.append(READY_FOR_SHIPMENT_BLOCKED_BY_NCR)
        blocking_checks.append(
            DeviceShipmentBlockingCheckRead(
                code=CRITICAL_OPEN_NCR_CODE,
                is_blocking=True,
                message=READY_FOR_SHIPMENT_BLOCKED_BY_NCR,
                details=critical_open_ncr_ids,
            )
        )
    primary_blocking_code = _pick_primary_blocking_code(blocking_checks)

    return DeviceShipmentReadinessRead(
        device_serial_number=device.device_serial_number,
        device_type=device.device_type,
        device_variant_code=device.variant_code,
        production_status=device.production_status,
        device_created_at=device.created_at,
        device_updated_at=device.updated_at,
        final_test_passed=final_test_passed,
        has_critical_open_ncr=has_critical_open_ncr,
        critical_open_ncr_ids=critical_open_ncr_ids,
        bom_compliance=bom_compliance,
        can_transition_to_ready_for_shipment=not blocking_reasons,
        latest_shipment_gate_decision=_build_latest_shipment_gate_decision(
            latest_shipment_gate_event
        ),
        primary_blocking_code=primary_blocking_code,
        primary_blocking_message=_primary_blocking_message(primary_blocking_code, blocking_checks),
        recommended_action=_recommended_action_for_primary_blocking_code(primary_blocking_code),
        blocking_reasons=blocking_reasons,
        blocking_checks=blocking_checks,
    )


def get_device_shipment_readiness(
    db: Session,
    serial_number: str,
) -> DeviceShipmentReadinessRead:
    device = get_device_or_404(db, serial_number)
    return _build_device_shipment_readiness(db, device)


def get_device_shipment_gate_history(
    db: Session,
    serial_number: str,
    *,
    result: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditEvent]:
    get_device_or_404(db, serial_number)
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if limit > MAX_SHIPMENT_GATE_HISTORY_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"limit must be <= {MAX_SHIPMENT_GATE_HISTORY_LIMIT}",
        )
    if result and result not in {"PASS", "BLOCKED"}:
        raise HTTPException(status_code=400, detail="Unsupported shipment gate result filter")
    return repository.list_shipment_gate_audit_events_for_device(
        db,
        serial_number,
        result=result,
        limit=limit,
        offset=offset,
    )


def _build_blocking_summary(
    readiness_rows: list[DeviceShipmentReadinessRead],
) -> list[DeviceShipmentBlockingSummaryRead]:
    summary: dict[str, DeviceShipmentBlockingSummaryRead] = {}
    for row in readiness_rows:
        seen_codes: set[str] = set()
        for check in row.blocking_checks:
            if not check.is_blocking or check.code in seen_codes:
                continue
            seen_codes.add(check.code)
            existing = summary.get(check.code)
            if existing:
                existing.device_count += 1
            else:
                summary[check.code] = DeviceShipmentBlockingSummaryRead(
                    code=check.code,
                    message=check.message,
                    device_count=1,
                )
    return sorted(summary.values(), key=lambda item: (item.device_count * -1, item.code))


def _build_primary_blocking_summary(
    readiness_rows: list[DeviceShipmentReadinessRead],
) -> list[DeviceShipmentBlockingSummaryRead]:
    summary: dict[str, DeviceShipmentBlockingSummaryRead] = {}
    for row in readiness_rows:
        if not row.primary_blocking_code:
            continue
        existing = summary.get(row.primary_blocking_code)
        if existing:
            existing.device_count += 1
        else:
            summary[row.primary_blocking_code] = DeviceShipmentBlockingSummaryRead(
                code=row.primary_blocking_code,
                message=row.primary_blocking_message,
                device_count=1,
            )
    return sorted(summary.values(), key=lambda item: (item.device_count * -1, item.code))


def _build_recommended_action_summary(
    readiness_rows: list[DeviceShipmentReadinessRead],
) -> list[DeviceShipmentActionSummaryRead]:
    summary: dict[str, int] = {}
    for row in readiness_rows:
        summary[row.recommended_action] = summary.get(row.recommended_action, 0) + 1
    return [
        DeviceShipmentActionSummaryRead(
            recommended_action=recommended_action,
            device_count=device_count,
        )
        for recommended_action, device_count in sorted(
            summary.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _build_latest_shipment_gate_decision(
    audit_event: AuditEvent | None,
) -> DeviceShipmentLatestDecisionRead | None:
    if audit_event is None:
        return None
    recommended_action = None
    if audit_event.payload:
        recommended_action = audit_event.payload.get("recommended_action")
    return DeviceShipmentLatestDecisionRead(
        event_type=audit_event.event_type,
        result=audit_event.result or "UNKNOWN",
        message=audit_event.message,
        recommended_action=recommended_action,
        created_at=audit_event.created_at,
    )


def _latest_shipment_gate_result(
    readiness: DeviceShipmentReadinessRead,
) -> str:
    if readiness.latest_shipment_gate_decision is None:
        return "NONE"
    return readiness.latest_shipment_gate_decision.result


def _build_latest_shipment_gate_result_summary(
    readiness_rows: list[DeviceShipmentReadinessRead],
) -> list[DeviceShipmentLatestDecisionSummaryRead]:
    summary: dict[str, int] = {}
    for row in readiness_rows:
        result = _latest_shipment_gate_result(row)
        summary[result] = summary.get(result, 0) + 1
    return [
        DeviceShipmentLatestDecisionSummaryRead(
            result=result,
            device_count=device_count,
        )
        for result, device_count in sorted(summary.items(), key=lambda item: (-item[1], item[0]))
    ]


def _build_production_status_summary(
    readiness_rows: list[DeviceShipmentReadinessRead],
) -> list[DeviceShipmentProductionStatusSummaryRead]:
    summary: dict[str, int] = {}
    for row in readiness_rows:
        summary[row.production_status] = summary.get(row.production_status, 0) + 1
    return [
        DeviceShipmentProductionStatusSummaryRead(
            production_status=production_status,
            device_count=device_count,
        )
        for production_status, device_count in sorted(
            summary.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _sort_shipment_readiness_rows(
    readiness_rows: list[DeviceShipmentReadinessRead],
    *,
    sort_by: str,
    sort_desc: bool | None,
) -> list[DeviceShipmentReadinessRead]:
    if sort_by not in VALID_QUEUE_SORT_FIELDS:
        raise HTTPException(status_code=400, detail="Unsupported sort_by value")

    effective_sort_desc = sort_desc if sort_desc is not None else sort_by == "created_at"

    if sort_by == "created_at":
        return sorted(
            readiness_rows,
            key=lambda row: (row.device_created_at, row.device_serial_number),
            reverse=effective_sort_desc,
        )
    if sort_by == "device_serial_number":
        return sorted(
            readiness_rows,
            key=lambda row: row.device_serial_number,
            reverse=effective_sort_desc,
        )
    if sort_by == "recommended_action":
        return sorted(
            readiness_rows,
            key=lambda row: (row.recommended_action, row.device_serial_number),
            reverse=effective_sort_desc,
        )
    return sorted(
        readiness_rows,
        key=lambda row: (
            _blocking_priority_value(row.primary_blocking_code),
            row.device_created_at,
            row.device_serial_number,
        ),
        reverse=effective_sort_desc,
    )


def list_device_shipment_readiness(
    db: Session,
    *,
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
) -> DeviceShipmentQueueRead:
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if limit > MAX_QUEUE_LIMIT:
        raise HTTPException(status_code=400, detail=f"limit must be <= {MAX_QUEUE_LIMIT}")
    if only_blocked and only_ready:
        raise HTTPException(
            status_code=400,
            detail="only_blocked and only_ready cannot both be true",
        )
    if blocking_code and only_ready:
        raise HTTPException(
            status_code=400,
            detail="blocking_code cannot be combined with only_ready",
        )
    if primary_blocking_code and only_ready:
        raise HTTPException(
            status_code=400,
            detail="primary_blocking_code cannot be combined with only_ready",
        )
    if recommended_action and only_ready and recommended_action != MARK_READY_FOR_SHIPMENT_ACTION:
        raise HTTPException(
            status_code=400,
            detail="recommended_action is incompatible with only_ready unless it is MARK_READY_FOR_SHIPMENT",
        )
    if recommended_action and only_blocked and recommended_action == MARK_READY_FOR_SHIPMENT_ACTION:
        raise HTTPException(
            status_code=400,
            detail="recommended_action MARK_READY_FOR_SHIPMENT cannot be combined with only_blocked",
        )
    if latest_gate_result and latest_gate_result not in VALID_LATEST_GATE_RESULTS:
        raise HTTPException(status_code=400, detail="Unsupported latest_gate_result filter")
    devices = repository.list_devices_for_shipment(
        db,
        device_type=device_type,
        variant_code=variant_code,
        limit=None,
    )
    readiness_rows = [_build_device_shipment_readiness(db, device) for device in devices]

    if only_blocked:
        readiness_rows = [
            row for row in readiness_rows if not row.can_transition_to_ready_for_shipment
        ]
    if only_ready:
        readiness_rows = [row for row in readiness_rows if row.can_transition_to_ready_for_shipment]
    if blocking_code:
        readiness_rows = [
            row
            for row in readiness_rows
            if any(check.code == blocking_code for check in row.blocking_checks)
        ]
    if production_status:
        readiness_rows = [
            row for row in readiness_rows if row.production_status == production_status
        ]
    if primary_blocking_code:
        readiness_rows = [
            row for row in readiness_rows if row.primary_blocking_code == primary_blocking_code
        ]
    if recommended_action:
        readiness_rows = [
            row for row in readiness_rows if row.recommended_action == recommended_action
        ]
    if latest_gate_result:
        readiness_rows = [
            row for row in readiness_rows if _latest_shipment_gate_result(row) == latest_gate_result
        ]
    readiness_rows = _sort_shipment_readiness_rows(
        readiness_rows,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )

    total_devices = len(readiness_rows)
    ready_count = sum(1 for row in readiness_rows if row.can_transition_to_ready_for_shipment)
    blocked_count = total_devices - ready_count
    paged_rows = readiness_rows[offset : offset + limit]
    returned_count = len(paged_rows)
    has_more = offset + returned_count < total_devices
    next_offset = offset + returned_count if has_more else None

    return DeviceShipmentQueueRead(
        total_devices=total_devices,
        ready_count=ready_count,
        blocked_count=blocked_count,
        returned_count=returned_count,
        offset=offset,
        limit=limit,
        has_more=has_more,
        next_offset=next_offset,
        filters={
            "device_type": device_type,
            "variant_code": variant_code,
            "production_status": production_status,
            "blocking_code": blocking_code,
            "primary_blocking_code": primary_blocking_code,
            "recommended_action": recommended_action,
            "latest_gate_result": latest_gate_result,
            "only_blocked": only_blocked,
            "only_ready": only_ready,
            "sort_by": sort_by,
            "sort_desc": sort_desc,
            "offset": offset,
            "limit": limit,
        },
        blocking_summary=_build_blocking_summary(readiness_rows),
        primary_blocking_summary=_build_primary_blocking_summary(readiness_rows),
        recommended_action_summary=_build_recommended_action_summary(readiness_rows),
        latest_shipment_gate_result_summary=_build_latest_shipment_gate_result_summary(
            readiness_rows
        ),
        production_status_summary=_build_production_status_summary(readiness_rows),
        devices=paged_rows,
    )
