from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class DeviceCreate(BaseModel):
    device_serial_number: str
    device_type: str
    variant_code: str = "DEFAULT"
    hardware_version: str | None = None
    firmware_version: str | None = None
    bootloader_version: str | None = None
    created_by: str | None = None


class DeviceRead(DeviceCreate):
    id: str
    production_status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeviceStatusUpdate(BaseModel):
    production_status: str


class ComponentCreate(BaseModel):
    component_type: str
    component_serial_number: str | None = None
    component_part_number: str | None = None
    component_revision: str | None = None
    installed_by: str | None = None
    status: str | None = "INSTALLED"


class ComponentRead(ComponentCreate):
    id: str
    device_serial_number: str
    installed_at: datetime | None = None

    model_config = {"from_attributes": True}


class DeviceBomTemplateCreate(BaseModel):
    device_type: str
    variant_code: str = "DEFAULT"
    name: str
    version: str = Field(default="1.0", pattern=r"^\d+(?:\.\d+)*$")
    is_active: bool = False
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class DeviceBomTemplateRead(DeviceBomTemplateCreate):
    id: str
    status: str
    source_template_id: str | None = None
    replaced_by_template_id: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    release_note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DeviceBomResolutionRead(BaseModel):
    device_serial_number: str
    device_type: str
    device_variant_code: str
    resolution_source: str
    resolved_template_id: str | None = None
    resolved_variant_code: str | None = None
    resolved_version: str | None = None
    resolved_status: str | None = None
    resolved_is_active: bool = False
    resolved_is_effective_now: bool = False
    is_bound_template: bool
    is_default_fallback: bool
    has_variant_templates: bool
    has_default_templates: bool
    blocks_assembly: bool
    blocks_shipment: bool
    blocking_reason: str | None = None


class DeviceBomTemplateLineageNodeRead(BaseModel):
    template_id: str
    device_type: str
    variant_code: str
    version: str
    status: str
    is_active: bool
    source_template_id: str | None = None
    replaced_by_template_id: str | None = None
    approved_at: datetime | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class DeviceBomTemplateLineageRead(BaseModel):
    focus: DeviceBomTemplateLineageNodeRead
    ancestors: list[DeviceBomTemplateLineageNodeRead]
    descendants: list[DeviceBomTemplateLineageNodeRead]
    replacement: DeviceBomTemplateLineageNodeRead | None = None


class DeviceBomTemplateUsageRead(BaseModel):
    template_id: str
    device_type: str
    variant_code: str
    version: str
    status: str
    is_active: bool
    is_approved: bool
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    is_effective_now: bool
    bound_device_count: int
    is_bound: bool
    can_modify: bool
    recommended_action: str


class DeviceBomTemplateCatalogEntryRead(BaseModel):
    template_id: str
    device_type: str
    variant_code: str
    version: str
    status: str
    is_active: bool
    is_approved: bool
    approved_by: str | None = None
    approved_at: datetime | None = None
    release_note: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    is_effective_now: bool
    created_at: datetime
    item_count: int
    required_item_count: int
    has_any_items: bool
    bound_device_count: int
    is_bound: bool
    can_modify: bool
    can_activate: bool
    can_release: bool
    recommended_action: str
    activation_blocking_reasons: list[str]
    release_blocking_reasons: list[str]


class DeviceBomTemplateReadinessRead(BaseModel):
    template_id: str
    device_type: str
    variant_code: str
    version: str
    status: str
    is_active: bool
    is_approved: bool
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    is_effective_now: bool
    item_count: int
    required_item_count: int
    has_any_items: bool
    can_activate: bool
    blocking_reasons: list[str]


class DeviceBomTemplateBindingRead(BaseModel):
    device_serial_number: str
    device_type: str
    device_variant_code: str
    bom_variant_code: str
    production_status: str
    bom_version: str
    installed_component_count: int
    first_bound_at: datetime


class DeviceBomComponentCoverageRead(BaseModel):
    component_type: str
    substitution_group: str | None = None
    allowed_component_types: list[str] | None = None
    required_quantity: int
    installed_quantity: int
    is_required: bool
    status: str


class DeviceBomTemplateCoverageRead(BaseModel):
    device_serial_number: str
    device_type: str
    device_variant_code: str
    bom_variant_code: str
    production_status: str
    bom_version: str
    installed_component_count: int
    first_bound_at: datetime
    is_complete: bool
    missing_required_components: list[str]
    over_installed_components: list[str]
    unexpected_component_types: list[str]
    component_coverage: list[DeviceBomComponentCoverageRead]


class DeviceBomComplianceRead(BaseModel):
    device_serial_number: str
    device_type: str
    device_variant_code: str
    production_status: str
    resolution_source: str
    resolved_template_id: str | None = None
    resolved_variant_code: str | None = None
    resolved_version: str | None = None
    resolved_status: str | None = None
    resolved_is_active: bool = False
    resolved_is_effective_now: bool = False
    is_bom_resolved: bool
    passes_bom_gate: bool
    installed_component_count: int
    missing_required_components: list[str]
    over_installed_components: list[str]
    unexpected_component_types: list[str]
    component_coverage: list[DeviceBomComponentCoverageRead]
    blocking_reason: str | None = None


