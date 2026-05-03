"""add operator login fields

Revision ID: d3a6c1b2e4f5
Revises: 9c1d7e4b2f80
Create Date: 2026-05-03 00:00:00.000000
"""

from __future__ import annotations

import hashlib

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d3a6c1b2e4f5"
down_revision = "9c1d7e4b2f80"
branch_labels = None
depends_on = None

PASSWORD_HASH_ITERATIONS = 150_000


def _hash_operator_password(password: str) -> str:
    salt = f"seed-{password.lower()}"
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_HASH_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt}${digest}"


def upgrade() -> None:
    op.add_column("operators", sa.Column("login_name", sa.String(), nullable=True))
    op.add_column("operators", sa.Column("password_hash", sa.String(), nullable=True))
    op.create_index(
        "ix_operators_login_name",
        "operators",
        ["login_name"],
        unique=True,
    )

    bind = op.get_bind()
    operators = sa.table(
        "operators",
        sa.column("id", sa.String()),
        sa.column("operator_id", sa.String()),
        sa.column("login_name", sa.String()),
        sa.column("password_hash", sa.String()),
    )

    rows = bind.execute(
        sa.select(operators.c.id, operators.c.operator_id),
    ).fetchall()

    for row in rows:
        login_name = (row.operator_id or "").strip().lower()
        bind.execute(
            operators.update()
            .where(operators.c.id == row.id)
            .values(
                login_name=login_name or None,
                password_hash=_hash_operator_password(row.operator_id or ""),
            )
        )


def downgrade() -> None:
    op.drop_index("ix_operators_login_name", table_name="operators")
    op.drop_column("operators", "password_hash")
    op.drop_column("operators", "login_name")
