"""add BOM effectivity window

Revision ID: c8d4e1b2f7a9
Revises: a4b9d6e2c3f1
Create Date: 2026-05-01 05:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c8d4e1b2f7a9"
down_revision = "a4b9d6e2c3f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.add_column(sa.Column("effective_from", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("effective_to", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("device_bom_templates") as batch_op:
        batch_op.drop_column("effective_to")
        batch_op.drop_column("effective_from")
