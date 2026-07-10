import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parent


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))

    from app.routes import app

    with TestClient(app) as client:
        health = client.get("/api/health")
        check(health.status_code == 200, f"/api/health failed: {health.status_code}")
        health_data = health.json()
        check(health_data.get("ok") is True, "/api/health ok flag missing")
        check(health_data.get("version") == "5.0", "unexpected app version")

        stats_unauth = client.get("/api/stats")
        check(stats_unauth.status_code == 401, "protected API should require login")

        login = client.post("/login", data={"password": "000000"}, allow_redirects=False)
        check(login.status_code == 303, f"login failed: {login.status_code}")

        stats = client.get("/api/stats")
        check(stats.status_code == 200, f"/api/stats failed: {stats.status_code}")
        stats_data = stats.json()
        check(stats_data.get("total_accounts") == 10, "sample account count mismatch")
        check(stats_data.get("total_videos") == 64, "sample video count mismatch")

        accounts = client.get("/api/accounts")
        check(accounts.status_code == 200, f"/api/accounts failed: {accounts.status_code}")
        check(len(accounts.json()) == 10, "sample account list mismatch")

        for path in ("/alerts", "/settings", "/logs"):
            page = client.get(path)
            check(page.status_code == 200, f"{path} failed: {page.status_code}")
            check("text/html" in page.headers.get("content-type", ""), f"{path} is not HTML")

    print("runtime verification ok")


if __name__ == "__main__":
    main()
