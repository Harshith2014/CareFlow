from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.config import settings
from app.create_admin import create_initial_admin
from app.db import SessionLocal
from app.hosting import mount_frontend
from app.models import Audit, User
from app.schemas import StaffInput
from app.security import passwords
from scripts.serve import validate_environment


def admin_input(email="owner@example.test"):
    return StaffInput(
        email=email,
        name="Fictional Owner",
        password="Private-Hosting-Test-2026!",
        role="administrator",
    )


def test_hosted_origin_and_port():
    env = {
        "DATABASE_URL": "postgresql+psycopg://local/test",
        "APP_ORIGIN": "https://careflow.example.test",
        "ENVIRONMENT": "production",
        "PORT": "10000",
    }
    assert validate_environment(env) == 10000
    automatic = {**env, "APP_ORIGIN": "", "RENDER_EXTERNAL_URL": "https://assigned.onrender.com"}
    assert validate_environment(automatic) == 10000
    assert automatic["APP_ORIGIN"] == "https://assigned.onrender.com"
    for origin in [
        "http://careflow.example.test",
        "https://careflow.example.test/",
        "https://careflow.example.test/path",
        "https://user:password@careflow.example.test",
        "",
    ]:
        with pytest.raises(ValueError):
            validate_environment({**env, "APP_ORIGIN": origin})
    with pytest.raises(ValueError):
        validate_environment({**env, "DATABASE_URL": "postgresql://local/test"})
    with pytest.raises(ValueError):
        validate_environment({**env, "PORT": "70000"})


def test_static_files_do_not_shadow_api_or_expose_parent(tmp_path):
    root = tmp_path / "dist"
    root.mkdir()
    (root / "index.html").write_text("<html>CareFlow fictional demo</html>")
    (tmp_path / "secret.txt").write_text("must not be served")
    app = FastAPI()

    @app.get("/api/example")
    def api():
        return {"api": True}

    mount_frontend(app, str(root))
    with TestClient(app) as client:
        assert "CareFlow fictional demo" in client.get("/").text
        assert client.get("/api/example").json() == {"api": True}
        assert client.get("/api/unknown").status_code == 404
        assert client.get("/%2e%2e/secret.txt").status_code == 404


def test_missing_frontend_fails_fast(tmp_path):
    with pytest.raises(RuntimeError, match="index.html"):
        mount_frontend(FastAPI(), str(tmp_path))


def test_hosted_headers(reception, monkeypatch):
    monkeypatch.setattr(settings(), "static_dir", "hosted")
    response = reception.get("/api/health")
    assert response.status_code == 200
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_bootstrap_refuses_existing_staff():
    with pytest.raises(ValueError, match="Staff already exist"):
        create_initial_admin(admin_input())
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 4


def test_first_admin_concurrent_creation_hash_and_audit():
    with SessionLocal.begin() as db:
        db.execute(text("TRUNCATE users CASCADE"))
    barrier = Barrier(2)

    def attempt(index):
        barrier.wait(timeout=10)
        try:
            create_initial_admin(admin_input(f"owner{index}@example.test"))
            return "created"
        except ValueError:
            return "refused"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == ["created", "refused"]
    with SessionLocal() as db:
        user = db.scalar(select(User))
        assert user.role == "administrator"
        assert user.password_hash != admin_input().password
        assert passwords.verify(admin_input().password, user.password_hash)
        event = db.scalar(select(Audit).where(Audit.action == "staff.initial_admin_created"))
        assert event.actor_id == event.record_id == user.id
        assert db.scalar(select(func.count()).select_from(User)) == 1
