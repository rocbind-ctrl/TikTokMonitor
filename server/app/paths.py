from __future__ import annotations

import os
import sys
from pathlib import Path


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


def resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", app_dir()))
    return app_dir()


def ensure_cwd() -> Path:
    root = app_dir()
    os.chdir(root)
    return root


APP_DIR = app_dir()
RESOURCE_DIR = resource_dir()
CONFIG_PATH = APP_DIR / "config.yaml"
DATA_DIR = APP_DIR / "data"
DB_PATH = DATA_DIR / "monitor.db"
TEMPLATES_DIR = RESOURCE_DIR / "templates"
STATIC_DIR = RESOURCE_DIR / "static"
