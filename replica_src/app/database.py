from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker

from app.paths import DB_PATH

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record) -> None:
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.close()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# SQLite 单条 SQL 绑定变量上限通常为 999，批量 IN 查询需分块。
SQLITE_IN_CHUNK_SIZE = 900


def chunked(seq, size: int = SQLITE_IN_CHUNK_SIZE):
    """将序列按固定大小分块，避免 IN (...) 超出 SQLite 变量上限。"""
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(128), unique=True, nullable=False, index=True)
    nickname = Column(String(256), default="")
    sec_uid = Column(String(256), default="")
    follower_count = Column(Integer, default=0)
    following_count = Column(Integer, default=0)
    total_likes = Column(Integer, default=0)
    video_count = Column(Integer, default=0)
    avatar_url = Column(Text, default="")
    group_name = Column(String(64), default="", index=True)
    phone = Column(String(64), default="", index=True)
    employee = Column(String(64), default="", index=True)
    note = Column(String(256), default="")
    is_active = Column(Integer, default=1)
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    videos = relationship("Video", back_populates="account", cascade="all, delete-orphan")
    sync_logs = relationship("SyncLog", back_populates="account", cascade="all, delete-orphan")
    stats_history = relationship(
        "AccountStatsHistory", back_populates="account", cascade="all, delete-orphan"
    )
    alerts = relationship("Alert", back_populates="account", cascade="all, delete-orphan")


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    video_id = Column(String(64), nullable=False, index=True)
    title = Column(Text, default="")
    cover_url = Column(Text, default="")
    play_count = Column(Integer, default=0)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    share_count = Column(Integer, default=0)
    published_at = Column(DateTime, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="videos")
    stats_history = relationship(
        "VideoStatsHistory", back_populates="video", cascade="all, delete-orphan"
    )
    alerts = relationship("Alert", back_populates="video", cascade="all, delete-orphan")


class VideoStatsHistory(Base):
    __tablename__ = "video_stats_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False, index=True)
    play_count = Column(Integer, default=0)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    share_count = Column(Integer, default=0)
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    video = relationship("Video", back_populates="stats_history")


class AccountStatsHistory(Base):
    __tablename__ = "account_stats_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    follower_count = Column(Integer, default=0)
    following_count = Column(Integer, default=0)
    total_likes = Column(Integer, default=0)
    video_count = Column(Integer, default=0)
    total_plays = Column(Integer, default=0)
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    account = relationship("Account", back_populates="stats_history")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=True, index=True)
    level = Column(String(16), default="info")
    alert_type = Column(String(32), default="")
    title = Column(String(256), default="")
    message = Column(Text, default="")
    is_read = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    account = relationship("Account", back_populates="alerts")
    video = relationship("Video", back_populates="alerts")


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)
    status = Column(String(32), default="success")
    message = Column(Text, default="")
    videos_updated = Column(Integer, default=0)
    duration_seconds = Column(Float, default=0)
    provider_used = Column(String(128), default="")
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    account = relationship("Account", back_populates="sync_logs")


class ProviderHealth(Base):
    __tablename__ = "provider_health"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(64), unique=True, nullable=False)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    consecutive_failures = Column(Integer, default=0)
    avg_latency_ms = Column(Float, default=0)
    last_success_at = Column(DateTime, nullable=True)
    last_failure_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(64), default="", index=True)
    detail = Column(Text, default="")
    actor = Column(String(64), default="system")
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


def init_db() -> None:
    from app.migrate import migrate_db

    migrate_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
