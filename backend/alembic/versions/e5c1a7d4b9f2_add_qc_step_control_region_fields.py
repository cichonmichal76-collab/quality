"""add qc step control region fields

Revision ID: e5c1a7d4b9f2
Revises: c4b1d9a7e2f0
Create Date: 2026-05-03 16:25:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e5c1a7d4b9f2"
down_revision: str | None = "c4b1d9a7e2f0"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("qc_steps", sa.Column("region_x", sa.Numeric(), nullable=True))
    op.add_column("qc_steps", sa.Column("region_y", sa.Numeric(), nullable=True))
    op.add_column("qc_steps", sa.Column("region_width", sa.Numeric(), nullable=True))
    op.add_column("qc_steps", sa.Column("region_height", sa.Numeric(), nullable=True))


def downgrade() -> None:
    op.drop_column("qc_steps", "region_height")
    op.drop_column("qc_steps", "region_width")
    op.drop_column("qc_steps", "region_y")
    op.drop_column("qc_steps", "region_x")
