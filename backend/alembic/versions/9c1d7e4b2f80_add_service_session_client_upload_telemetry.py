"""add service session client upload telemetry

Revision ID: 9c1d7e4b2f80
Revises: 5b7f2a1c9d4e
Create Date: 2026-05-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9c1d7e4b2f80"
down_revision = "5b7f2a1c9d4e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "service_sessions",
        sa.Column("upload_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "service_sessions",
        sa.Column("client_attempt_id", sa.String(), nullable=True),
    )
    op.add_column(
        "service_sessions",
        sa.Column("client_attempt_number", sa.Integer(), nullable=True),
    )
    op.add_column(
        "service_sessions",
        sa.Column("client_trigger_source", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("service_sessions", "client_trigger_source")
    op.drop_column("service_sessions", "client_attempt_number")
    op.drop_column("service_sessions", "client_attempt_id")
    op.drop_column("service_sessions", "upload_count")
