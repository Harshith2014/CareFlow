"""Run only against a NEW careflow_test_migration* database; never drop application data."""

import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

url = os.environ["DATABASE_URL"]
if not make_url(url).database.startswith("careflow_test_migration"):
    raise SystemExit("Migration verification requires a fresh careflow_test_migration* database")
engine = create_engine(url)
if inspect(engine).get_table_names():
    raise SystemExit("Migration database must be empty; choose a new disposable database")
config = Config("alembic.ini")
command.upgrade(config, "001")
with engine.begin() as connection:
    connection.execute(
        text(
            "INSERT INTO users(id,email,name,password_hash,role,active) VALUES ('migration-doctor','migration@example.test','Fictional Migration Doctor','not-a-login-hash','doctor',true)"
        )
    )
    connection.execute(
        text(
            "INSERT INTO patients(id,name,date_of_birth,contact) VALUES ('migration-patient','Fictional Migration Patient','2000-01-01','fictional@example.test')"
        )
    )
    connection.execute(
        text(
            "INSERT INTO slots(id,doctor_id,starts_at) VALUES ('migration-slot','migration-doctor','2099-01-01T09:00:00Z')"
        )
    )
    connection.execute(
        text(
            "INSERT INTO appointments(id,slot_id,patient_id,status) VALUES ('migration-booking','migration-slot','migration-patient','scheduled')"
        )
    )
command.upgrade(config, "head")
with engine.connect() as connection:
    assert connection.execute(
        text(
            "SELECT slot_id, patient_id, status, version FROM appointments WHERE id='migration-booking'"
        )
    ).one() == ("migration-slot", "migration-patient", "scheduled", 1)
command.check(config)
print("001 -> head preserves the existing booking and defaults its version; no schema drift")
