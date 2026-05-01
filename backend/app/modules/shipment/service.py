from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.database import utc_now
from app.models import Device
from app.modules.assembly.service import get_device_bom_compliance
from app.modules.shipment import repository, rules
from app.schemas import (
    DeviceShipmentActionSummaryRead,
    DeviceBomComplianceRead,
    DeviceShipmentBlockingCheckRead,
    DeviceShipmentBlockingSummaryRead,
    DeviceShipmentQueueRead,
    DeviceShipmentReadinessRead,
    DeviceStatusUpdate,
)

READY_FOR_SHIPMENT_REQUIRES_FINAL_TEST = "READY_FOR_SHIPMENT requires FINAL_TEST_PASSED"
READY_FOR_SHIPMENT_REQUIRES_ACTIVE_BOM = "READY_FOR_SHIPMENT requires an active effective BOM template"
READY_FOR_SHIPMENT_BLOCKED_BY_NCR = "Open critical NCR blocks shipment"
FINAL_TEST_NOT_PASSED_CODE = "FINAL_TEST_NOT_PASSED"
BOM_TEMPLATE_NOT_EFFECTIVE_CODE = "BOM_TEMPLATE_NOT_EFFECTIVE"
BOM_REQUIRED_COMPONENTS_MISSING_CODE = "BOM_REQUIRED_COMPONENTS_MISSING"
BOM_OVER_INSTALLED_COMPONENTS_CODE = "BOM_OVER_INSTALLED_COMPONENTS"
BOM_UNEXPECTED_COMPONENTS_CODE = "BOM_UNEXPECTED_COMPONENTS"
CRITICAL_OPEN_NCR_CODE = "CRITICAL_OPEN_NCR"
MARK_READY_FOR_SHIPMENT_ACTION = "MARK_READY_FOR_SHIPMENT"
RESOLVE_CRITICAL_NCR_ACTION = "RESOLVE_CRITICAL_NCR"
ACTIVATE_OR_CONFIGURE_BOM_ACTION = "ACTIVATE_OR_CONFIGURE_BOM"
FIX_ASSEMBLY_MISMATCH_ACTION = "FIX_ASSEMBLY_MISMATCH"
COMPLETE_ASSEMBLY_ACTION = "COMPLETE_ASSEMBLY"
RUN_FINAL_TEST_ACTION = "RUN_FINAL_TEST"
VALID_QUEUE_SORT_FIELDS = {"created_at", "device_serial_number", "priority", "recommended_action"}


def get_device_or_404(db: Session, serial_number: str) -> Device:
    device = repository.get_device_by_serial_number(db, serial_number)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def update_device_status(db: Session, serial_number: str, payload: DeviceStatusUpdate) -> Device:
    device = get_device_or_404(db, serial_number)
    if payload.production_status == rules.READY_FOR_SHIPMENT:
        readiness = _build_device_shipment_readiness(db, device)
        if not readiness.can_transition_to_ready_for_shipment:
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
        BOM_TEMPLATE_NOT_EFFECTIVE_CODE: 1,
        BOM_OVER_INSTALLED_COMPONENTS_CODE: 2,
        BOM_UNEXPECTED_COMPONENTS_CODE: 2,
        BOM_REQUIRED_COMPONENTS_MISSING_CODE: 3,
        FINAL_TEST_NOT_PASSED_CODE: 4,
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
    if primary_blocking_code == BOM_TEMPLATE_NOT_EFFECTIVE_CODE:
        return ACTIVATE_OR_CONFIGURE_BOM_ACTION
    if primary_blocking_code in {BOM_OVER_INSTALLED_COMPONENTS_CODE, BOM_UNEXPECTED_COMPONENTS_CODE}:
        return FIX_ASSEMBLY_MISMATCH_ACTION
    if primary_blocking_code == BOM_REQUIRED_COMPONENTS_MISSING_CODE:
        return COMPLETE_ASSEMBLY_ACTION
    if primary_blocking_code == FINAL_TEST_NOT_PASSED_CODE:
        return RUN_FINAL_TEST_ACTION
    return RUN_FINAL_TEST_ACTION


def _build_device_shipment_readiness(db: Session, device: Device) -> DeviceShipmentReadinessRead:
    final_test_passed = device.production_status == rules.FINAL_TEST_PASSED
    critical_open_ncr_ids = repository.list_critical_open_ncr_ids(db, device.device_serial_number)
    has_critical_open_ncr = bool(critical_open_ncr_ids)
    bom_compliance = get_device_bom_compliance(db, device.device_serial_number)

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
    blocking_code: str | None = None,
    primary_blocking_code: str | None = None,
    recommended_action: str | None = None,
    only_blocked: bool = False,
    only_ready: bool = False,
    sort_by: str = "created_at",
    sort_desc: bool | None = None,
    limit: int = 100,
) -> DeviceShipmentQueueRead:
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
    devices = repository.list_devices_for_shipment(
        db,
        device_type=device_type,
        variant_code=variant_code,
        limit=limit,
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
    if primary_blocking_code:
        readiness_rows = [
            row for row in readiness_rows if row.primary_blocking_code == primary_blocking_code
        ]
    if recommended_action:
        readiness_rows = [
            row for row in readiness_rows if row.recommended_action == recommended_action
        ]
    readiness_rows = _sort_shipment_readiness_rows(
        readiness_rows,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )

    ready_count = sum(1 for row in readiness_rows if row.can_transition_to_ready_for_shipment)
    blocked_count = len(readiness_rows) - ready_count

    return DeviceShipmentQueueRead(
        total_devices=len(readiness_rows),
        ready_count=ready_count,
        blocked_count=blocked_count,
        filters={
            "device_type": device_type,
            "variant_code": variant_code,
            "blocking_code": blocking_code,
            "primary_blocking_code": primary_blocking_code,
            "recommended_action": recommended_action,
            "only_blocked": only_blocked,
            "only_ready": only_ready,
            "sort_by": sort_by,
            "sort_desc": sort_desc,
            "limit": limit,
        },
        blocking_summary=_build_blocking_summary(readiness_rows),
        primary_blocking_summary=_build_primary_blocking_summary(readiness_rows),
        recommended_action_summary=_build_recommended_action_summary(readiness_rows),
        devices=readiness_rows,
    )
