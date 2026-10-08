"""Optional built frontend; register API routes before mounting."""

from pathlib import Path

from starlette.staticfiles import StaticFiles


def mount_frontend(app, directory):
    if directory:
        root = Path(directory).resolve()
        if not (root / "index.html").is_file():
            raise RuntimeError("STATIC_DIR must contain the built frontend index.html")
        app.mount("/", StaticFiles(directory=root, html=True), name="frontend")