class DeviceShipmentBlockingCheckRead(BaseModel):
    code: str
    is_blocking: bool
    message: str | None = None
    details: list[str] = []


class DeviceShipmentReadinessRead(BaseModel):
    device_serial_number: str
    device_type: str
    device_variant_code: str
    production_status: str
    final_test_passed: bool
    has_critical_open_ncr: bool
    critical_open_ncr_ids: list[str]
    bom_compliance: DeviceBomComplianceRead
    can_transition_to_ready_for_shipment: bool
    blocking_reasons: list[str]
    blocking_checks: list[DeviceShipmentBlockingCheckRead]


class DeviceShipmentQueueRead(BaseModel):
    total_devices: int
    ready_count: int
    blocked_count: int
    filters: dict[str, str | bool | int | None]
    devices: list[DeviceShipmentReadinessRead]


class DeviceBomTemplateActivateRequest(BaseModel):
    version: str = Field(pattern=r"^\d+(?:\.\d+)*$")


class DeviceBomTemplateApproveRequest(BaseModel):
    version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    approved_by: str
    release_note: str | None = None


class DeviceBomTemplateRevokeApprovalRequest(BaseModel):
    version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    reason: str | None = None


class DeviceBomTemplateReleaseRequest(BaseModel):
    version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    approved_by: str | None = None
    release_note: str | None = None


class DeviceBomTemplateRetireRequest(BaseModel):
    version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    reason: str | None = None


class DeviceBomTemplateCloneRequest(BaseModel):
    source_version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    target_version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    name: str | None = None
    activate: bool = False
    approved_by: str | None = None
    release_note: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class DeviceBomTemplatePromoteRequest(BaseModel):
    source_version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    target_version: str = Field(pattern=r"^\d+(?:\.\d+)*$")
    name: str | None = None
    retire_reason: str | None = None
    approved_by: str | None = None
    release_note: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class DeviceBomItemCreate(BaseModel):
    component_type: str
    substitution_group: str | None = None
    required_part_number: str | None = None
    required_revision: str | None = None
    required_drawing_number: str | None = None
    required_drawing_revision: str | None = None
    quantity_required: int = Field(default=1, ge=1)
    is_required: bool = True


class DeviceBomItemUpdate(BaseModel):
    substitution_group: str | None = None
    required_part_number: str | None = None
    required_revision: str | None = None
    required_drawing_number: str | None = None
    required_drawing_revision: str | None = None
    quantity_required: int | None = Field(default=None, ge=1)
    is_required: bool | None = None


class DeviceBomItemRead(DeviceBomItemCreate):
    id: str
    template_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DeviceBomItemSnapshotRead(BaseModel):
    component_type: str
    substitution_group: str | None = None
    required_part_number: str | None = None
    required_revision: str | None = None
    required_drawing_number: str | None = None
    required_drawing_revision: str | None = None
    quantity_required: int
    is_required: bool


class DeviceBomItemDiffRead(BaseModel):
    component_type: str
    change_type: str
    source: DeviceBomItemSnapshotRead | None = None
    target: DeviceBomItemSnapshotRead | None = None


class DeviceBomTemplateDiffRead(BaseModel):
    device_type: str
    variant_code: str
    source_version: str
    target_version: str
    added: list[DeviceBomItemSnapshotRead]
    removed: list[DeviceBomItemSnapshotRead]
    modified: list[DeviceBomItemDiffRead]
    unchanged_count: int


class QcChecklistCreate(BaseModel):
    checklist_code: str
    name: str
    process_stage: str
    version: str
    is_active: bool = True


class QcChecklistRead(QcChecklistCreate):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class QcStepCreate(BaseModel):
    step_order: int
    title: str
    instruction: str | None = None
    requires_photo: bool = False
    requires_measurement: bool = False
    blocking_on_fail: bool = True
    expected_value: str | None = None
    unit: str | None = None
    tolerance_min: float | None = None
    tolerance_max: float | None = None


class QcStepRead(QcStepCreate):
    id: str
    checklist_id: str

    model_config = {"from_attributes": True}


class QcRunBase(BaseModel):
    run_id: str
    device_serial_number: str | None = None
    item_serial_number: str | None = None
    barcode_value: str | None = None
    checklist_id: str | None = None
    process_stage: str
    operator_id: str | None = None


class QcRunCreate(QcRunBase):
    work_session_id: str | None = None


class QcRunRead(QcRunBase):
    id: str
    status: str
    result: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}


class QcStepResultCreate(BaseModel):
    status: str
    measurement_value: float | None = None
    comment: str | None = None
    mcu_snapshot: dict[str, Any] | None = None


