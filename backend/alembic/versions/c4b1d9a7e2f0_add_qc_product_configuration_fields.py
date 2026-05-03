"""add qc product configuration fields

Revision ID: c4b1d9a7e2f0
Revises: d3a6c1b2e4f5
Create Date: 2026-05-03 15:45:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c4b1d9a7e2f0"
down_revision: str | None = "d3a6c1b2e4f5"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("qc_checklists", sa.Column("device_type", sa.String(), nullable=True))
    op.add_column("qc_checklists", sa.Column("variant_code", sa.String(), nullable=True))
    op.add_column("qc_checklists", sa.Column("component_type", sa.String(), nullable=True))
    op.add_column(
        "qc_checklists",
        sa.Column("skip_component_qc", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "qc_checklists",
        sa.Column("reference_image_file_id", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_qc_checklists_device_type",
        "qc_checklists",
        ["device_type"],
        unique=False,
    )
    op.create_index(
        "ix_qc_checklists_component_type",
        "qc_checklists",
        ["component_type"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_qc_checklists_reference_image_file_id",
        "qc_checklists",
        "files",
        ["reference_image_file_id"],
        ["id"],
    )

    op.add_column("qc_steps", sa.Column("control_area", sa.Text(), nullable=True))
    op.add_column(
        "qc_steps",
        sa.Column(
            "evaluation_mode",
            sa.String(),
            nullable=False,
            server_default="MANUAL",
        ),
    )
    op.add_column("qc_steps", sa.Column("result_input_label", sa.String(), nullable=True))

    op.add_column("qc_step_results", sa.Column("observed_value", sa.String(), nullable=True))

    op.alter_column("qc_checklists", "skip_component_qc", server_default=None)
    op.alter_column("qc_steps", "evaluation_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("qc_step_results", "observed_value")

    op.drop_column("qc_steps", "result_input_label")
    op.drop_column("qc_steps", "evaluation_mode")
    op.drop_column("qc_steps", "control_area")

    op.drop_constraint(
        "fk_qc_checklists_reference_image_file_id",
        "qc_checklists",
        type_="foreignkey",
    )
    op.drop_index("ix_qc_checklists_component_type", table_name="qc_checklists")
    op.drop_index("ix_qc_checklists_device_type", table_name="qc_checklists")
    op.drop_column("qc_checklists", "reference_image_file_id")
    op.drop_column("qc_checklists", "skip_component_qc")
    op.drop_column("qc_checklists", "component_type")
    op.drop_column("qc_checklists", "variant_code")
    op.drop_column("qc_checklists", "device_type")
