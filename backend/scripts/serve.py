"""Hosted entry point: validate configuration, migrate, then serve."""

import os
import subprocess
from urllib.parse import urlsplit


def validate_environment(environ):
    if not environ.get("APP_ORIGIN"):
        environ["APP_ORIGIN"] = environ.get("RENDER_EXTERNAL_URL", "")
    if not environ.get("DATABASE_URL", "").startswith("postgresql+psycopg://"):
        raise ValueError("Set DATABASE_URL using postgresql+psycopg://; never print its value")
    origin = urlsplit(environ.get("APP_ORIGIN", ""))
    if not origin.hostname or origin.path or origin.query or origin.fragment or origin.username:
        raise ValueError("APP_ORIGIN must be the exact origin without a trailing slash or path")
    production = environ.get("ENVIRONMENT", "production") == "production"
    if origin.scheme != ("https" if production else "http"):
        raise ValueError("Production APP_ORIGIN must use HTTPS; local checks use HTTP")
    port = int(environ.get("PORT", "10000"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be between 1 and 65535")
    return port


if __name__ == "__main__":
    port = validate_environment(os.environ)
    subprocess.run(["alembic", "upgrade", "head"], check=True)
    os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(port)])