class QcStepResultRead(QcStepResultCreate):
    id: str
    qc_run_id: str
    step_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FinalTestBase(BaseModel):
    test_run_id: str
    device_serial_number: str
    operator_id: str | None = None
    result: str = Field(pattern="^(PASS|FAIL|HOLD)$")
    firmware_version: str | None = None
    bootloader_version: str | None = None
    report_path: str | None = None
    mcu_log_path: str | None = None


class FinalTestCreate(FinalTestBase):
    work_session_id: str | None = None


class FinalTestRead(FinalTestBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class NonconformityCreate(BaseModel):
    ncr_id: str
    device_serial_number: str | None = None
    component_serial_number: str | None = None
    process_stage: str | None = None
    description: str
    severity: str = "MEDIUM"
    detected_by: str | None = None
    corrective_action: str | None = None


class NonconformityRead(NonconformityCreate):
    id: str
    status: str
    detected_at: datetime
    closed_at: datetime | None = None

    model_config = {"from_attributes": True}


class NonconformityUpdate(BaseModel):
    status: str | None = None
    corrective_action: str | None = None
    severity: str | None = None


class ServiceSessionRead(BaseModel):
    id: str
    session_id: str
    device_serial_number: str
    device_type: str | None = None
    technician_id: str | None = None
    result: str | None = None
    firmware_version: str | None = None
    bootloader_version: str | None = None
    package_path: str | None = None
    package_hash: str | None = None
    upload_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FileRead(BaseModel):
    id: str
    related_entity_type: str
    related_entity_id: str
    file_name: str
    file_path: str
    file_type: str | None = None
    file_hash: str | None = None
    uploaded_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class OperatorCreate(BaseModel):
    operator_id: str
    full_name: str
    role: str
    rfid_uid_hash: str | None = None
    is_active: bool = True


class OperatorRead(OperatorCreate):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RfidLoginRequest(BaseModel):
    rfid_uid_hash: str
    workstation_id: str
    machine_id: str | None = None


class WorkSessionRead(BaseModel):
    id: str
    work_session_id: str
    operator_id: str
    workstation_id: str
    machine_id: str | None = None
    status: str
    started_at: datetime
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}


class WorkSessionCloseRequest(BaseModel):
    reason: str | None = None


class AuditEventRead(BaseModel):
    id: str
    event_type: str
    entity_type: str
    entity_id: str
    work_session_id: str | None = None
    operator_id: str | None = None
    workstation_id: str | None = None
    machine_id: str | None = None
    result: str | None = None
    message: str | None = None
    payload: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkstationCreate(BaseModel):
    workstation_id: str
    name: str
    area: str | None = None
    station_type: str | None = None


class WorkstationRead(WorkstationCreate):
    id: str
    is_active: bool

    model_config = {"from_attributes": True}


class MachineCreate(BaseModel):
    machine_id: str
    name: str
    machine_type: str | None = None
    location: str | None = None


class MachineRead(MachineCreate):
    id: str
    is_active: bool

    model_config = {"from_attributes": True}


class BarcodeCreate(BaseModel):
    barcode_value: str
    entity_type: str
    entity_serial_number: str
    label_type: str = "QR_OR_BARCODE"
    printed_by: str | None = None


class BarcodeRead(BarcodeCreate):
    id: str
    printed_at: datetime
    print_count: int
    status: str

    model_config = {"from_attributes": True}


class BarcodeStatusUpdate(BaseModel):
    status: str


class ProductionItemBase(BaseModel):
    item_serial_number: str
    barcode_value: str
    item_type: str
    part_number: str | None = None
    revision: str | None = None
    drawing_number: str | None = None
    drawing_revision: str | None = None
    production_order: str | None = None
    material_batch: str | None = None
    machine_id: str | None = None
    created_by_operator_id: str | None = None
    current_status: str = "LABELED"


class ProductionItemCreate(ProductionItemBase):
    work_session_id: str | None = None
    workstation_id: str | None = None


class ProductionItemRead(ProductionItemBase):
    id: str
    produced_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductionItemStatusUpdate(BaseModel):
    current_status: str


class ScanEventBase(BaseModel):
    scan_event_id: str
    barcode_value: str
    operator_id: str | None = None
    workstation_id: str | None = None
    context: str
    result: str
    message: str | None = None


class ScanEventCreate(ScanEventBase):
    work_session_id: str | None = None


class ScanEventRead(ScanEventBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AssemblyScanRequest(BaseModel):
    child_barcode_value: str
    component_type: str
    installed_by: str | None = None
    workstation_id: str | None = None
    work_session_id: str | None = None


class AssemblyLinkRead(BaseModel):
    id: str
    parent_device_serial_number: str
    child_item_serial_number: str
    child_barcode_value: str
    component_type: str
    installed_by: str | None = None
    installed_at: datetime
    workstation_id: str | None = None
    scan_event_id: str | None = None
    bom_template_id: str | None = None
    bom_version: str | None = None
    status: str

    model_config = {"from_attributes": True}
