"""add BOM drawing number and revision rules

Revision ID: b71c2d4e5f90
Revises: a9f2d1c6b7e3
Create Date: 2026-05-01 01:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "b71c2d4e5f90"
down_revision = "a9f2d1c6b7e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("device_bom_items") as batch_op:
        batch_op.add_column(sa.Column("required_drawing_number", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("required_drawing_revision", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("device_bom_items") as batch_op:
        batch_op.drop_column("required_drawing_revision")
        batch_op.drop_column("required_drawing_number")
