"""add component qc flag to assembly links

Revision ID: 4f2a8c7e9b31
Revises: 2f7c9e1a4b6d
Create Date: 2026-05-01 08:55:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "4f2a8c7e9b31"
down_revision = "2f7c9e1a4b6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assembly_links") as batch_op:
        batch_op.add_column(
            sa.Column(
                "component_qc_passed",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("assembly_links") as batch_op:
        batch_op.drop_column("component_qc_passed")
