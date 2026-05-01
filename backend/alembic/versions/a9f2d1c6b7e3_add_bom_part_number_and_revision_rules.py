"""add BOM part number and revision rules

Revision ID: a9f2d1c6b7e3
Revises: 8e1b7c4d2a10
Create Date: 2026-05-01 01:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a9f2d1c6b7e3"
down_revision = "8e1b7c4d2a10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("device_bom_items") as batch_op:
        batch_op.add_column(sa.Column("required_part_number", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("required_revision", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("device_bom_items") as batch_op:
        batch_op.drop_column("required_revision")
        batch_op.drop_column("required_part_number")
