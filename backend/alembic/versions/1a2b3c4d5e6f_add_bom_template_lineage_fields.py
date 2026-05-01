"""add BOM template lineage fields

Revision ID: 1a2b3c4d5e6f
Revises: f4c8b9a1d2e3
Create Date: 2026-05-01 06:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "1a2b3c4d5e6f"
down_revision = "f4c8b9a1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.add_column(sa.Column("source_template_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("replaced_by_template_id", sa.String(), nullable=True))
        batch_op.create_index(
            "ix_device_bom_templates_source_template_id",
            ["source_template_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_device_bom_templates_replaced_by_template_id",
            ["replaced_by_template_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.drop_index("ix_device_bom_templates_replaced_by_template_id")
        batch_op.drop_index("ix_device_bom_templates_source_template_id")
        batch_op.drop_column("replaced_by_template_id")
        batch_op.drop_column("source_template_id")
