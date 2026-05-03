"""add qc item reservation fields

Revision ID: a7c4d8e1f2b3
Revises: e5c1a7d4b9f2
Create Date: 2026-05-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision: str = "a7c4d8e1f2b3"
down_revision: str | None = "e5c1a7d4b9f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "production_items",
        sa.Column("qc_reserved_by_operator_id", sa.String(), nullable=True),
    )
    op.add_column(
        "production_items",
        sa.Column("qc_reserved_by_workstation_id", sa.String(), nullable=True),
    )
    op.add_column(
        "production_items",
        sa.Column("qc_reserved_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("production_items", "qc_reserved_at")
    op.drop_column("production_items", "qc_reserved_by_workstation_id")
    op.drop_column("production_items", "qc_reserved_by_operator_id")
