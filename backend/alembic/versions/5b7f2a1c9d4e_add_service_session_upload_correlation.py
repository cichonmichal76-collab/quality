"""add service session upload correlation metadata

Revision ID: 5b7f2a1c9d4e
Revises: 4f2a8c7e9b31
Create Date: 2026-05-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "5b7f2a1c9d4e"
down_revision = "4f2a8c7e9b31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "service_sessions",
        sa.Column("upload_correlation_id", sa.String(), nullable=True),
    )
    op.add_column(
        "service_sessions",
        sa.Column("uploaded_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("service_sessions", "uploaded_at")
    op.drop_column("service_sessions", "upload_correlation_id")
