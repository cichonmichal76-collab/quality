"""add BOM substitution groups

Revision ID: f4c8b9a1d2e3
Revises: c8d4e1b2f7a9
Create Date: 2026-05-01 06:05:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "f4c8b9a1d2e3"
down_revision = "c8d4e1b2f7a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("device_bom_items") as batch_op:
        batch_op.add_column(sa.Column("substitution_group", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("device_bom_items") as batch_op:
        batch_op.drop_column("substitution_group")
