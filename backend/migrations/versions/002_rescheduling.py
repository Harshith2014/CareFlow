"""Preserve appointments; add versioning, idempotent move history and audit metadata."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "appointments",
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column("audit_events", sa.Column("details", postgresql.JSONB(), nullable=True))
    op.create_table(
        "appointment_moves",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "appointment_id", sa.String(36), sa.ForeignKey("appointments.id"), nullable=False
        ),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("old_slot_id", sa.String(36), sa.ForeignKey("slots.id"), nullable=False),
        sa.Column("new_slot_id", sa.String(36), sa.ForeignKey("slots.id"), nullable=False),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column("expected_version", sa.Integer(), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("old_slot_id <> new_slot_id"),
    )
    op.create_index("ix_appointment_moves_appointment_id", "appointment_moves", ["appointment_id"])
    op.create_index(
        "unique_appointment_move_request",
        "appointment_moves",
        ["appointment_id", "request_id"],
        unique=True,
    )


def downgrade():
    op.drop_table("appointment_moves")
    op.drop_column("audit_events", "details")
    op.drop_column("appointments", "version")
