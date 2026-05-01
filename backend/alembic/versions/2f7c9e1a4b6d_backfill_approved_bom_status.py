"""backfill approved BOM status

Revision ID: 2f7c9e1a4b6d
Revises: 1a2b3c4d5e6f
Create Date: 2026-05-01 10:45:00
"""

from __future__ import annotations

from alembic import op


revision = "2f7c9e1a4b6d"
down_revision = "1a2b3c4d5e6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE device_bom_templates "
        "SET status = 'APPROVED' "
        "WHERE status = 'INACTIVE' AND is_active = 0 AND approved_at IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE device_bom_templates "
        "SET status = 'INACTIVE' "
        "WHERE status = 'APPROVED' AND is_active = 0"
    )
