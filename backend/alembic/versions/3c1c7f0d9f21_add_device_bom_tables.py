"""add device BOM tables

Revision ID: 3c1c7f0d9f21
Revises: 9bfe77cf8306
Create Date: 2026-05-01 00:00:00
"""

from __future__ import annotations

import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "3c1c7f0d9f21"
down_revision = "9bfe77cf8306"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_bom_templates",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("device_type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_device_bom_templates_device_type"),
        "device_bom_templates",
        ["device_type"],
        unique=True,
    )

    op.create_table(
        "device_bom_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("template_id", sa.String(), nullable=False),
        sa.Column("component_type", sa.String(), nullable=False),
        sa.Column("quantity_required", sa.Integer(), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["device_bom_templates.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    template_id = str(uuid.uuid4())
    op.bulk_insert(
        sa.table(
            "device_bom_templates",
            sa.column("id", sa.String()),
            sa.column("device_type", sa.String()),
            sa.column("name", sa.String()),
            sa.column("version", sa.String()),
            sa.column("is_active", sa.Boolean()),
            sa.column("created_at", sa.DateTime()),
        ),
        [
            {
                "id": template_id,
                "device_type": "ZSS",
                "name": "Default ZSS BOM",
                "version": "1.0",
                "is_active": True,
                "created_at": datetime.utcnow(),
            }
        ],
    )
    op.bulk_insert(
        sa.table(
            "device_bom_items",
            sa.column("id", sa.String()),
            sa.column("template_id", sa.String()),
            sa.column("component_type", sa.String()),
            sa.column("quantity_required", sa.Integer()),
            sa.column("is_required", sa.Boolean()),
            sa.column("created_at", sa.DateTime()),
        ),
        [
            {
                "id": str(uuid.uuid4()),
                "template_id": template_id,
                "component_type": "CONTROL_PCB",
                "quantity_required": 1,
                "is_required": True,
                "created_at": datetime.utcnow(),
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("device_bom_items")
    op.drop_index(op.f("ix_device_bom_templates_device_type"), table_name="device_bom_templates")
    op.drop_table("device_bom_templates")
