from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth, routes
from app.database import Account, AccountStatsHistory, Alert, Base, SyncLog, Video, VideoStatsHistory, get_db


class ApiV2TestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)
        cls.config = {
            "security": {"web_password": "test-password", "api_key": ""},
            "monitor": {"interval_minutes": 30},
            "sync": {"max_workers": 2},
            "tiktok": {"provider": "auto"},
            "alerts": {"enabled": True, "play_surge_threshold": 500},
            "notifications": {"enabled": False},
        }
        cls.enqueued: list[int] = []

        def override_get_db():
            db = cls.Session()
            try:
                yield db
            finally:
                db.close()

        def save_config(config: dict):
            cls.config = deepcopy(config)

        routes.app.dependency_overrides[get_db] = override_get_db
        routes.get_security_settings = lambda: cls.config["security"]
        auth.get_security_settings = lambda: cls.config["security"]
        routes.load_config = lambda: deepcopy(cls.config)
        routes._save_config = save_config
        routes.enqueue_account_sync = lambda ids: cls.enqueued.extend(ids)
        routes.ensure_ytdlp = lambda: None
        routes.start_scheduler = lambda: None
        routes.stop_scheduler = lambda: None
        cls.client = TestClient(routes.app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        routes.app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        db = self.Session()
        try:
            for model in (VideoStatsHistory, AccountStatsHistory, Alert, SyncLog, Video, Account):
                db.query(model).delete()
            db.commit()
        finally:
            db.close()
        self.client.cookies.clear()
        auth._sessions.clear()
        self.enqueued.clear()
        self.config["monitor"] = {"interval_minutes": 30}
        self.config["alerts"] = {"enabled": True, "play_surge_threshold": 500}

    def login(self):
        response = self.client.post("/api/v2/auth/login", json={"password": "test-password"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertTrue(body["data"]["authenticated"])
        self.assertTrue(body["data"]["session_token"])

    def login_token(self) -> str:
        response = self.client.post("/api/v2/auth/login", json={"password": "test-password"})
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]["session_token"]

    def create_account(self, username: str) -> int:
        response = self.client.post(
            "/api/v2/accounts",
            json={"username": username, "group_name": "Team A", "sync": False},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["ok"])
        return body["data"]["id"]

    def test_v2_requires_auth_with_uniform_error(self):
        response = self.client.get("/api/v2/accounts")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.json(),
            {"ok": False, "data": None, "error": {"code": "unauthorized", "message": "Unauthorized"}},
        )

    def test_login_account_crud_pagination_and_sync(self):
        invalid = self.client.post("/api/v2/auth/login", json={"password": "wrong"})
        self.assertEqual(invalid.status_code, 401)
        self.assertEqual(invalid.json()["error"]["code"], "invalid_credentials")
        self.login()

        invalid_page = self.client.get("/api/v2/accounts?page=not-a-number")
        self.assertEqual(invalid_page.status_code, 422)
        self.assertEqual(invalid_page.json()["error"]["code"], "validation_error")

        first_id = self.create_account("first-account")
        self.create_account("second-account")
        self.create_account("third-account")

        duplicate = self.client.post("/api/v2/accounts", json={"username": "first-account"})
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["error"]["code"], "account_exists")
        self.assertEqual(duplicate.json()["data"]["id"], first_id)

        accounts = self.client.get("/api/v2/accounts?page=2&per_page=2")
        self.assertEqual(accounts.status_code, 200)
        body = accounts.json()
        self.assertTrue(body["ok"])
        self.assertEqual({key: body["meta"][key] for key in ("page", "per_page", "total", "total_pages")}, {"page": 2, "per_page": 2, "total": 3, "total_pages": 2})
        self.assertEqual(len(body["data"]), 1)

        updated = self.client.patch(f"/api/v2/accounts/{first_id}", json={"employee": "Alice"})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["data"]["employee"], "Alice")

        synced = self.client.post(f"/api/v2/accounts/{first_id}/sync")
        self.assertEqual(synced.status_code, 200)
        self.assertEqual(self.enqueued, [first_id])

        sync_all = self.client.post("/api/v2/sync/all")
        self.assertEqual(sync_all.status_code, 200)
        self.assertEqual(sync_all.json()["data"]["queued"], 3)
        self.assertEqual(len(self.enqueued), 4)

        deleted = self.client.delete(f"/api/v2/accounts/{first_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["data"]["id"], first_id)

    def test_v2_dashboard_and_account_filters(self):
        self.login()
        first_id = self.create_account("alpha-account")
        second_id = self.create_account("beta-account")

        self.client.patch(
            f"/api/v2/accounts/{first_id}",
            json={"group_name": "Beauty", "phone": "Phone A", "employee": "Alice", "note": "priority"},
        )
        self.client.patch(
            f"/api/v2/accounts/{second_id}",
            json={"group_name": "Kitchen", "phone": "Phone B", "employee": "Bob"},
        )

        now = datetime.now(timezone.utc)
        db = self.Session()
        try:
            db.add(
                Video(
                    account_id=first_id,
                    video_id="alpha-video",
                    title="Alpha today",
                    play_count=1200,
                    like_count=100,
                    published_at=now,
                    last_sync_at=now,
                )
            )
            db.add(
                Video(
                    account_id=second_id,
                    video_id="beta-old",
                    title="Beta old",
                    play_count=300,
                    like_count=20,
                    published_at=now - timedelta(days=3),
                    last_sync_at=now,
                )
            )
            db.add(AccountStatsHistory(account_id=first_id, follower_count=100, total_plays=1200, recorded_at=now))
            db.commit()
        finally:
            db.close()

        dashboard = self.client.get("/api/v2/dashboard")
        self.assertEqual(dashboard.status_code, 200)
        dashboard_body = dashboard.json()
        self.assertTrue(dashboard_body["ok"])
        self.assertIn("employee_report", dashboard_body["data"])
        self.assertIn("group_stats", dashboard_body["data"])
        self.assertIn("Beauty", dashboard_body["data"]["options"]["groups"])
        self.assertGreaterEqual(dashboard_body["data"]["today"]["total_videos"], 1)

        filtered = self.client.get("/api/v2/accounts?group=Beauty&employee=Alice&post_today=yes&sort=today_new_plays_desc")
        self.assertEqual(filtered.status_code, 200)
        filtered_body = filtered.json()
        self.assertEqual(filtered_body["meta"]["total"], 1)
        self.assertEqual(filtered_body["data"][0]["id"], first_id)
        self.assertTrue(filtered_body["data"][0]["posted_today"])
        self.assertEqual(filtered_body["data"][0]["today_post_count"], 1)
        self.assertEqual(filtered_body["data"][0]["today_new_plays"], 1200)
        self.assertEqual(filtered_body["meta"]["filters"]["sort"], "today_new_plays_desc")

        searched = self.client.get("/api/v2/accounts?q=priority")
        self.assertEqual(searched.json()["meta"]["total"], 1)

    def test_v2_accepts_bearer_session_without_cookie(self):
        token = self.login_token()
        self.client.cookies.clear()

        response = self.client.get("/api/v2/accounts", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])

        logout = self.client.post("/api/v2/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(logout.status_code, 200)

        rejected = self.client.get("/api/v2/accounts", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(rejected.status_code, 401)

    def test_v2_video_alert_logs_and_settings(self):
        self.login()
        account_id = self.create_account("video-account")
        health = self.client.get("/api/v2/health")
        self.assertTrue(health.json()["data"]["ok"])
        db = self.Session()
        try:
            video = Video(
                account_id=account_id,
                video_id="123",
                title="Test video",
                play_count=200,
                like_count=20,
                published_at=datetime.now(timezone.utc),
            )
            db.add(video)
            db.flush()
            db.add(VideoStatsHistory(video_id=video.id, play_count=100, recorded_at=datetime.now(timezone.utc)))
            alert = Alert(account_id=account_id, title="Play surge", message="Test", is_read=0)
            db.add(alert)
            db.add(Alert(account_id=account_id, level="error", title="Provider error", message="Test", is_read=0))
            db.add(SyncLog(account_id=account_id, status="success", message="Done"))
            db.commit()
            video_id, alert_id = video.id, alert.id
        finally:
            db.close()

        videos = self.client.get(f"/api/v2/videos?account_id={account_id}&page=1&per_page=1")
        self.assertEqual(videos.status_code, 200)
        self.assertEqual(videos.json()["meta"]["total"], 1)
        detail = self.client.get(f"/api/v2/videos/{video_id}?history_per_page=1")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["data"]["history_meta"]["total"], 1)
        account = self.client.get(f"/api/v2/accounts/{account_id}")
        self.assertEqual(account.json()["data"]["videos_meta"]["total"], 1)
        self.assertEqual(account.json()["data"]["logs_meta"]["total"], 1)

        alerts = self.client.get("/api/v2/alerts?unread_only=true")
        self.assertEqual(alerts.status_code, 200)
        self.assertEqual(alerts.json()["meta"]["total"], 2)
        errors = self.client.get("/api/v2/alerts?level=error")
        self.assertEqual(errors.json()["meta"]["total"], 1)
        marked = self.client.post(f"/api/v2/alerts/{alert_id}/read")
        self.assertTrue(marked.json()["data"]["is_read"])
        batch_marked = self.client.post("/api/v2/alerts/mark-read", json={"ids": [errors.json()["data"][0]["id"]]})
        self.assertEqual(batch_marked.json()["data"]["updated"], 1)
        read_all = self.client.post("/api/v2/alerts/read-all")
        self.assertEqual(read_all.json()["data"]["updated"], 0)

        logs = self.client.get("/api/v2/sync/logs")
        self.assertEqual(logs.status_code, 200)
        self.assertEqual(logs.json()["meta"]["total"], 1)

        settings = self.client.patch("/api/v2/settings", json={"monitor": {"interval_minutes": 45}})
        self.assertEqual(settings.status_code, 200)
        self.assertEqual(settings.json()["data"]["monitor"]["interval_minutes"], 45)

        imported = self.client.post("/api/v2/import/accounts", json={"raw": "imported-account", "sync": False})
        self.assertEqual(imported.status_code, 200)
        self.assertEqual(imported.json()["data"]["added"], 1)
        providers = self.client.get("/api/v2/providers/health")
        self.assertTrue(providers.json()["ok"])


if __name__ == "__main__":
    unittest.main()
