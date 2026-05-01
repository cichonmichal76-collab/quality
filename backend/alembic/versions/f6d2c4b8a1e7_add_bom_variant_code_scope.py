"""add BOM variant code scope

Revision ID: f6d2c4b8a1e7
Revises: e1a4c7d9b5f2
Create Date: 2026-05-01 04:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "f6d2c4b8a1e7"
down_revision = "e1a4c7d9b5f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("devices") as batch_op:
        batch_op.add_column(
            sa.Column("variant_code", sa.String(), nullable=False, server_default="DEFAULT")
        )

    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.add_column(
            sa.Column("variant_code", sa.String(), nullable=False, server_default="DEFAULT")
        )

    op.execute("UPDATE devices SET variant_code = 'DEFAULT' WHERE variant_code IS NULL")
    op.execute(
        "UPDATE device_bom_templates SET variant_code = 'DEFAULT' WHERE variant_code IS NULL"
    )

    with op.batch_alter_table("devices") as batch_op:
        batch_op.alter_column("variant_code", server_default=None)

    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.alter_column("variant_code", server_default=None)

    op.drop_index(
        "ux_device_bom_templates_device_type_version",
        table_name="device_bom_templates",
    )
    op.drop_index(
        "ix_device_bom_templates_device_type_status",
        table_name="device_bom_templates",
    )
    op.create_index(
        "ux_device_bom_templates_device_type_variant_code_version",
        "device_bom_templates",
        ["device_type", "variant_code", "version"],
        unique=True,
    )
    op.create_index(
        "ix_device_bom_templates_device_type_variant_code_status",
        "device_bom_templates",
        ["device_type", "variant_code", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_device_bom_templates_device_type_variant_code_status",
        table_name="device_bom_templates",
    )
    op.drop_index(
        "ux_device_bom_templates_device_type_variant_code_version",
        table_name="device_bom_templates",
    )
    op.create_index(
        "ux_device_bom_templates_device_type_version",
        "device_bom_templates",
        ["device_type", "version"],
        unique=True,
    )
    op.create_index(
        "ix_device_bom_templates_device_type_status",
        "device_bom_templates",
        ["device_type", "status"],
        unique=False,
    )

    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.drop_column("variant_code")

    with op.batch_alter_table("devices") as batch_op:
        batch_op.drop_column("variant_code")
