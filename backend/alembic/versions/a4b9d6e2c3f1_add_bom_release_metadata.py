"""add BOM release metadata

Revision ID: a4b9d6e2c3f1
Revises: f6d2c4b8a1e7
Create Date: 2026-05-01 05:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a4b9d6e2c3f1"
down_revision = "f6d2c4b8a1e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.add_column(sa.Column("approved_by", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("approved_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("release_note", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.drop_column("release_note")
        batch_op.drop_column("approved_at")
        batch_op.drop_column("approved_by")
