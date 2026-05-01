"""add BOM template status

Revision ID: c4e6f8129ab3
Revises: b71c2d4e5f90
Create Date: 2026-05-01 01:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c4e6f8129ab3"
down_revision = "b71c2d4e5f90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.add_column(
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default="ACTIVE",
            )
        )

    op.execute(
        "UPDATE device_bom_templates "
        "SET status = CASE WHEN is_active = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END"
    )

    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.alter_column("status", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.drop_column("status")
