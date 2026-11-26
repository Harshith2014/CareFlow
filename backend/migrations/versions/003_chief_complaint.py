"""Add optional chief_complaint to appointments."""

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "appointments",
        sa.Column("chief_complaint", sa.String(300), nullable=True),
    )


def downgrade():
    op.drop_column("appointments", "chief_complaint")
