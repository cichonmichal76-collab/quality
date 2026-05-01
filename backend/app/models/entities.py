import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, utc_now


def uuid_str() -> str:
    return str(uuid.uuid4())


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    device_serial_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    device_type: Mapped[str] = mapped_column(String)
    hardware_version: Mapped[str | None] = mapped_column(String, nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String, nullable=True)
    bootloader_version: Mapped[str | None] = mapped_column(String, nullable=True)
    production_status: Mapped[str] = mapped_column(String, default="CREATED")
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class DeviceComponent(Base):
    __tablename__ = "device_components"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    device_serial_number: Mapped[str] = mapped_column(String, index=True)
    component_type: Mapped[str] = mapped_column(String)
    component_serial_number: Mapped[str | None] = mapped_column(String, nullable=True)
    component_part_number: Mapped[str | None] = mapped_column(String, nullable=True)
    component_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    installed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    installed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)


class DeviceBomTemplate(Base):
    __tablename__ = "device_bom_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    device_type: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    version: Mapped[str] = mapped_column(String, default="1.0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class DeviceBomItem(Base):
    __tablename__ = "device_bom_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    template_id: Mapped[str] = mapped_column(String, ForeignKey("device_bom_templates.id"))
    component_type: Mapped[str] = mapped_column(String)
    required_part_number: Mapped[str | None] = mapped_column(String, nullable=True)
    required_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    required_drawing_number: Mapped[str | None] = mapped_column(String, nullable=True)
    required_drawing_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    quantity_required: Mapped[int] = mapped_column(default=1)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class QcChecklist(Base):
    __tablename__ = "qc_checklists"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    checklist_code: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    process_stage: Mapped[str] = mapped_column(String)
    version: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class QcStep(Base):
    __tablename__ = "qc_steps"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    checklist_id: Mapped[str] = mapped_column(String, ForeignKey("qc_checklists.id"))
    step_order: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String)
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    requires_photo: Mapped[bool] = mapped_column(Boolean, default=False)
    requires_measurement: Mapped[bool] = mapped_column(Boolean, default=False)
    blocking_on_fail: Mapped[bool] = mapped_column(Boolean, default=True)
    expected_value: Mapped[str | None] = mapped_column(String, nullable=True)
    unit: Mapped[str | None] = mapped_column(String, nullable=True)
    tolerance_min: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    tolerance_max: Mapped[float | None] = mapped_column(Numeric, nullable=True)


class QcRun(Base):
    __tablename__ = "qc_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    device_serial_number: Mapped[str] = mapped_column(String, index=True)
    item_serial_number: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    barcode_value: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    checklist_id: Mapped[str | None] = mapped_column(String, ForeignKey("qc_checklists.id"), nullable=True)
    process_stage: Mapped[str] = mapped_column(String)
    operator_id: Mapped[str | None] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="IN_PROGRESS")


