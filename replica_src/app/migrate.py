from sqlalchemy import text

from app.database import engine


def migrate_db() -> None:
    """轻量迁移：为已有数据库补充新字段和新表。"""
    from app.database import Base

    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(accounts)")).fetchall()}
        if "group_name" not in cols:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN group_name VARCHAR(64) DEFAULT ''"))
        if "note" not in cols:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN note VARCHAR(256) DEFAULT ''"))
        if "phone" not in cols:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN phone VARCHAR(64) DEFAULT ''"))
        if "employee" not in cols:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN employee VARCHAR(64) DEFAULT ''"))

        sync_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(sync_logs)")).fetchall()}
        if sync_cols and "provider_used" not in sync_cols:
            conn.execute(text("ALTER TABLE sync_logs ADD COLUMN provider_used VARCHAR(128) DEFAULT ''"))
        if sync_cols and "retry_count" not in sync_cols:
            conn.execute(text("ALTER TABLE sync_logs ADD COLUMN retry_count INTEGER DEFAULT 0"))

        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_video_stats_history_video_recorded "
                "ON video_stats_history (video_id, recorded_at)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_videos_account_published "
                "ON videos (account_id, published_at)"
            )
        )
