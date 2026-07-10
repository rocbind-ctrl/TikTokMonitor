import os
import sys
import shutil
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config.yaml"
CONFIG_EXAMPLE = ROOT / "config.example.yaml"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    if not CONFIG.exists() and CONFIG_EXAMPLE.exists():
        shutil.copyfile(CONFIG_EXAMPLE, CONFIG)

    from app.routes import app

    with TestClient(app) as client:
        health = client.get("/api/health")
        check(health.status_code == 200, f"/api/health failed: {health.status_code}")
        health_data = health.json()
        check(health_data.get("ok") is True, "/api/health ok flag missing")
        check(health_data.get("version") == "5.0", "unexpected app version")

        session = client.get("/api/auth/session")
        check(session.status_code == 200, f"/api/auth/session failed: {session.status_code}")

        stats_unauth = client.get("/api/stats")
        check(stats_unauth.status_code in (200, 401), "protected API returned unexpected status")

        login = client.post("/api/auth/login", json={"password": "change-me"})
        check(login.status_code == 200, f"JSON login failed: {login.status_code}")

        stats = client.get("/api/stats")
        check(stats.status_code == 200, f"/api/stats failed: {stats.status_code}")
        stats_data = stats.json()
        check("total_accounts" in stats_data, "stats account count missing")
        check("total_videos" in stats_data, "stats video count missing")

        accounts = client.get("/api/accounts")
        check(accounts.status_code == 200, f"/api/accounts failed: {accounts.status_code}")
        check(isinstance(accounts.json(), list), "account list should be JSON array")

        settings = client.get("/api/settings")
        check(settings.status_code == 200, f"/api/settings failed: {settings.status_code}")

        for path in ("/alerts", "/settings", "/logs"):
            page = client.get(path)
            check(page.status_code == 200, f"{path} failed: {page.status_code}")
            check("text/html" in page.headers.get("content-type", ""), f"{path} is not HTML")

    print("runtime verification ok")


if __name__ == "__main__":
    main()
