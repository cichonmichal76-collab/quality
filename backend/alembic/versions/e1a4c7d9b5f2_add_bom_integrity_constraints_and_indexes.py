"""add BOM integrity constraints and indexes

Revision ID: e1a4c7d9b5f2
Revises: c4e6f8129ab3
Create Date: 2026-05-01 04:10:00
"""

from __future__ import annotations

from alembic import op


revision = "e1a4c7d9b5f2"
down_revision = "c4e6f8129ab3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_device_bom_templates_device_type_status",
        "device_bom_templates",
        ["device_type", "status"],
        unique=False,
    )
    op.create_index(
        "ix_assembly_links_bom_template_id",
        "assembly_links",
        ["bom_template_id"],
        unique=False,
    )
    op.create_index(
        "ix_device_bom_items_template_id",
        "device_bom_items",
        ["template_id"],
        unique=False,
    )
    op.create_index(
        "ux_device_bom_items_template_component_type",
        "device_bom_items",
        ["template_id", "component_type"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ux_device_bom_items_template_component_type",
        table_name="device_bom_items",
    )
    op.drop_index("ix_device_bom_items_template_id", table_name="device_bom_items")
    op.drop_index("ix_assembly_links_bom_template_id", table_name="assembly_links")
    op.drop_index(
        "ix_device_bom_templates_device_type_status",
        table_name="device_bom_templates",
    )
