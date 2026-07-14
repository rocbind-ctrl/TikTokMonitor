from __future__ import annotations

from contextlib import closing
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import sqlite3
import tempfile
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth, routes
from app.database import Account, AccountStatsHistory, Alert, AuditLog, Base, ProviderHealth, SyncLog, Video, VideoStatsHistory, get_db


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
            for model in (VideoStatsHistory, AccountStatsHistory, Alert, SyncLog, ProviderHealth, AuditLog, Video, Account):
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
        self.assertEqual(synced.json()["data"]["queued"], 1)
        self.assertEqual(synced.json()["data"]["account_ids"], [first_id])
        self.assertIn("queue_size", synced.json()["data"])
        self.assertEqual(self.enqueued, [first_id])

        sync_all = self.client.post("/api/v2/sync/all")
        self.assertEqual(sync_all.status_code, 200)
        self.assertEqual(sync_all.json()["data"]["queued"], 3)
        self.assertIn("queue_size", sync_all.json()["data"])
        self.assertEqual(len(self.enqueued), 4)

        deleted = self.client.delete(f"/api/v2/accounts/{first_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["data"]["id"], first_id)

    def test_v2_dashboard_and_account_filters(self):
        self.login()
        first_id = self.create_account("alpha-account")
        second_id = self.create_account("beta-account")
        third_id = self.create_account("gamma-empty")

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
            db.add(
                SyncLog(
                    account_id=second_id,
                    status="error",
                    message="provider failed",
                    videos_updated=0,
                    created_at=now,
                )
            )
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

        quality = self.client.get("/api/v2/data-quality")
        self.assertEqual(quality.status_code, 200)
        quality_body = quality.json()
        self.assertTrue(quality_body["ok"])
        cards = {card["key"]: card for card in quality_body["data"]["cards"]}
        self.assertGreaterEqual(cards["no_videos"]["count"], 1)
        self.assertGreaterEqual(cards["sync_failed"]["count"], 1)
        self.assertIn("gamma-empty", [sample["username"] for sample in cards["no_videos"]["samples"]])

        no_videos = self.client.get("/api/v2/accounts?quality=no_videos")
        self.assertEqual(no_videos.status_code, 200)
        self.assertEqual(no_videos.json()["meta"]["filters"]["quality"], "no_videos")
        self.assertEqual(no_videos.json()["meta"]["total"], 1)
        self.assertEqual(no_videos.json()["data"][0]["id"], third_id)
        self.assertTrue(no_videos.json()["data"][0]["quality_flags"]["no_videos"])

        sync_failed = self.client.get("/api/v2/accounts?quality=sync_failed")
        self.assertEqual(sync_failed.status_code, 200)
        self.assertEqual(sync_failed.json()["meta"]["total"], 1)
        self.assertEqual(sync_failed.json()["data"][0]["id"], second_id)

        exported_accounts = self.client.get("/api/v2/export/accounts.csv?group=Beauty&employee=Alice&post_today=yes")
        self.assertEqual(exported_accounts.status_code, 200)
        self.assertIn("text/csv", exported_accounts.headers["content-type"])
        self.assertIn("alpha-account", exported_accounts.text)
        self.assertNotIn("beta-account", exported_accounts.text)

        exported_quality = self.client.get("/api/v2/export/accounts.csv?quality=no_videos")
        self.assertEqual(exported_quality.status_code, 200)
        self.assertIn("gamma-empty", exported_quality.text)
        self.assertNotIn("alpha-account", exported_quality.text)

        exported_videos = self.client.get(f"/api/v2/export/videos.csv?account_id={first_id}")
        self.assertEqual(exported_videos.status_code, 200)
        self.assertIn("alpha-video", exported_videos.text)

    def test_v2_account_status_and_bulk_tag_management(self):
        self.login()
        first_id = self.create_account("status-alpha")
        second_id = self.create_account("status-beta")

        updated = self.client.patch(
            f"/api/v2/accounts/{first_id}",
            json={"group_name": "Beauty", "phone": "Phone A", "employee": "Alice", "note": "priority"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["data"]["group"], "Beauty")
        self.assertEqual(updated.json()["data"]["note"], "priority")

        disabled = self.client.patch(f"/api/v2/accounts/{second_id}", json={"is_active": False})
        self.assertEqual(disabled.status_code, 200)
        self.assertFalse(disabled.json()["data"]["is_active"])

        active_only = self.client.get("/api/v2/accounts")
        self.assertEqual(active_only.status_code, 200)
        self.assertEqual(active_only.json()["meta"]["total"], 1)
        self.assertEqual(active_only.json()["data"][0]["id"], first_id)
        self.assertEqual(active_only.json()["meta"]["filters"]["status"], "active")

        inactive_only = self.client.get("/api/v2/accounts?status=inactive")
        self.assertEqual(inactive_only.status_code, 200)
        self.assertEqual(inactive_only.json()["meta"]["total"], 1)
        self.assertEqual(inactive_only.json()["data"][0]["id"], second_id)

        all_accounts = self.client.get("/api/v2/accounts?status=all")
        self.assertEqual(all_accounts.status_code, 200)
        self.assertEqual(all_accounts.json()["meta"]["total"], 2)

        bulk = self.client.post(
            "/api/v2/accounts/bulk-tag",
            json={
                "filters": {"status": "inactive", "group": "Team A"},
                "updates": {"phone": "Phone B", "employee": "Bob"},
            },
        )
        self.assertEqual(bulk.status_code, 200)
        self.assertEqual(bulk.json()["data"]["updated"], 1)
        self.assertEqual(bulk.json()["data"]["account_ids"], [second_id])

        second = self.client.get(f"/api/v2/accounts/{second_id}")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["data"]["phone"], "Phone B")
        self.assertEqual(second.json()["data"]["employee"], "Bob")

    def test_v2_audit_logs_support_pagination_and_filters(self):
        self.login()
        account_id = self.create_account("audit-account")

        synced = self.client.post(f"/api/v2/accounts/{account_id}/sync")
        self.assertEqual(synced.status_code, 200)

        listed = self.client.get("/api/v2/audit/logs?page=1&per_page=10")
        self.assertEqual(listed.status_code, 200)
        body = listed.json()
        self.assertTrue(body["ok"])
        self.assertGreaterEqual(body["meta"]["total"], 2)
        actions = [item["action"] for item in body["data"]]
        self.assertIn("add_account", actions)
        self.assertIn("sync_account", actions)
        self.assertIn("sync_account", body["meta"]["actions"])

        filtered = self.client.get("/api/v2/audit/logs?action=sync_account&q=audit-account")
        self.assertEqual(filtered.status_code, 200)
        filtered_body = filtered.json()
        self.assertEqual(filtered_body["meta"]["filters"]["action"], "sync_account")
        self.assertEqual(filtered_body["meta"]["total"], 1)
        self.assertEqual(filtered_body["data"][0]["account_id"], account_id)
        self.assertEqual(filtered_body["data"][0]["account_username"], "audit-account")

    def test_v2_backup_list_create_and_download(self):
        self.login()
        original_db_path = routes.DB_PATH
        original_backup_dir = routes.BACKUP_DIR
        with tempfile.TemporaryDirectory() as tmp:
            from pathlib import Path

            root = Path(tmp)
            db_path = root / "monitor.db"
            backup_dir = root / "backups"
            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY, name TEXT)")
                conn.execute("INSERT INTO sample (name) VALUES ('backup-ok')")
                conn.commit()
            routes.DB_PATH = db_path
            routes.BACKUP_DIR = backup_dir
            try:
                created = self.client.post("/api/v2/backups?keep_days=30")
                self.assertEqual(created.status_code, 201)
                created_body = created.json()
                self.assertTrue(created_body["ok"])
                filename = created_body["data"]["name"]
                self.assertTrue(filename.startswith("monitor_"))
                self.assertGreater(created_body["data"]["size"], 0)

                listed = self.client.get("/api/v2/backups")
                self.assertEqual(listed.status_code, 200)
                self.assertEqual(listed.json()["data"]["total"], 1)
                self.assertEqual(listed.json()["data"]["items"][0]["name"], filename)

                downloaded = self.client.get(f"/api/v2/backups/{filename}")
                self.assertEqual(downloaded.status_code, 200)
                self.assertGreater(len(downloaded.content), 0)

                rejected = self.client.get("/api/v2/backups/../monitor.db")
                self.assertEqual(rejected.status_code, 404)
            finally:
                routes.DB_PATH = original_db_path
                routes.BACKUP_DIR = original_backup_dir

    def test_v2_insights_returns_trend_rankings_anomalies_and_gainers(self):
        self.login()
        account_id = self.create_account("insight-account")
        now = datetime.now(timezone.utc)
        db = self.Session()
        try:
            account = db.query(Account).filter(Account.id == account_id).first()
            account.follower_count = 120
            account.total_likes = 500
            account.last_sync_at = now
            video = Video(
                account_id=account_id,
                video_id="insight-video",
                title="Insight video",
                play_count=2000,
                published_at=now - timedelta(hours=3),
                last_sync_at=now,
            )
            db.add(video)
            db.flush()
            db.add(VideoStatsHistory(video_id=video.id, play_count=100, recorded_at=now - timedelta(hours=2)))
            db.add(VideoStatsHistory(video_id=video.id, play_count=650, recorded_at=now))
            db.add(VideoStatsHistory(video_id=video.id, play_count=50, recorded_at=now - timedelta(days=15)))
            db.add(VideoStatsHistory(video_id=video.id, play_count=80, recorded_at=now - timedelta(days=8)))
            db.add(AccountStatsHistory(account_id=account_id, follower_count=80, total_plays=500, recorded_at=now - timedelta(days=15)))
            db.add(AccountStatsHistory(account_id=account_id, follower_count=90, total_plays=700, recorded_at=now - timedelta(days=8)))
            for index, total in enumerate([760, 820, 900, 1000, 2000]):
                db.add(
                    AccountStatsHistory(
                        account_id=account_id,
                        follower_count=100 + index,
                        total_plays=total,
                        recorded_at=now - timedelta(hours=8 - index),
                    )
                )
            db.add(Alert(account_id=account_id, level="warning", title="Insight alert", message="Check insight", is_read=0))
            db.commit()
            video_db_id = video.id
        finally:
            db.close()

        response = self.client.get("/api/v2/insights?days=7&limit=10")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        data = body["data"]
        self.assertGreaterEqual(data["summary"]["ranked_accounts"], 1)
        self.assertGreaterEqual(data["summary"]["unread_alerts"], 1)
        self.assertTrue(data["trend"]["labels"])
        self.assertEqual(data["rankings"][0]["account"]["id"], account_id)
        self.assertIn("health", data["rankings"][0])
        self.assertTrue(any(item["account"]["id"] == account_id for item in data["anomalies"]))
        self.assertEqual(data["gainers"][0]["video"]["id"], video_db_id)
        self.assertGreater(data["gainers"][0]["play_delta"], 0)
        self.assertEqual(data["alerts"][0]["title"], "Insight alert")
        self.assertEqual(data["period"]["days"], 7)
        self.assertEqual(data["coverage"]["comparable_accounts"], 1)
        self.assertEqual(data["coverage"]["comparable_videos"], 1)
        self.assertTrue(data["comparison"]["plays"]["available"])
        self.assertEqual(data["comparison"]["plays"]["previous"], 200)
        self.assertEqual(data["accounts"]["plays_growth"][0]["account"]["id"], account_id)
        self.assertTrue(data["accounts"]["plays_growth"][0]["has_comparison"])
        self.assertEqual(data["videos"]["gainers"][0]["video"]["id"], video_db_id)

        account_export = self.client.get("/api/v2/export/insights.csv?days=7&section=accounts")
        self.assertEqual(account_export.status_code, 200)
        self.assertIn("insight-account", account_export.text)
        self.assertIn("previous_plays_delta", account_export.text)

        video_export = self.client.get("/api/v2/export/insights.csv?days=7&section=videos")
        self.assertEqual(video_export.status_code, 200)
        self.assertIn("insight-video", video_export.text)

        anomaly_export = self.client.get("/api/v2/export/insights.csv?days=7&section=anomalies")
        self.assertEqual(anomaly_export.status_code, 200)
        self.assertIn("insight-account", anomaly_export.text)

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
            now = datetime.now(timezone.utc)
            video = Video(
                account_id=account_id,
                video_id="123",
                title="Test video",
                play_count=200,
                like_count=20,
                published_at=now,
                last_sync_at=now,
            )
            db.add(video)
            db.flush()
            db.add(VideoStatsHistory(video_id=video.id, play_count=100, recorded_at=now))
            db.add(
                Video(
                    account_id=account_id,
                    video_id="",
                    title="Missing link low play",
                    play_count=20,
                    like_count=1,
                    published_at=None,
                    last_sync_at=None,
                )
            )
            db.add(
                Video(
                    account_id=account_id,
                    video_id="hot-video",
                    title="Hot video",
                    play_count=20_000,
                    like_count=2_000,
                    published_at=now - timedelta(days=10),
                    last_sync_at=now - timedelta(days=8),
                )
            )
            alert = Alert(account_id=account_id, title="Play surge", message="Test", is_read=0)
            db.add(alert)
            db.add(Alert(account_id=account_id, level="error", title="Provider error", message="Test", is_read=0))
            db.add(SyncLog(account_id=account_id, status="success", message="Done", provider_used="tikwm"))
            db.add(SyncLog(account_id=account_id, status="error", message="Provider failed", provider_used="direct"))
            db.add(
                ProviderHealth(
                    provider="tikwm",
                    success_count=9,
                    failure_count=1,
                    consecutive_failures=0,
                    avg_latency_ms=123.4,
                    last_success_at=datetime.now(timezone.utc),
                )
            )
            db.commit()
            video_id, alert_id = video.id, alert.id
        finally:
            db.close()

        videos = self.client.get(f"/api/v2/videos?account_id={account_id}&q=Test&page=1&per_page=1")
        self.assertEqual(videos.status_code, 200)
        self.assertEqual(videos.json()["meta"]["total"], 1)
        self.assertEqual(videos.json()["meta"]["filters"]["q"], "Test")
        self.assertIn("plays_desc", videos.json()["meta"]["sort_options"])
        self.assertIn("has_link", videos.json()["meta"]["options"])
        missing_links = self.client.get(f"/api/v2/videos?account_id={account_id}&has_link=no")
        self.assertEqual(missing_links.status_code, 200)
        self.assertEqual(missing_links.json()["meta"]["total"], 1)
        self.assertEqual(missing_links.json()["data"][0]["title"], "Missing link low play")
        low_play = self.client.get(f"/api/v2/videos?account_id={account_id}&metric=low_plays")
        self.assertEqual(low_play.json()["meta"]["total"], 1)
        high_play = self.client.get(f"/api/v2/videos?account_id={account_id}&metric=high_plays")
        self.assertEqual(high_play.json()["meta"]["total"], 1)
        stale = self.client.get(f"/api/v2/videos?account_id={account_id}&sync=stale_7d")
        self.assertEqual(stale.json()["meta"]["total"], 2)
        sorted_videos = self.client.get(f"/api/v2/videos?account_id={account_id}&sort=plays_desc")
        self.assertEqual(sorted_videos.json()["data"][0]["video_id"], "hot-video")
        exported_videos = self.client.get(f"/api/v2/export/videos.csv?account_id={account_id}&metric=high_plays")
        self.assertEqual(exported_videos.status_code, 200)
        self.assertIn("hot-video", exported_videos.text)
        self.assertNotIn("Missing link low play", exported_videos.text)
        detail = self.client.get(f"/api/v2/videos/{video_id}?history_per_page=1")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["data"]["history_meta"]["total"], 1)
        account = self.client.get(f"/api/v2/accounts/{account_id}")
        self.assertEqual(account.json()["data"]["videos_meta"]["total"], 3)
        self.assertEqual(account.json()["data"]["logs_meta"]["total"], 2)

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
        self.assertEqual(logs.json()["meta"]["total"], 2)
        success_logs = self.client.get("/api/v2/sync/logs?status=success&provider=tikwm&q=Done")
        self.assertEqual(success_logs.status_code, 200)
        self.assertEqual(success_logs.json()["meta"]["total"], 1)
        self.assertEqual(success_logs.json()["data"][0]["provider_used"], "tikwm")
        self.assertEqual(success_logs.json()["meta"]["filters"]["status"], "success")

        settings = self.client.patch("/api/v2/settings", json={"monitor": {"interval_minutes": 45}})
        self.assertEqual(settings.status_code, 200)
        self.assertEqual(settings.json()["data"]["monitor"]["interval_minutes"], 45)

        imported = self.client.post("/api/v2/import/accounts", json={"raw": "imported-account", "sync": False})
        self.assertEqual(imported.status_code, 200)
        self.assertEqual(imported.json()["data"]["added"], 1)
        providers = self.client.get("/api/v2/providers/health")
        self.assertTrue(providers.json()["ok"])
        self.assertEqual(providers.json()["data"][0]["success_rate"], 90.0)
        self.assertIn("last_success_at", providers.json()["data"][0])


if __name__ == "__main__":
    unittest.main()