class QcStepResult(Base):
    __tablename__ = "qc_step_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    qc_run_id: Mapped[str] = mapped_column(String, ForeignKey("qc_runs.id"))
    step_id: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    measurement_value: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    mcu_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class FinalTestRun(Base):
    __tablename__ = "final_test_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    test_run_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    device_serial_number: Mapped[str] = mapped_column(String, index=True)
    operator_id: Mapped[str | None] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result: Mapped[str] = mapped_column(String)
    firmware_version: Mapped[str | None] = mapped_column(String, nullable=True)
    bootloader_version: Mapped[str | None] = mapped_column(String, nullable=True)
    mcu_log_path: Mapped[str | None] = mapped_column(String, nullable=True)
    report_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ServiceSession(Base):
    __tablename__ = "service_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    session_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    device_serial_number: Mapped[str] = mapped_column(String, index=True)
    device_type: Mapped[str | None] = mapped_column(String, nullable=True)
    technician_id: Mapped[str | None] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result: Mapped[str | None] = mapped_column(String, nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String, nullable=True)
    bootloader_version: Mapped[str | None] = mapped_column(String, nullable=True)
    package_path: Mapped[str | None] = mapped_column(String, nullable=True)
    package_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    upload_status: Mapped[str] = mapped_column(String, default="UPLOADED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Nonconformity(Base):
    __tablename__ = "nonconformities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    ncr_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    device_serial_number: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    component_serial_number: Mapped[str | None] = mapped_column(String, nullable=True)
    process_stage: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String, default="MEDIUM")
    status: Mapped[str] = mapped_column(String, default="OPEN")
    detected_by: Mapped[str | None] = mapped_column(String, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    corrective_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class StoredFile(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    related_entity_type: Mapped[str] = mapped_column(String)
    related_entity_id: Mapped[str] = mapped_column(String)
    file_name: Mapped[str] = mapped_column(String)
    file_path: Mapped[str] = mapped_column(String)
    file_type: Mapped[str | None] = mapped_column(String, nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Operator(Base):
    __tablename__ = "operators"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    operator_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    rfid_uid_hash: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Workstation(Base):
    __tablename__ = "workstations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    workstation_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    area: Mapped[str | None] = mapped_column(String, nullable=True)
    station_type: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Machine(Base):
    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    machine_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    machine_type: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class WorkSession(Base):
    __tablename__ = "work_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    work_session_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    workstation_id: Mapped[str] = mapped_column(String, index=True)
    machine_id: Mapped[str | None] = mapped_column(String, nullable=True)
    rfid_uid_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")


class BarcodeLabel(Base):
    __tablename__ = "barcode_labels"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    barcode_value: Mapped[str] = mapped_column(String, unique=True, index=True)
    entity_type: Mapped[str] = mapped_column(String)
    entity_serial_number: Mapped[str] = mapped_column(String, index=True)
    label_type: Mapped[str] = mapped_column(String, default="QR_OR_BARCODE")
    printed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    printed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    print_count: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")


class ProductionItem(Base):
    __tablename__ = "production_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    item_serial_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    barcode_value: Mapped[str] = mapped_column(String, unique=True, index=True)
    item_type: Mapped[str] = mapped_column(String)
    part_number: Mapped[str | None] = mapped_column(String, nullable=True)
    revision: Mapped[str | None] = mapped_column(String, nullable=True)
    drawing_number: Mapped[str | None] = mapped_column(String, nullable=True)
    drawing_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    production_order: Mapped[str | None] = mapped_column(String, nullable=True)
    material_batch: Mapped[str | None] = mapped_column(String, nullable=True)
    machine_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by_operator_id: Mapped[str | None] = mapped_column(String, nullable=True)
    produced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_status: Mapped[str] = mapped_column(String, default="LABELED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    scan_event_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    barcode_value: Mapped[str] = mapped_column(String, index=True)
    operator_id: Mapped[str | None] = mapped_column(String, nullable=True)
    workstation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    context: Mapped[str] = mapped_column(String)
    result: Mapped[str] = mapped_column(String)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class AssemblyLink(Base):
    __tablename__ = "assembly_links"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    parent_device_serial_number: Mapped[str] = mapped_column(String, index=True)
    child_item_serial_number: Mapped[str] = mapped_column(String, index=True)
    child_barcode_value: Mapped[str] = mapped_column(String, index=True)
    component_type: Mapped[str] = mapped_column(String)
    installed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    workstation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    scan_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
    bom_template_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("device_bom_templates.id"),
        nullable=True,
    )
    bom_version: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="INSTALLED")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=uuid_str)
    event_type: Mapped[str] = mapped_column(String, index=True)
    entity_type: Mapped[str] = mapped_column(String, index=True)
    entity_id: Mapped[str] = mapped_column(String, index=True)
    work_session_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    operator_id: Mapped[str | None] = mapped_column(String, nullable=True)
    workstation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    machine_id: Mapped[str | None] = mapped_column(String, nullable=True)
    result: Mapped[str | None] = mapped_column(String, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
