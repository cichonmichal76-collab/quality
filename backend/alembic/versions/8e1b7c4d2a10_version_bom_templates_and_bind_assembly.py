"""version BOM templates and bind assembly links

Revision ID: 8e1b7c4d2a10
Revises: 3c1c7f0d9f21
Create Date: 2026-05-01 00:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "8e1b7c4d2a10"
down_revision = "3c1c7f0d9f21"
branch_labels = None
depends_on = None


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    device_type_index_name = op.f("ix_device_bom_templates_device_type")
    if _index_exists("device_bom_templates", device_type_index_name):
        op.drop_index(device_type_index_name, table_name="device_bom_templates")
    op.create_index(
        device_type_index_name,
        "device_bom_templates",
        ["device_type"],
        unique=False,
    )
    op.create_index(
        "ux_device_bom_templates_device_type_version",
        "device_bom_templates",
        ["device_type", "version"],
        unique=True,
    )

    with op.batch_alter_table("assembly_links") as batch_op:
        batch_op.add_column(sa.Column("bom_template_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("bom_version", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_assembly_links_bom_template_id",
            "device_bom_templates",
            ["bom_template_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("assembly_links") as batch_op:
        batch_op.drop_constraint("fk_assembly_links_bom_template_id", type_="foreignkey")
        batch_op.drop_column("bom_version")
        batch_op.drop_column("bom_template_id")

    op.drop_index("ux_device_bom_templates_device_type_version", table_name="device_bom_templates")
    device_type_index_name = op.f("ix_device_bom_templates_device_type")
    if _index_exists("device_bom_templates", device_type_index_name):
        op.drop_index(device_type_index_name, table_name="device_bom_templates")
    op.create_index(
        device_type_index_name,
        "device_bom_templates",
        ["device_type"],
        unique=True,
    )
